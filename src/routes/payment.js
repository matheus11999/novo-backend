const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authenticateApiToken = require('../middleware/auth');
const { createPaymentLimiter, generalLimiter } = require('../middleware/rateLimiter');

// Apply rate limiting to all payment routes
router.use(generalLimiter);

// Get plans for authenticated mikrotik
router.get('/plans', authenticateApiToken, paymentController.getPlans);

// Create a new payment
router.post('/create', authenticateApiToken, createPaymentLimiter, paymentController.createPayment);

// Get payment status
router.get('/status/:payment_id', authenticateApiToken, paymentController.getPaymentStatus);

module.exports = router;