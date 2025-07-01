const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const subscriptionController = require('../controllers/subscriptionController');
const { webhookLimiter } = require('../middleware/rateLimiter');

// Apply rate limiting to webhook routes
router.use(webhookLimiter);

// MercadoPago webhook endpoint
router.post('/mercadopago', webhookController.handleMercadoPagoWebhook);

// MercadoPago webhook endpoint for subscriptions
router.post('/subscription', subscriptionController.processWebhook);

module.exports = router;