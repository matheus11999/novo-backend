const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const subscriptionPaymentService = require('../services/subscriptionPaymentService');
const authenticateUser = require('../middleware/auth');

// Rota para criar pagamento de assinatura
router.post('/create-payment', authenticateUser, subscriptionController.createPayment);

// Rota para verificar status do pagamento
router.get('/payment-status/:payment_id', authenticateUser, subscriptionController.getPaymentStatus);

// Rotas administrativas para gerenciar o serviço de polling
router.get('/polling/status', (req, res) => {
    const status = subscriptionPaymentService.getStatus();
    res.json({
        success: true,
        data: status
    });
});

router.post('/polling/start', (req, res) => {
    subscriptionPaymentService.start();
    res.json({
        success: true,
        message: 'Subscription payment polling service started'
    });
});

router.post('/polling/stop', (req, res) => {
    subscriptionPaymentService.stop();
    res.json({
        success: true,
        message: 'Subscription payment polling service stopped'
    });
});

// Rota para verificação manual de um pagamento específico
router.post('/verify-payment/:payment_id', authenticateUser, async (req, res) => {
    try {
        const { payment_id } = req.params;
        await subscriptionPaymentService.verifySpecificPayment(payment_id);
        res.json({
            success: true,
            message: 'Payment verification completed'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router; 