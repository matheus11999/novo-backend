const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const { webhookLimiter } = require('../middleware/rateLimiter');

// Apply rate limiting to webhook routes
router.use(webhookLimiter);

// MercadoPago webhook endpoint
router.post('/mercadopago', webhookController.handleMercadoPagoWebhook);

module.exports = router;