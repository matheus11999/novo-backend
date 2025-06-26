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

module.exports = router;