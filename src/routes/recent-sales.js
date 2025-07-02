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
    // Buscar vendas PIX recentes (últimas 10)
    const { data: vendasPix, error: pixError } = await supabase
      .from('vendas_pix')
      .select('id, valor_usuario, valor_total, plano_nome, created_at, status, mikrotik_id')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(10);

    // Buscar vouchers recentes (últimos 5)
    const { data: vouchers, error: vouchersError } = await supabase
      .from('voucher')
      .select('id, valor_venda, nome_plano, created_at, mikrotik_id, tipo_voucher')
      .eq('tipo_voucher', 'fisico')
      .order('created_at', { ascending: false })
      .limit(5);

    if (pixError && vouchersError) {
      throw new Error('Erro ao buscar vendas recentes');
    }

    const recentSales = [
      ...(vendasPix || []).map(v => ({
        id: v.id,
        valor: v.valor_usuario || 0, // Usar valor_usuario para PIX
        plano: v.plano_nome || 'Venda PIX',
        data: v.created_at,
        tipo: 'pix',
        mikrotik_id: v.mikrotik_id
      })),
      ...(vouchers || []).map(v => ({
        id: v.id,
        valor: v.valor_venda || 0,
        plano: v.nome_plano || 'Voucher',
        data: v.created_at,
        tipo: 'voucher',
        mikrotik_id: v.mikrotik_id
      }))
    ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()).slice(0, 15);

    res.json({
      success: true,
      data: recentSales,
      message: 'Vendas recentes carregadas com sucesso'
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
    // Buscar vendas PIX recentes (últimas 10)
    const { data: vendasPix, error: pixError } = await supabase
      .from('vendas_pix')
      .select('id, valor_usuario, valor_total, plano_nome, created_at, status, mikrotik_id')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(10);

    // Buscar vouchers recentes (últimos 5)
    const { data: vouchers, error: vouchersError } = await supabase
      .from('voucher')
      .select('id, valor_venda, nome_plano, created_at, mikrotik_id, tipo_voucher')
      .eq('tipo_voucher', 'fisico')
      .order('created_at', { ascending: false })
      .limit(5);

    if (pixError && vouchersError) {
      throw new Error('Erro ao buscar vendas recentes');
    }

    const recentSales = [
      ...(vendasPix || []).map(v => ({
        id: v.id,
        valor: v.valor_usuario || 0, // Usar valor_usuario para PIX
        plano: v.plano_nome || 'Venda PIX',
        data: v.created_at,
        tipo: 'pix',
        mikrotik_id: v.mikrotik_id
      })),
      ...(vouchers || []).map(v => ({
        id: v.id,
        valor: v.valor_venda || 0,
        plano: v.nome_plano || 'Voucher',
        data: v.created_at,
        tipo: 'voucher',
        mikrotik_id: v.mikrotik_id
      }))
    ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()).slice(0, 15);

    res.json({
      success: true,
      data: recentSales,
      message: 'Vendas recentes carregadas com sucesso'
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