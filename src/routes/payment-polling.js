const express = require('express');
const router = express.Router();
const paymentPollingController = require('../controllers/paymentPollingController');
const auth = require('../middleware/auth');

// Rotas para gerenciamento do polling de pagamentos

// Iniciar serviço de polling
router.post('/start', auth, paymentPollingController.startPolling);

// Parar serviço de polling
router.post('/stop', auth, paymentPollingController.stopPolling);

// Status e estatísticas do polling
router.get('/stats', auth, paymentPollingController.getStats);

// Verificação manual imediata
router.post('/check-now', auth, paymentPollingController.checkNow);

// Processar pagamento específico
router.post('/process/:paymentId', auth, paymentPollingController.processSpecificPayment);

// Listar pagamentos pendentes
router.get('/pending', auth, paymentPollingController.getPendingPayments);

module.exports = router;