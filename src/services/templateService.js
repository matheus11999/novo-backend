const fs = require('fs');
const path = require('path');

class TemplateService {
  constructor() {
    this.templatesPath = path.join(__dirname, '../../templates');
  }

  // Obter lista de templates disponíveis
  getAvailableTemplates() {
    try {
      const templateDirs = fs.readdirSync(this.templatesPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      const templates = [];

      for (const templateDir of templateDirs) {
        const templatePath = path.join(this.templatesPath, templateDir);
        const templateConfig = this.getTemplateConfig(templateDir);
        
        if (templateConfig) {
          templates.push({
            id: templateDir,
            name: templateConfig.name,
            description: templateConfig.description,
            variables: templateConfig.variables,
            preview: templateConfig.preview
          });
        }
      }

      return templates;
    } catch (error) {
      console.error('Erro ao listar templates:', error);
      return [];
    }
  }

  // Obter configuração de um template específico
  getTemplateConfig(templateId) {
    const configs = {
      basic: {
        name: 'Template Básico',
        description: 'Template simples e limpo para hotspot',
        preview: '/templates/basic/preview.png',
        variables: [
          {
            key: 'PROVIDER_NAME',
            label: 'Nome do Provedor',
            type: 'text',
            required: true,
            placeholder: 'Ex: MikroPix Internet'
          },
          {
            key: 'LOGO_URL',
            label: 'URL do Logo',
            type: 'url',
            required: false,
            placeholder: 'https://exemplo.com/logo.png'
          },
          {
            key: 'PRIMARY_COLOR',
            label: 'Cor Primária',
            type: 'color',
            required: false,
            placeholder: '#3b82f6'
          }
        ]
      },
      mobile: {
        name: 'Template Mobile',
        description: 'Template otimizado para dispositivos móveis',
        preview: '/templates/mobile/preview.png',
        variables: [
          {
            key: 'PROVIDER_NAME',
            label: 'Nome do Provedor',
            type: 'text',
            required: true,
            placeholder: 'Ex: MikroPix Internet'
          },
          {
            key: 'LOGO_URL',
            label: 'URL do Logo',
            type: 'url',
            required: false,
            placeholder: 'https://exemplo.com/logo.png'
          },
          {
            key: 'PRIMARY_COLOR',
            label: 'Cor Primária',
            type: 'color',
            required: false,
            placeholder: '#3b82f6'
          },
          {
            key: 'WELCOME_MESSAGE',
            label: 'Mensagem de Boas-vindas',
            type: 'text',
            required: false,
            placeholder: 'Bem-vindo ao nosso hotspot!'
          }
        ]
      },
      business: {
        name: 'Template Empresarial',
        description: 'Template profissional para empresas',
        preview: '/templates/business/preview.png',
        variables: [
          {
            key: 'PROVIDER_NAME',
            label: 'Nome do Provedor',
            type: 'text',
            required: true,
            placeholder: 'Ex: MikroPix Internet'
          },
          {
            key: 'LOGO_URL',
            label: 'URL do Logo',
            type: 'url',
            required: false,
            placeholder: 'https://exemplo.com/logo.png'
          },
          {
            key: 'PRIMARY_COLOR',
            label: 'Cor Primária',
            type: 'color',
            required: false,
            placeholder: '#3b82f6'
          },
          {
            key: 'COMPANY_PHONE',
            label: 'Telefone da Empresa',
            type: 'text',
            required: false,
            placeholder: '(11) 99999-9999'
          },
          {
            key: 'SUPPORT_EMAIL',
            label: 'Email de Suporte',
            type: 'text',
            required: false,
            placeholder: 'suporte@empresa.com'
          }
        ]
      }
    };

    return configs[templateId] || null;
  }

  // Obter todos os arquivos de um template recursivamente
  getTemplateFiles(templateId) {
    const templatePath = path.join(this.templatesPath, templateId);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template ${templateId} não encontrado`);
    }

    const files = [];
    this.scanDirectoryRecursive(templatePath, templatePath, files);
    
    return files.filter(file => 
      !file.name.includes('preview.') && // Excluir previews
      !file.name.includes('node_modules') // Excluir node_modules
    );
  }

  // Escanear diretório recursivamente
  scanDirectoryRecursive(currentPath, basePath, files) {
    const items = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(currentPath, item.name);
      const relativePath = path.relative(basePath, itemPath);

      if (item.isDirectory()) {
        // Recursivamente escanear subdiretórios
        this.scanDirectoryRecursive(itemPath, basePath, files);
      } else {
        // Adicionar arquivo à lista
        files.push({
          name: relativePath.replace(/\\/g, '/'), // Normalizar separadores
          fullPath: itemPath,
          relativePath: relativePath.replace(/\\/g, '/'),
          size: fs.statSync(itemPath).size
        });
      }
    }
  }

  // Processar template com substituição de variáveis
  async processTemplate(templateId, variables, mikrotikId) {
    try {
      const templateFiles = this.getTemplateFiles(templateId);
      const processedFiles = [];

      for (const file of templateFiles) {
        const content = await this.processFileContent(file.fullPath, variables, mikrotikId);
        
        processedFiles.push({
          name: file.relativePath,
          content: content,
          path: `/flash/mikropix/${file.relativePath}`,
          originalPath: file.fullPath
        });
      }

      return processedFiles;
    } catch (error) {
      console.error('Erro ao processar template:', error);
      throw error;
    }
  }

  // Processar conteúdo de um arquivo
  async processFileContent(filePath, variables, mikrotikId) {
    try {
      const extension = path.extname(filePath).toLowerCase();
      
      // Para arquivos de imagem, ler como buffer e converter para base64
      if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'].includes(extension)) {
        const imageBuffer = fs.readFileSync(filePath);
        const mimeType = this.getMimeType(extension);
        return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
      }

      // Para arquivos de texto, ler como string e processar variáveis
      let content = fs.readFileSync(filePath, 'utf8');

      // Substituir variáveis do usuário
      if (variables && typeof variables === 'object') {
        Object.entries(variables).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            content = content.replace(regex, value);
          }
        });
      }

      // Substituir variáveis automáticas do sistema
      content = content.replace(/{{MIKROTIK_ID}}/g, mikrotikId || '');
      content = content.replace(/{{API_URL}}/g, process.env.BASE_URL || '');
      content = content.replace(/{{TIMESTAMP}}/g, new Date().toISOString());

      return content;
    } catch (error) {
      console.error(`Erro ao processar arquivo ${filePath}:`, error);
      throw error;
    }
  }

  // Obter MIME type baseado na extensão
  getMimeType(extension) {
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  // Validar variáveis obrigatórias
  validateVariables(templateId, variables) {
    const templateConfig = this.getTemplateConfig(templateId);
    
    if (!templateConfig) {
      throw new Error(`Template ${templateId} não encontrado`);
    }

    const requiredVariables = templateConfig.variables.filter(v => v.required);
    const missingVariables = [];

    for (const variable of requiredVariables) {
      if (!variables[variable.key] || variables[variable.key].trim() === '') {
        missingVariables.push(variable.label);
      }
    }

    if (missingVariables.length > 0) {
      throw new Error(`Variáveis obrigatórias não preenchidas: ${missingVariables.join(', ')}`);
    }

    return true;
  }

  // Obter estatísticas de um template
  getTemplateStats(templateId) {
    try {
      const templateFiles = this.getTemplateFiles(templateId);
      const stats = {
        totalFiles: templateFiles.length,
        totalSize: templateFiles.reduce((sum, file) => sum + file.size, 0),
        fileTypes: {}
      };

      // Contar tipos de arquivo
      templateFiles.forEach(file => {
        const extension = path.extname(file.name).toLowerCase() || 'no-extension';
        stats.fileTypes[extension] = (stats.fileTypes[extension] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('Erro ao obter estatísticas do template:', error);
      return null;
    }
  }
}

module.exports = new TemplateService();