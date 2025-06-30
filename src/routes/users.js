const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// Aplicar middleware de autenticação em todas as rotas
router.use(authMiddleware);

// GET /api/users - Listar todos os usuários (apenas admin)
router.get('/', async (req, res) => {
  try {
    const { user } = req;
    
    // Verificar se é admin
    if (user.role !== 'admin') {
      return res.status(403).json({
        error: 'Acesso negado',
        message: 'Apenas administradores podem listar usuários'
      });
    }

    console.log('[USERS] Admin requesting all users:', user.id);

    // Buscar todos os usuários usando service role (bypassa RLS)
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[USERS] Error fetching users:', error);
      return res.status(500).json({
        error: 'Erro ao buscar usuários',
        details: error.message
      });
    }

    console.log('[USERS] Found users count:', users?.length || 0);

    // Buscar mikrotiks para cada usuário
    const usersWithMikrotiks = await Promise.all(
      (users || []).map(async (user) => {
        const { data: mikrotiks, error: mikrotiksError } = await supabase
          .from('mikrotiks')
          .select('id, nome, ip, ativo, created_at')
          .eq('user_id', user.id);

        if (mikrotiksError) {
          console.warn('[USERS] Error fetching mikrotiks for user:', user.id, mikrotiksError);
        }

        return {
          ...user,
          mikrotiks: mikrotiks || []
        };
      })
    );

    res.json({
      users: usersWithMikrotiks,
      total: usersWithMikrotiks.length
    });

  } catch (error) {
    console.error('[USERS] Error in getUsers:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

// GET /api/users/:id - Buscar usuário específico
router.get('/:id', async (req, res) => {
  try {
    const { user } = req;
    const { id } = req.params;
    
    // Verificar se é admin ou o próprio usuário
    if (user.role !== 'admin' && user.id !== id) {
      return res.status(403).json({
        error: 'Acesso negado',
        message: 'Você só pode ver seu próprio perfil'
      });
    }

    const { data: userData, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !userData) {
      return res.status(404).json({
        error: 'Usuário não encontrado'
      });
    }

    // Buscar mikrotiks do usuário
    const { data: mikrotiks } = await supabase
      .from('mikrotiks')
      .select('id, nome, ip, ativo, created_at')
      .eq('user_id', id);

    res.json({
      user: {
        ...userData,
        mikrotiks: mikrotiks || []
      }
    });

  } catch (error) {
    console.error('[USERS] Error in getUser:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

// PUT /api/users/:id - Atualizar usuário
router.put('/:id', async (req, res) => {
  try {
    const { user } = req;
    const { id } = req.params;
    const updateData = req.body;
    
    // Verificar se é admin ou o próprio usuário
    if (user.role !== 'admin' && user.id !== id) {
      return res.status(403).json({
        error: 'Acesso negado',
        message: 'Você só pode editar seu próprio perfil'
      });
    }

    // Campos que apenas admin pode alterar
    const adminOnlyFields = ['role', 'saldo'];
    if (user.role !== 'admin') {
      adminOnlyFields.forEach(field => {
        if (updateData.hasOwnProperty(field)) {
          delete updateData[field];
        }
      });
    }

    // Atualizar usuário
    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[USERS] Error updating user:', error);
      return res.status(500).json({
        error: 'Erro ao atualizar usuário',
        details: error.message
      });
    }

    res.json({
      message: 'Usuário atualizado com sucesso',
      user: updatedUser
    });

  } catch (error) {
    console.error('[USERS] Error in updateUser:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

// POST /api/users - Criar novo usuário (apenas admin)
router.post('/', async (req, res) => {
  try {
    const { user } = req;
    const { email, password, nome, role = 'user', saldo = 0 } = req.body;
    
    // Verificar se é admin
    if (user.role !== 'admin') {
      return res.status(403).json({
        error: 'Acesso negado',
        message: 'Apenas administradores podem criar usuários'
      });
    }

    // Validar dados obrigatórios
    if (!email || !password || !nome) {
      return res.status(400).json({
        error: 'Dados obrigatórios',
        message: 'Email, senha e nome são obrigatórios'
      });
    }

    // Criar usuário no auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      console.error('[USERS] Error creating auth user:', authError);
      return res.status(400).json({
        error: 'Erro ao criar usuário',
        details: authError.message
      });
    }

    // Criar registro na tabela users
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert([{
        id: authData.user.id,
        email,
        nome,
        role,
        saldo: parseFloat(saldo)
      }])
      .select('*')
      .single();

    if (userError) {
      console.error('[USERS] Error creating user record:', userError);
      // Tentar remover o usuário do auth se falhou na tabela
      await supabase.auth.admin.deleteUser(authData.user.id);
      
      return res.status(500).json({
        error: 'Erro ao criar registro do usuário',
        details: userError.message
      });
    }

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: userData
    });

  } catch (error) {
    console.error('[USERS] Error in createUser:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

// DELETE /api/users/:id - Deletar usuário (apenas admin)
router.delete('/:id', async (req, res) => {
  try {
    const { user } = req;
    const { id } = req.params;
    
    // Verificar se é admin
    if (user.role !== 'admin') {
      return res.status(403).json({
        error: 'Acesso negado',
        message: 'Apenas administradores podem deletar usuários'
      });
    }

    // Não permitir deletar a si mesmo
    if (user.id === id) {
      return res.status(400).json({
        error: 'Operação não permitida',
        message: 'Você não pode deletar seu próprio usuário'
      });
    }

    // Deletar da tabela users (cascade deletará mikrotiks, etc)
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[USERS] Error deleting user:', deleteError);
      return res.status(500).json({
        error: 'Erro ao deletar usuário',
        details: deleteError.message
      });
    }

    // Deletar do auth
    const { error: authError } = await supabase.auth.admin.deleteUser(id);
    
    if (authError) {
      console.warn('[USERS] Error deleting auth user (user record already deleted):', authError);
    }

    res.json({
      message: 'Usuário deletado com sucesso'
    });

  } catch (error) {
    console.error('[USERS] Error in deleteUser:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

module.exports = router;