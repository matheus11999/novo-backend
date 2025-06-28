const express = require('express');
const router = express.Router();
const mikrotikRetryController = require('../controllers/mikrotikRetryController');
const auth = require('../middleware/auth');

// Rotas para gerenciamento de retry de criação de usuários MikroTik

// Retry de todas as criações falhadas
router.post('/retry-failed', auth, mikrotikRetryController.retryFailedCreations);

// Buscar vendas com criação falhada
router.get('/failed-creations', auth, mikrotikRetryController.getFailedCreations);

// Estatísticas de criação
router.get('/creation-stats', auth, mikrotikRetryController.getCreationStats);

// Retry de venda específica
router.post('/retry/:vendaId', auth, mikrotikRetryController.retrySpecificVenda);

module.exports = router;