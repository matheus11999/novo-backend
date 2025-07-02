const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const authenticateUser = require('../middleware/auth');

// Rota para criar pagamento de assinatura
router.post('/create-payment', authenticateUser, subscriptionController.createPayment);

// Rota para verificar status do pagamento
router.get('/payment-status/:payment_id', authenticateUser, subscriptionController.getPaymentStatus);

module.exports = router; 