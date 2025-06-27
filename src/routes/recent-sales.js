const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const authenticateUser = require('../middleware/auth');

// Middleware de autenticação opcional para este endpoint
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateUser(req, res, next);
  }
  next();
};

router.use(optionalAuth);

// Endpoint para vendas recentes
router.post('/', async (req, res) => {
  try {
    // Por enquanto, retorna uma resposta vazia para evitar erro 404
    res.json({
      success: true,
      data: [],
      message: 'Endpoint de vendas recentes - em desenvolvimento'
    });
  } catch (error) {
    console.error('Error in recent-sales:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/', async (req, res) => {
  try {
    // Buscar vendas recentes do Supabase (quando implementado)
    res.json({
      success: true,
      data: [],
      message: 'Vendas recentes - em desenvolvimento'
    });
  } catch (error) {
    console.error('Error fetching recent-sales:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router; 