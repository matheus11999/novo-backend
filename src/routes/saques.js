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

module.exports = router;