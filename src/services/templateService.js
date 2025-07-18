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

  // Obter HTML puro de um template (sem processamento de variáveis)
  getTemplateHtml(templateId) {
    try {
      const templatePath = path.join(this.templatesPath, templateId, 'login.html');
      
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template HTML não encontrado: ${templateId}`);
      }
      
      return fs.readFileSync(templatePath, 'utf8');
    } catch (error) {
      console.error(`Erro ao ler template HTML ${templateId}:`, error);
      throw error;
    }
  }

  // Obter configuração de um template específico
  getTemplateConfig(templateId) {
    const configs = {
      template1: {
        name: 'Template 1',
        description: 'Template simples e limpo para hotspot',
        preview: `${process.env.BASE_URL || 'https://api.mikropix.online'}/api/mikrotik/templates/template1/preview`,
        variables: [
          {
            key: 'PRIMARY_COLOR',
            label: 'Cor Primária',
            type: 'color',
            required: false,
            placeholder: '#3b82f6'
          },
          {
            key: 'LOGO_ICON',
            label: 'Ícone/Logo',
            type: 'text',
            required: false,
            placeholder: '🌐 ou <img src="logo.png" alt="Logo">'
          },
          {
            key: 'WELCOME_TITLE',
            label: 'Título de Boas-vindas',
            type: 'text',
            required: false,
            placeholder: 'Bem-vindo à nossa rede'
          },
          {
            key: 'WELCOME_MESSAGE',
            label: 'Mensagem de Boas-vindas',
            type: 'text',
            required: false,
            placeholder: 'Conecte-se para acessar a internet'
          },
          {
            key: 'DEBUG_MODE',
            label: 'Modo Debug',
            type: 'select',
            required: false,
            options: [
              { value: 'true', label: 'Ativado' },
              { value: 'false', label: 'Desativado' }
            ],
            placeholder: 'false'
          },
          {
            key: 'DEBUG_MODE',
            label: 'Modo Debug',
            type: 'select',
            required: false,
            options: [
              { value: 'true', label: 'Ativado' },
              { value: 'false', label: 'Desativado' }
            ],
            placeholder: 'false'
          }
        ]
      },
      template2: {
        name: 'Template 2',
        description: 'Template otimizado para dispositivos móveis',
        preview: `${process.env.BASE_URL || 'https://api.mikropix.online'}/api/mikrotik/templates/template2/preview`,
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
          },
          {
            key: 'DEBUG_MODE',
            label: 'Modo Debug',
            type: 'select',
            required: false,
            options: [
              { value: 'true', label: 'Ativado' },
              { value: 'false', label: 'Desativado' }
            ],
            placeholder: 'false'
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

      console.log(`[TEMPLATE-SERVICE] Processando ${templateFiles.length} arquivo(s) do template ${templateId}:`);
      templateFiles.forEach(f => {
        console.log(`  - ${f.relativePath} (${f.size} bytes)`);
      });

      for (const file of templateFiles) {
        const content = await this.processFileContent(file.fullPath, variables, mikrotikId, templateId);
        
        processedFiles.push({
          name: file.relativePath,
          content: content,
          path: `/flash/mikropix2/${file.relativePath}`,
          originalPath: file.fullPath
        });
      }

      console.log(`[TEMPLATE-SERVICE] Template processado com ${processedFiles.length} arquivo(s):`);
      processedFiles.forEach(f => {
        console.log(`  - ${f.name} -> ${f.path}`);
      });

      return processedFiles;
    } catch (error) {
      console.error('Erro ao processar template:', error);
      throw error;
    }
  }

  // Processar conteúdo de um arquivo
  async processFileContent(filePath, variables, mikrotikId, templateId) {
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

      console.log(`[TEMPLATE-SERVICE] Processando arquivo: ${filePath}`);
      console.log(`[TEMPLATE-SERVICE] Tamanho do conteúdo: ${content.length} caracteres`);

      // PRIMEIRO: Substituir variáveis automáticas do sistema (mais importantes)
      const systemVariables = {
        'MIKROTIK_ID': mikrotikId || '',
        'API_URL': process.env.BASE_URL || 'https://api.mikropix.online',
        'TIMESTAMP': new Date().toISOString()
      };

      console.log(`[TEMPLATE-SERVICE] Substituindo variáveis do sistema:`, systemVariables);
      
      Object.entries(systemVariables).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        const matches = content.match(regex);
        if (matches) {
          console.log(`[TEMPLATE-SERVICE] Encontradas ${matches.length} ocorrências de {{${key}}}, substituindo por: ${value}`);
          content = content.replace(regex, value);
        }
      });

      // SEGUNDO: Obter configuração do template para valores padrão
      const templateConfig = templateId ? this.getTemplateConfig(templateId) : null;
      const templateVariables = templateConfig ? templateConfig.variables : [];

      // TERCEIRO: Substituir variáveis do usuário
      if (variables && typeof variables === 'object') {
        console.log(`[TEMPLATE-SERVICE] Substituindo variáveis do usuário:`, variables);
        Object.entries(variables).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            const matches = content.match(regex);
            if (matches) {
              console.log(`[TEMPLATE-SERVICE] Encontradas ${matches.length} ocorrências de {{${key}}}, substituindo por: ${value}`);
              content = content.replace(regex, value);
            }
          }
        });
      }

      // QUARTO: Aplicar valores padrão para variáveis não fornecidas pelo usuário
      templateVariables.forEach(variable => {
        const regex = new RegExp(`{{${variable.key}}}`, 'g');
        const userValue = variables && variables[variable.key];
        
        if (!userValue && variable.placeholder) {
          let defaultValue = variable.placeholder;
          
          // Para tipo select, usar o primeiro valor das opções se não for placeholder simples
          if (variable.type === 'select' && variable.options && variable.options.length > 0) {
            const placeholderOption = variable.options.find(opt => opt.value === variable.placeholder);
            defaultValue = placeholderOption ? placeholderOption.value : variable.options[0].value;
          }
          
          const matches = content.match(regex);
          if (matches) {
            console.log(`[TEMPLATE-SERVICE] Aplicando valor padrão para {{${variable.key}}}: ${defaultValue}`);
            content = content.replace(regex, defaultValue);
          }
        }
      });

      // VERIFICAÇÃO FINAL: Verificar se ainda há variáveis não substituídas
      const remainingVariables = content.match(/{{[^}]+}}/g);
      if (remainingVariables && remainingVariables.length > 0) {
        console.warn(`[TEMPLATE-SERVICE] ⚠️ Variáveis não substituídas encontradas:`, remainingVariables);
      } else {
        console.log(`[TEMPLATE-SERVICE] ✅ Todas as variáveis foram substituídas com sucesso`);
      }

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