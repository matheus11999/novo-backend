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
    
    // Check if template exists in cache
    const templateCache = global.templateCache || new Map();
    const templateContent = templateCache.get(filename);
    
    if (!templateContent) {
      return res.status(404).json({
        success: false,
        error: 'Template não encontrado ou expirado'
      });
    }
    
    // Set appropriate headers for HTML content
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Send the template content
    res.send(templateContent);
    
    console.log(`Template served: ${filename}, size: ${templateContent.length} bytes`);
    
  } catch (error) {
    console.error('Error serving template:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Apply authentication to all other routes
router.use(authenticateUser);

router.get('/stats/:mikrotikId', mikrotikController.getStats);
router.get('/hotspot/users/:mikrotikId', mikrotikController.getHotspotUsers);
router.get('/hotspot/active-users/:mikrotikId', mikrotikController.getActiveUsers);
router.get('/hotspot/profiles/:mikrotikId', mikrotikController.getHotspotProfiles);
router.post('/hotspot/profiles/:mikrotikId', mikrotikController.createHotspotProfile);
router.put('/hotspot/profiles/:mikrotikId/:profileId', mikrotikController.updateHotspotProfile);
router.delete('/hotspot/profiles/:mikrotikId/:profileId', mikrotikController.deleteHotspotProfile);
router.post('/hotspot/users/:mikrotikId', mikrotikController.createHotspotUser);
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

// Rotas para templates
router.post('/templates/apply', mikrotikController.applyTemplate);


module.exports = router;