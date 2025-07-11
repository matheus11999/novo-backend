const express = require('express');
const router = express.Router();
const mikrotikController = require('../controllers/mikrotikController');
const authenticateUser = require('../middleware/auth');

// Rota para testar cache de templates (apenas para desenvolvimento)
router.post('/template/test-cache', (req, res) => {
  try {
    global.templateCache = global.templateCache || new Map();
    const testContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Hotspot Login - Test Provider</title>
</head>
<body>
    <h1>Bem-vindo ao Test Provider</h1>
    <form method="post" action="/login">
        <input type="text" name="username" placeholder="Usuário" required>
        <input type="password" name="password" placeholder="Senha" required>
        <input type="submit" value="Conectar">
    </form>
</body>
</html>`;
    
    global.templateCache.set('test_template_123.html', testContent);
    
    res.json({
      success: true,
      message: 'Template de teste adicionado ao cache',
      url: 'http://localhost:3001/api/mikrotik/template/test_template_123.html'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para servir templates (sem autenticação para permitir fetch do MikroTik)
router.get('/template/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    
    // Handle preview images directly from filesystem
    if (filename.includes('_preview.png')) {
      const fs = require('fs');
      const path = require('path');
      
      // Extract template ID from filename (e.g., template1_preview.png -> template1)
      const templateId = filename.replace('_preview.png', '');
      const previewPath = path.join(__dirname, '../../templates', templateId, 'preview.png');
      
      if (fs.existsSync(previewPath)) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        console.log(`[TEMPLATE-ROUTE] Serving preview image: ${templateId} from ${previewPath}`);
        return fs.createReadStream(previewPath).pipe(res);
      } else {
        return res.status(404).json({
          success: false,
          error: 'Preview image not found'
        });
      }
    }
    
    // Check if template exists in cache
    const templateCache = global.templateCache || new Map();
    const templateContent = templateCache.get(filename);
    
    if (!templateContent) {
      return res.status(404).json({
        success: false,
        error: 'Template não encontrado ou expirado'
      });
    }
    
    // Determinar o tipo de conteúdo baseado na extensão do arquivo
    const extension = filename.split('.').pop().toLowerCase();
    let contentType = 'text/html; charset=utf-8';
    
    switch (extension) {
      case 'js':
        contentType = 'application/javascript; charset=utf-8';
        break;
      case 'css':
        contentType = 'text/css; charset=utf-8';
        break;
      case 'json':
        contentType = 'application/json; charset=utf-8';
        break;
      case 'txt':
        contentType = 'text/plain; charset=utf-8';
        break;
      case 'png':
        contentType = 'image/png';
        break;
      case 'jpg':
      case 'jpeg':
        contentType = 'image/jpeg';
        break;
      case 'gif':
        contentType = 'image/gif';
        break;
      case 'svg':
        contentType = 'image/svg+xml';
        break;
      case 'ico':
        contentType = 'image/x-icon';
        break;
      case 'xml':
        contentType = 'application/xml; charset=utf-8';
        break;
      case 'xsd':
        contentType = 'application/xml; charset=utf-8';
        break;
      default:
        contentType = 'text/html; charset=utf-8';
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Para arquivos de imagem em base64, processar diferente
    if (typeof templateContent === 'string' && templateContent.startsWith('data:image')) {
      // Extrair dados base64
      const base64Data = templateContent.split(',')[1];
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      res.setHeader('Content-Length', imageBuffer.length);
      res.end(imageBuffer);
      
      console.log(`Template image served: ${filename}, size: ${imageBuffer.length} bytes`);
    } else {
      // Enviar conteúdo de texto normalmente
      res.send(templateContent);
      
      console.log(`Template served: ${filename}, type: ${contentType}, size: ${templateContent.length} bytes`);
    }
    
  } catch (error) {
    console.error('Error serving template:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Rotas para templates (sem autenticação para permitir acesso do frontend)
router.get('/templates', mikrotikController.getTemplates);
router.get('/templates/:templateId/preview', mikrotikController.getTemplatePreview);
router.get('/templates/:templateId/html', mikrotikController.getTemplateHtml);
router.get('/templates/:templateId', mikrotikController.getTemplateDetails);
router.get('/templates/:templateId/files', mikrotikController.getTemplateFiles);

// Rotas para geração de scripts RSC (sem autenticação para download direto)
router.get('/generate/install/:mikrotikId', mikrotikController.generateInstallRsc);
router.get('/generate/cleanup/:mikrotikId', mikrotikController.generateCleanupRsc);
router.get('/generate/uninstall/:mikrotikId', mikrotikController.generateUninstallRsc);

// Rota para notificação de instalação (sem autenticação para MikroTik)
router.get('/notify-install/:mikrotikId', (req, res) => {
  const { mikrotikId } = req.params;
  console.log(`[MIKROPIX-INSTALL] Instalação notificada para MikroTik ID: ${mikrotikId}`);
  res.json({ success: true, message: 'Instalação notificada com sucesso', mikrotikId });
});

// Health check endpoint (sem autenticação)
router.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'MikroPix API'
  });
});

// Apply authentication to all other routes
router.use(authenticateUser);

router.get('/check-connection/:mikrotikId', mikrotikController.checkConnection);
router.get('/basic-info/:mikrotikId', mikrotikController.getBasicSystemInfo);
router.get('/essential-info/:mikrotikId', mikrotikController.getEssentialSystemInfo);
router.get('/cpu-memory/:mikrotikId', mikrotikController.getCpuMemoryStats);
router.get('/stats/:mikrotikId', mikrotikController.getStats);
router.get('/hotspot/users/:mikrotikId', mikrotikController.getHotspotUsers);
router.get('/hotspot/active-users/:mikrotikId', mikrotikController.getActiveUsers);
router.get('/hotspot/profiles/:mikrotikId', mikrotikController.getHotspotProfiles);
router.post('/hotspot/profiles/:mikrotikId', mikrotikController.createHotspotProfile);
router.put('/hotspot/profiles/:mikrotikId/:profileId', mikrotikController.updateHotspotProfile);
router.delete('/hotspot/profiles/:mikrotikId/:profileId', mikrotikController.deleteHotspotProfile);
router.post('/hotspot/users/:mikrotikId', mikrotikController.createHotspotUser);
router.post('/hotspot/users/bulk/:mikrotikId', mikrotikController.createBulkHotspotUsers);
router.put('/hotspot/users/:mikrotikId/:userId', mikrotikController.updateHotspotUser);
router.delete('/hotspot/users/:mikrotikId/:userId', mikrotikController.deleteHotspotUser);
router.post('/hotspot/disconnect/:mikrotikId/:userId', mikrotikController.disconnectUser);
router.get('/system/info/:mikrotikId', mikrotikController.getSystemInfo);
router.get('/system/detailed-info/:mikrotikId', mikrotikController.getDetailedSystemInfo);
router.get('/system/resource/:mikrotikId', mikrotikController.getSystemResource);
router.get('/system/interfaces/:mikrotikId', mikrotikController.getSystemInterfaces);
router.post('/system/restart/:mikrotikId', mikrotikController.restartSystem);

// Rotas para servidores hotspot
router.get('/hotspot/servers/:mikrotikId', mikrotikController.getHotspotServers);
router.post('/hotspot/servers/:mikrotikId', mikrotikController.createHotspotServer);
router.put('/hotspot/servers/:mikrotikId/:serverId', mikrotikController.updateHotspotServer);
router.delete('/hotspot/servers/:mikrotikId/:serverId', mikrotikController.deleteHotspotServer);

// Rotas para server profiles
router.get('/hotspot/server-profiles/:mikrotikId', mikrotikController.getHotspotServerProfiles);
router.post('/hotspot/server-profiles/:mikrotikId', mikrotikController.createHotspotServerProfile);
router.put('/hotspot/server-profiles/:mikrotikId/:serverProfileId', mikrotikController.updateHotspotServerProfile);
router.delete('/hotspot/server-profiles/:mikrotikId/:serverProfileId', mikrotikController.deleteHotspotServerProfile);

// Rota para aplicar templates (com autenticação)
router.post('/templates/apply', mikrotikController.applyTemplate);

// Rotas para templates personalizados de senhas
router.get('/password-template/:mikrotikId', mikrotikController.getCustomPasswordTemplate);
router.post('/password-template/:mikrotikId', mikrotikController.saveCustomPasswordTemplate);

// Rotas para WireRest proxy (corrigir CORS)
router.get('/wirerest/interface', mikrotikController.getWireRestInterface);
router.get('/wirerest/peers', mikrotikController.getWireRestPeers);
router.post('/wirerest/peers', mikrotikController.createWireRestPeer);
router.put('/wirerest/peers/:publicKey', mikrotikController.updateWireRestPeer);
router.delete('/wirerest/peers/:publicKey', mikrotikController.deleteWireRestPeer);

// Rota para gerar configuração WireGuard
router.get('/wireguard/config/:mikrotikId', mikrotikController.generateWireGuardConfig);

module.exports = router;