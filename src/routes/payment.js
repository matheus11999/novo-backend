const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authenticateUser = require('../middleware/auth');
const { createPaymentLimiter, generalLimiter } = require('../middleware/rateLimiter');

// Apply rate limiting to all payment routes
router.use(generalLimiter);

// Get plans for authenticated user
router.get('/plans', authenticateUser, paymentController.getPlans);

// Create a new payment
router.post('/create', authenticateUser, createPaymentLimiter, paymentController.createPayment);

// Get payment status
router.get('/status/:payment_id', authenticateUser, paymentController.getPaymentStatus);

module.exports = router;