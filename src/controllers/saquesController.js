const { supabase } = require('../config/supabase');
const automaticWithdrawalService = require('../services/automaticWithdrawalService');

class SaquesController {
  // Listar saques (próprios para usuários, todos para admin)
  async getSaques(req, res) {
    try {
      const { user } = req;
      const { status, page = 1, limit = 10 } = req.query;
      
      let query = supabase
        .from('saques')
        .select('*');

      // Se não for admin, mostrar apenas próprios saques
      if (user.role !== 'admin') {
        query = query.eq('user_id', user.id);
      }

      // Filtrar por status se especificado
      if (status) {
        query = query.eq('status', status);
      }

      // Paginação
      const offset = (page - 1) * limit;
      query = query
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching saques:', error);
        return res.status(500).json({ 
          error: 'Erro interno do servidor',
          details: error.message 
        });
      }

      // Buscar dados dos usuários para cada saque
      const saquesWithUsers = await Promise.all(
        (data || []).map(async (saque) => {
          // Buscar dados do usuário
          const { data: userData } = await supabase
            .from('users')
            .select('id, nome, email')
            .eq('id', saque.user_id)
            .single();

          // Buscar dados do admin que processou (se houver)
          let adminData = null;
          if (saque.processed_by) {
            const { data: admin } = await supabase
              .from('users')
              .select('id, nome, email')
              .eq('id', saque.processed_by)
              .single();
            adminData = admin;
          }

          return {
            ...saque,
            user: userData,
            admin_user: adminData
          };
        })
      );

      res.json({
        saques: saquesWithUsers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: saquesWithUsers.length,
          pages: Math.ceil(saquesWithUsers.length / limit)
        }
      });

    } catch (error) {
      console.error('Error in getSaques:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor',
        details: error.message 
      });
    }
  }

  // Criar novo saque
  async createSaque(req, res) {
    try {
      const { user } = req;
      const { valor, metodo_pagamento, chave_pix, dados_bancarios, observacoes } = req.body;

      // Validações básicas
      if (!valor || valor < 50) {
        return res.status(400).json({ 
          error: 'Valor mínimo para saque é R$ 50,00' 
        });
      }

      if (!metodo_pagamento || !['pix', 'ted', 'doc'].includes(metodo_pagamento)) {
        return res.status(400).json({ 
          error: 'Método de pagamento inválido' 
        });
      }

      // Verificar se admin não pode fazer saques
      if (user.role === 'admin') {
        return res.status(403).json({ 
          error: 'Administradores não podem solicitar saques. Use o painel de aprovação para gerenciar solicitações dos usuários.' 
        });
      }

      // Validar dados específicos por método
      if (metodo_pagamento === 'pix' && !chave_pix) {
        return res.status(400).json({ 
          error: 'Chave PIX é obrigatória para saques via PIX' 
        });
      }

      if (metodo_pagamento !== 'pix' && !dados_bancarios) {
        return res.status(400).json({ 
          error: 'Dados bancários são obrigatórios para TED/DOC' 
        });
      }

      // Verificar saldo do usuário
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('saldo')
        .eq('id', user.id)
        .single();

      if (userError) {
        console.error('Error fetching user data:', userError);
        return res.status(500).json({ 
          error: 'Erro ao verificar saldo do usuário' 
        });
      }

      if (!userData || userData.saldo < valor) {
        return res.status(400).json({ 
          error: 'Saldo insuficiente',
          saldo_atual: userData?.saldo || 0,
          valor_solicitado: valor
        });
      }

      // Criar o saque
      const saqueData = {
        user_id: user.id,
        valor: parseFloat(valor),
        metodo_pagamento,
        observacoes: observacoes || null,
        automatico: false // Manual withdrawal request
      };

      if (metodo_pagamento === 'pix') {
        saqueData.chave_pix = chave_pix;
      } else {
        saqueData.dados_bancarios = dados_bancarios;
      }

      const { data, error } = await supabase
        .from('saques')
        .insert([saqueData])
        .select('*')
        .single();

      if (error) {
        console.error('Error creating saque:', error);
        return res.status(500).json({ 
          error: 'Erro ao criar solicitação de saque',
          details: error.message 
        });
      }

      // Buscar dados do usuário para incluir na resposta
      const { data: userDataForResponse } = await supabase
        .from('users')
        .select('id, nome, email')
        .eq('id', user.id)
        .single();

      res.status(201).json({
        message: 'Solicitação de saque criada com sucesso',
        saque: {
          ...data,
          user: userDataForResponse
        }
      });

    } catch (error) {
      console.error('Error in createSaque:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor',
        details: error.message 
      });
    }
  }

  // Atualizar saque (apenas dados próprios e status pendente)
  async updateSaque(req, res) {
    try {
      const { user } = req;
      const { id } = req.params;
      const { observacoes, chave_pix, dados_bancarios } = req.body;

      // Verificar se o saque existe e pertence ao usuário
      const { data: existingSaque, error: fetchError } = await supabase
        .from('saques')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !existingSaque) {
        return res.status(404).json({ 
          error: 'Saque não encontrado' 
        });
      }

      if (existingSaque.user_id !== user.id && user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Acesso negado' 
        });
      }

      if (existingSaque.status !== 'pendente') {
        return res.status(400).json({ 
          error: 'Apenas saques pendentes podem ser alterados' 
        });
      }

      // Construir dados de atualização
      const updateData = {};
      if (observacoes !== undefined) updateData.observacoes = observacoes;
      if (chave_pix !== undefined) updateData.chave_pix = chave_pix;
      if (dados_bancarios !== undefined) updateData.dados_bancarios = dados_bancarios;

      const { data, error } = await supabase
        .from('saques')
        .update(updateData)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('Error updating saque:', error);
        return res.status(500).json({ 
          error: 'Erro ao atualizar saque',
          details: error.message 
        });
      }

      // Buscar dados do usuário
      const { data: userData } = await supabase
        .from('users')
        .select('id, nome, email')
        .eq('id', data.user_id)
        .single();

      res.json({
        message: 'Saque atualizado com sucesso',
        saque: {
          ...data,
          user: userData
        }
      });

    } catch (error) {
      console.error('Error in updateSaque:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor',
        details: error.message 
      });
    }
  }

  // Aprovar saque (apenas admin)
  async approveSaque(req, res) {
    try {
      const { user } = req;
      const { id } = req.params;
      const { observacoes_admin } = req.body;

      if (user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Apenas administradores podem aprovar saques' 
        });
      }

      // Verificar se o saque existe e está pendente
      const { data: existingSaque, error: fetchError } = await supabase
        .from('saques')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !existingSaque) {
        return res.status(404).json({ 
          error: 'Saque não encontrado' 
        });
      }

      // Buscar dados do usuário
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, nome, email, saldo')
        .eq('id', existingSaque.user_id)
        .single();

      if (userError || !userData) {
        return res.status(404).json({ 
          error: 'Usuário não encontrado' 
        });
      }

      if (existingSaque.status !== 'pendente') {
        return res.status(400).json({ 
          error: 'Apenas saques pendentes podem ser aprovados' 
        });
      }

      // Verificar se usuário ainda tem saldo (pode ter feito outros saques)
      if (userData.saldo < existingSaque.valor) {
        return res.status(400).json({ 
          error: 'Usuário não possui saldo suficiente',
          saldo_atual: userData.saldo,
          valor_saque: existingSaque.valor
        });
      }

      // Iniciar transação para debitar saldo e aprovar saque
      const { data: updatedSaque, error: saqueError } = await supabase
        .from('saques')
        .update({
          status: 'aprovado',
          observacoes_admin: observacoes_admin || null,
          processed_by: user.id,
          processed_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('*')
        .single();

      if (saqueError) {
        console.error('Error approving saque:', saqueError);
        return res.status(500).json({ 
          error: 'Erro ao aprovar saque',
          details: saqueError.message 
        });
      }

      // Debitar saldo do usuário
      const novoSaldo = userData.saldo - existingSaque.valor;
      const { error: saldoError } = await supabase
        .from('users')
        .update({ saldo: novoSaldo })
        .eq('id', existingSaque.user_id);

      if (saldoError) {
        console.error('Error updating user balance:', saldoError);
        // Reverter aprovação do saque
        await supabase
          .from('saques')
          .update({
            status: 'pendente',
            observacoes_admin: null,
            processed_by: null,
            processed_at: null
          })
          .eq('id', id);

        return res.status(500).json({ 
          error: 'Erro ao debitar saldo do usuário',
          details: saldoError.message 
        });
      }

      // Buscar dados do admin para a resposta
      const { data: adminData } = await supabase
        .from('users')
        .select('id, nome, email')
        .eq('id', user.id)
        .single();

      res.json({
        message: 'Saque aprovado com sucesso',
        saque: {
          ...updatedSaque,
          user: userData,
          admin_user: adminData
        },
        novo_saldo_usuario: novoSaldo
      });

    } catch (error) {
      console.error('Error in approveSaque:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor',
        details: error.message 
      });
    }
  }

  // Rejeitar saque (apenas admin)
  async rejectSaque(req, res) {
    try {
      const { user } = req;
      const { id } = req.params;
      const { observacoes_admin } = req.body;

      if (user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Apenas administradores podem rejeitar saques' 
        });
      }

      if (!observacoes_admin) {
        return res.status(400).json({ 
          error: 'Motivo da rejeição é obrigatório' 
        });
      }

      // Verificar se o saque existe e está pendente
      const { data: existingSaque, error: fetchError } = await supabase
        .from('saques')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !existingSaque) {
        return res.status(404).json({ 
          error: 'Saque não encontrado' 
        });
      }

      if (existingSaque.status !== 'pendente') {
        return res.status(400).json({ 
          error: 'Apenas saques pendentes podem ser rejeitados' 
        });
      }

      const { data, error } = await supabase
        .from('saques')
        .update({
          status: 'rejeitado',
          observacoes_admin,
          processed_by: user.id,
          processed_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('Error rejecting saque:', error);
        return res.status(500).json({ 
          error: 'Erro ao rejeitar saque',
          details: error.message 
        });
      }

      // Buscar dados do usuário e admin para a resposta
      const { data: userData } = await supabase
        .from('users')
        .select('id, nome, email')
        .eq('id', data.user_id)
        .single();

      const { data: adminData } = await supabase
        .from('users')
        .select('id, nome, email')
        .eq('id', user.id)
        .single();

      res.json({
        message: 'Saque rejeitado com sucesso',
        saque: {
          ...data,
          user: userData,
          admin_user: adminData
        }
      });

    } catch (error) {
      console.error('Error in rejectSaque:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor',
        details: error.message 
      });
    }
  }

  // Estatísticas de saques (apenas admin)
  async getSaquesStats(req, res) {
    try {
      const { user } = req;

      if (user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Apenas administradores podem ver estatísticas' 
        });
      }

      // Buscar estatísticas gerais
      const { data: stats, error: statsError } = await supabase
        .from('saques')
        .select('status, valor, created_at');

      if (statsError) {
        console.error('Error fetching saque stats:', statsError);
        return res.status(500).json({ 
          error: 'Erro ao buscar estatísticas',
          details: statsError.message 
        });
      }

      const hoje = new Date();
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

      const estatisticas = {
        total_saques: stats.length,
        total_valor: stats.reduce((sum, s) => sum + parseFloat(s.valor), 0),
        pendentes: stats.filter(s => s.status === 'pendente').length,
        aprovados: stats.filter(s => s.status === 'aprovado').length,
        rejeitados: stats.filter(s => s.status === 'rejeitado').length,
        valor_aprovado: stats
          .filter(s => s.status === 'aprovado')
          .reduce((sum, s) => sum + parseFloat(s.valor), 0),
        mes_atual: {
          total: stats.filter(s => {
            const data = new Date(s.created_at);
            return data >= inicioMes && data <= fimMes;
          }).length,
          valor: stats
            .filter(s => {
              const data = new Date(s.created_at);
              return data >= inicioMes && data <= fimMes;
            })
            .reduce((sum, s) => sum + parseFloat(s.valor), 0)
        }
      };

      res.json(estatisticas);

    } catch (error) {
      console.error('Error in getSaquesStats:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor',
        details: error.message 
      });
    }
  }

  // Get users eligible for automatic withdrawal (admin only)
  async getEligibleForAutoWithdrawal(req, res) {
    try {
      const { user } = req;

      if (user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Apenas administradores podem acessar esta funcionalidade' 
        });
      }

      const result = await automaticWithdrawalService.getEligibleUsers();

      if (!result.success) {
        return res.status(500).json({ 
          error: 'Erro ao buscar usuários elegíveis',
          details: result.error 
        });
      }

      res.json({
        message: 'Usuários elegíveis para saque automático',
        users: result.users,
        total: result.users.length
      });

    } catch (error) {
      console.error('Error in getEligibleForAutoWithdrawal:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor',
        details: error.message 
      });
    }
  }

  // Manually trigger automatic withdrawals for eligible users (admin only)
  async triggerAutomaticWithdrawals(req, res) {
    try {
      const { user } = req;

      if (user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Apenas administradores podem triggerar saques automáticos' 
        });
      }

      const result = await automaticWithdrawalService.triggerAutomaticWithdrawalsForEligibleUsers();

      if (!result.success) {
        return res.status(500).json({ 
          error: 'Erro ao processar saques automáticos',
          details: result.error 
        });
      }

      const successCount = result.results.filter(r => r.result.success).length;
      const failureCount = result.results.length - successCount;

      res.json({
        message: 'Processamento de saques automáticos concluído',
        summary: {
          total_processed: result.results.length,
          successful: successCount,
          failed: failureCount
        },
        details: result.results
      });

    } catch (error) {
      console.error('Error in triggerAutomaticWithdrawals:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor',
        details: error.message 
      });
    }
  }

  // Get automatic withdrawal statistics (admin only)
  async getAutomaticWithdrawalStats(req, res) {
    try {
      const { user } = req;

      if (user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Apenas administradores podem ver estatísticas' 
        });
      }

      // Get automatic withdrawals statistics
      const { data: autoSaques, error: autoSaquesError } = await supabase
        .from('saques')
        .select('status, valor, created_at, user_id')
        .eq('automatico', true);

      if (autoSaquesError) {
        console.error('Error fetching automatic withdrawal stats:', autoSaquesError);
        return res.status(500).json({ 
          error: 'Erro ao buscar estatísticas de saques automáticos',
          details: autoSaquesError.message 
        });
      }

      // Get users with automatic withdrawal enabled
      const { data: usersWithAuto, error: usersError } = await supabase
        .from('users')
        .select('id, nome, email, saldo, chave_pix')
        .eq('role', 'user')
        .eq('saque_automatico', true);

      if (usersError) {
        console.error('Error fetching users with auto withdrawal:', usersError);
        return res.status(500).json({ 
          error: 'Erro ao buscar usuários com saque automático',
          details: usersError.message 
        });
      }

      const hoje = new Date();
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

      const stats = {
        automatic_withdrawals: {
          total: autoSaques.length,
          total_value: autoSaques.reduce((sum, s) => sum + parseFloat(s.valor), 0),
          pending: autoSaques.filter(s => s.status === 'pendente').length,
          approved: autoSaques.filter(s => s.status === 'aprovado').length,
          rejected: autoSaques.filter(s => s.status === 'rejeitado').length,
          this_month: autoSaques.filter(s => {
            const data = new Date(s.created_at);
            return data >= inicioMes;
          }).length
        },
        users_with_auto_enabled: {
          total: usersWithAuto.length,
          with_pix_key: usersWithAuto.filter(u => u.chave_pix && u.chave_pix.trim() !== '').length,
          eligible_balance: usersWithAuto.filter(u => u.saldo >= 50).length,
          total_balance: usersWithAuto.reduce((sum, u) => sum + (parseFloat(u.saldo) || 0), 0)
        }
      };

      res.json(stats);

    } catch (error) {
      console.error('Error in getAutomaticWithdrawalStats:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor',
        details: error.message 
      });
    }
  }
}

module.exports = new SaquesController();