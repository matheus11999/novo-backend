const { supabase } = require('../config/supabase');

class AutomaticWithdrawalService {
  
  /**
   * Check and process automatic withdrawals for a user when balance is updated
   * @param {string} userId - User ID to check
   * @param {number} newBalance - New balance amount
   * @param {number} oldBalance - Previous balance amount
   */
  async processAutomaticWithdrawal(userId, newBalance, oldBalance = 0) {
    try {
      console.log(`[AUTOMATIC-WITHDRAWAL] Checking user ${userId}: balance ${oldBalance} -> ${newBalance}`);
      
      // Only trigger if balance is >= R$ 50 and user has automatic withdrawal enabled
      if (newBalance >= 50.00) {
        
        // Get user details including automatic withdrawal settings
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('id, nome, email, saque_automatico, chave_pix, saldo')
          .eq('id', userId)
          .single();

        if (userError) {
          console.error('[AUTOMATIC-WITHDRAWAL] Error fetching user:', userError);
          return { success: false, error: userError.message };
        }

        if (!user) {
          console.log('[AUTOMATIC-WITHDRAWAL] User not found');
          return { success: false, error: 'User not found' };
        }

        // Check if user has automatic withdrawal enabled
        if (!user.saque_automatico) {
          console.log(`[AUTOMATIC-WITHDRAWAL] User ${userId} does not have automatic withdrawal enabled`);
          return { success: false, reason: 'Automatic withdrawal not enabled' };
        }

        // Check if user has PIX key configured
        if (!user.chave_pix) {
          console.log(`[AUTOMATIC-WITHDRAWAL] User ${userId} does not have PIX key configured`);
          return { success: false, reason: 'PIX key not configured' };
        }

        // Check if there's already a pending automatic withdrawal
        const { data: existingWithdrawals, error: withdrawalError } = await supabase
          .from('saques')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'pendente')
          .eq('automatico', true);

        if (withdrawalError) {
          console.error('[AUTOMATIC-WITHDRAWAL] Error checking existing withdrawals:', withdrawalError);
          return { success: false, error: withdrawalError.message };
        }

        if (existingWithdrawals && existingWithdrawals.length > 0) {
          console.log(`[AUTOMATIC-WITHDRAWAL] User ${userId} already has pending automatic withdrawal`);
          return { success: false, reason: 'Pending automatic withdrawal already exists' };
        }

        // Create automatic withdrawal request for R$ 50.00
        const withdrawalAmount = 50.00; // Fixed amount for automatic withdrawals
        
        const { data: saque, error: saqueError } = await supabase
          .from('saques')
          .insert([{
            user_id: userId,
            valor: withdrawalAmount,
            metodo_pagamento: 'pix',
            chave_pix: user.chave_pix,
            status: 'pendente',
            automatico: true,
            observacoes: `Saque automático de R$ 50,00 - Saldo disponível: R$ ${user.saldo.toFixed(2)}`
          }])
          .select('*')
          .single();

        if (saqueError) {
          console.error('[AUTOMATIC-WITHDRAWAL] Error creating automatic withdrawal:', saqueError);
          return { success: false, error: saqueError.message };
        }

        console.log(`[AUTOMATIC-WITHDRAWAL] Created automatic withdrawal for user ${userId}: R$ ${withdrawalAmount.toFixed(2)}`);
        
        return {
          success: true,
          saque: saque,
          user: {
            id: user.id,
            nome: user.nome,
            email: user.email
          },
          amount: withdrawalAmount
        };
      }

      return { success: false, reason: 'Balance threshold not met' };

    } catch (error) {
      console.error('[AUTOMATIC-WITHDRAWAL] Unexpected error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get users eligible for automatic withdrawal (balance >= 50 and feature enabled)
   */
  async getEligibleUsers() {
    try {
      const { data: users, error } = await supabase
        .from('users')
        .select('id, nome, email, saldo, saque_automatico, chave_pix')
        .eq('role', 'user')
        .eq('saque_automatico', true)
        .gte('saldo', 50);

      if (error) {
        console.error('[AUTOMATIC-WITHDRAWAL] Error fetching eligible users:', error);
        return { success: false, error: error.message };
      }

      // Filter users with PIX key configured
      const eligibleUsers = users.filter(user => user.chave_pix && user.chave_pix.trim() !== '');

      return { success: true, users: eligibleUsers };

    } catch (error) {
      console.error('[AUTOMATIC-WITHDRAWAL] Error in getEligibleUsers:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Manual trigger for automatic withdrawals (for testing or admin use)
   */
  async triggerAutomaticWithdrawalsForEligibleUsers() {
    try {
      const eligibleResult = await this.getEligibleUsers();
      
      if (!eligibleResult.success) {
        return eligibleResult;
      }

      const results = [];
      
      for (const user of eligibleResult.users) {
        const result = await this.processAutomaticWithdrawal(user.id, user.saldo, 0);
        results.push({
          userId: user.id,
          userName: user.nome,
          result: result
        });
      }

      return { success: true, results: results };

    } catch (error) {
      console.error('[AUTOMATIC-WITHDRAWAL] Error in triggerAutomaticWithdrawalsForEligibleUsers:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new AutomaticWithdrawalService();