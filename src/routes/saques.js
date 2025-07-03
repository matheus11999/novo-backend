const express = require('express');
const router = express.Router();
const saquesController = require('../controllers/saquesController');
const authMiddleware = require('../middleware/auth');

// Aplicar middleware de autenticação em todas as rotas
router.use(authMiddleware);

// Rotas para usuários normais
router.get('/', saquesController.getSaques); // GET /api/saques - Listar saques (próprios ou todos se admin)
router.post('/', saquesController.createSaque); // POST /api/saques - Criar novo saque
router.put('/:id', saquesController.updateSaque); // PUT /api/saques/:id - Atualizar saque (só dados próprios)

// Rotas específicas para admin
router.patch('/:id/approve', saquesController.approveSaque); // PATCH /api/saques/:id/approve - Aprovar saque
router.patch('/:id/reject', saquesController.rejectSaque); // PATCH /api/saques/:id/reject - Rejeitar saque

// Rota para estatísticas (admin)
router.get('/stats', saquesController.getSaquesStats); // GET /api/saques/stats - Estatísticas de saques

// Rotas para saque automático (admin only)
router.get('/auto/eligible', saquesController.getEligibleForAutoWithdrawal); // GET /api/saques/auto/eligible - Usuários elegíveis para saque automático
router.post('/auto/trigger', saquesController.triggerAutomaticWithdrawals); // POST /api/saques/auto/trigger - Triggerar saques automáticos manualmente
router.get('/auto/stats', saquesController.getAutomaticWithdrawalStats); // GET /api/saques/auto/stats - Estatísticas de saques automáticos

module.exports = router;