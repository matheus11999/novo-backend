const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authenticateUser = require('../middleware/auth');
const { createPaymentLimiter, generalLimiter } = require('../middleware/rateLimiter');

// Apply rate limiting to all payment routes
router.use(generalLimiter);

// Get plans for authenticated user
router.get('/plans', authenticateUser, paymentController.getPlans);

// Get plans by mikrotik_id (public endpoint for captive portal)
router.post('/plans-by-mikrotik', paymentController.getPlansByMikrotik);

// Create a new payment (authenticated)
router.post('/create', authenticateUser, createPaymentLimiter, paymentController.createPayment);

// Create a new payment for captive portal (public endpoint)
router.post('/create-captive', createPaymentLimiter, paymentController.createCaptivePayment);

// Get payment status (authenticated)
router.get('/status/:payment_id', authenticateUser, paymentController.getPaymentStatus);

// Get payment status for captive portal (public endpoint)
router.post('/status-captive', paymentController.getCaptivePaymentStatus);

// Check user in captive portal (public endpoint for captive portal integration)
router.post('/captive/check-user', paymentController.checkCaptiveUser);

module.exports = router;