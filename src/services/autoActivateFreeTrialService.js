const { supabase } = require('../config/supabase')

class AutoActivateFreeTrialService {
  constructor() {
    this.FREE_TRIAL_PLAN_ID = '0582c286-d23b-4e49-9e8d-ec8d81e52ac0'
    this.TRIAL_DURATION_DAYS = 7
  }

  async activateFreeTrial(userId) {
    try {
      console.log(`[AutoActivateFreeTrialService] Ativando plano gratuito para usuário: ${userId}`)

      // Verificar se o usuário já teve um plano gratuito
      const { data: existingTrials, error: checkError } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('plan_id', this.FREE_TRIAL_PLAN_ID)

      if (checkError) {
        console.error(`[AutoActivateFreeTrialService] Erro ao verificar planos existentes:`, checkError)
        throw checkError
      }

      if (existingTrials && existingTrials.length > 0) {
        console.log(`[AutoActivateFreeTrialService] ⚠️ Usuário ${userId} já teve plano gratuito anteriormente`)
        return {
          success: false,
          message: 'Usuário já utilizou o plano gratuito',
          reason: 'already_used_trial'
        }
      }

      // Calcular data de expiração
      const now = new Date()
      const expiresAt = new Date(now)
      expiresAt.setDate(expiresAt.getDate() + this.TRIAL_DURATION_DAYS)

      console.log(`[AutoActivateFreeTrialService] Criando assinatura gratuita até: ${expiresAt.toISOString()}`)

      // Criar assinatura gratuita
      const { data: subscription, error: createError } = await supabase
        .from('user_subscriptions')
        .insert({
          user_id: userId,
          plan_id: this.FREE_TRIAL_PLAN_ID,
          starts_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          status: 'active',
          created_at: now.toISOString()
        })
        .select()

      if (createError) {
        console.error(`[AutoActivateFreeTrialService] Erro ao criar assinatura:`, createError)
        throw createError
      }

      // Criar log da transação
      const { error: logError } = await supabase
        .from('transacoes')
        .insert({
          user_id: userId,
          tipo: 'credito',
          motivo: 'Plano teste gratuito ativado automaticamente no registro',
          valor: 0,
          saldo_anterior: 0,
          saldo_atual: 0,
          created_at: now.toISOString()
        })

      if (logError) {
        console.warn(`[AutoActivateFreeTrialService] Erro ao criar log de transação:`, logError)
      }

      console.log(`[AutoActivateFreeTrialService] ✅ Plano gratuito ativado com sucesso para usuário ${userId}`)

      return {
        success: true,
        message: 'Plano teste gratuito ativado com sucesso',
        data: {
          subscription_id: subscription[0]?.id,
          expires_at: expiresAt.toISOString(),
          duration_days: this.TRIAL_DURATION_DAYS
        }
      }

    } catch (error) {
      console.error(`[AutoActivateFreeTrialService] Erro ao ativar plano gratuito para ${userId}:`, error)
      return {
        success: false,
        message: 'Erro interno ao ativar plano gratuito',
        error: error.message
      }
    }
  }

  async checkUserEligibility(userId) {
    try {
      // Verificar se usuário já teve plano gratuito
      const { data: existingTrials, error } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('plan_id', this.FREE_TRIAL_PLAN_ID)

      if (error) {
        console.error(`[AutoActivateFreeTrialService] Erro ao verificar elegibilidade:`, error)
        return { eligible: false, reason: 'check_error' }
      }

      const hasUsedTrial = existingTrials && existingTrials.length > 0
      
      return {
        eligible: !hasUsedTrial,
        reason: hasUsedTrial ? 'already_used_trial' : 'eligible',
        existing_trials: existingTrials?.length || 0
      }

    } catch (error) {
      console.error(`[AutoActivateFreeTrialService] Erro na verificação de elegibilidade:`, error)
      return { eligible: false, reason: 'check_error' }
    }
  }

  // Método para processar novos usuários registrados via Supabase Auth
  async processNewUser(userData) {
    try {
      console.log(`[AutoActivateFreeTrialService] Processando novo usuário:`, userData.id)

      // Verificar elegibilidade
      const eligibility = await this.checkUserEligibility(userData.id)
      
      if (!eligibility.eligible) {
        console.log(`[AutoActivateFreeTrialService] Usuário não elegível: ${eligibility.reason}`)
        return { success: false, reason: eligibility.reason }
      }

      // Ativar plano gratuito
      return await this.activateFreeTrial(userData.id)

    } catch (error) {
      console.error(`[AutoActivateFreeTrialService] Erro ao processar novo usuário:`, error)
      return { success: false, error: error.message }
    }
  }
}

// Criar instância singleton
const autoActivateFreeTrialService = new AutoActivateFreeTrialService()

module.exports = autoActivateFreeTrialService 