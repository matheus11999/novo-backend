const express = require('express');
const router = express.Router();
const mikrotikController = require('../controllers/mikrotikController');
const authenticateUser = require('../middleware/auth');

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