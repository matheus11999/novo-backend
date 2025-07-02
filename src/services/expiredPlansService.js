const { supabase } = require('../config/supabase')

class ExpiredPlansService {
  constructor() {
    this.isRunning = false
    this.intervalId = null
    this.intervalTime = 30 * 60 * 1000 // 30 minutos
  }

  async checkExpiredPlans() {
    try {
      console.log('[ExpiredPlansService] Verificando planos expirados...')
      
      const now = new Date().toISOString()
      
      // Buscar todas as assinaturas ativas que expiraram
      const { data: expiredSubscriptions, error: fetchError } = await supabase
        .from('user_subscriptions')
        .select(`
          *,
          users(id, nome, email),
          subscription_plans(name)
        `)
        .eq('status', 'active')
        .lt('expires_at', now)

      if (fetchError) {
        console.error('[ExpiredPlansService] Erro ao buscar planos expirados:', fetchError)
        return
      }

      if (!expiredSubscriptions || expiredSubscriptions.length === 0) {
        console.log('[ExpiredPlansService] Nenhum plano expirado encontrado')
        return
      }

      console.log(`[ExpiredPlansService] Encontrados ${expiredSubscriptions.length} planos expirados`)

      // Processar cada plano expirado
      for (const subscription of expiredSubscriptions) {
        try {
          console.log(`[ExpiredPlansService] Expirando plano do usuário: ${subscription.users?.nome} (${subscription.users?.email})`)
          console.log(`[ExpiredPlansService] Plano: ${subscription.subscription_plans?.name}`)
          console.log(`[ExpiredPlansService] Expirou em: ${subscription.expires_at}`)

          // Atualizar status para 'expired'
          const { error: updateError } = await supabase
            .from('user_subscriptions')
            .update({ 
              status: 'expired',
              updated_at: now
            })
            .eq('id', subscription.id)

          if (updateError) {
            console.error(`[ExpiredPlansService] Erro ao expirar plano ${subscription.id}:`, updateError)
            continue
          }

          // Log da transação para histórico
          const { error: logError } = await supabase
            .from('transacoes')
            .insert({
              user_id: subscription.user_id,
              tipo: 'debito',
              motivo: `Plano ${subscription.subscription_plans?.name} expirado automaticamente`,
              valor: 0,
              saldo_anterior: 0,
              saldo_atual: 0,
              created_at: now
            })

          if (logError) {
            console.warn(`[ExpiredPlansService] Erro ao criar log de expiração para usuário ${subscription.user_id}:`, logError)
          }

          console.log(`[ExpiredPlansService] ✅ Plano ${subscription.id} expirado com sucesso`)

        } catch (error) {
          console.error(`[ExpiredPlansService] Erro ao processar expiração do plano ${subscription.id}:`, error)
        }
      }

      console.log(`[ExpiredPlansService] ✅ Processamento concluído. ${expiredSubscriptions.length} planos expirados`)

    } catch (error) {
      console.error('[ExpiredPlansService] Erro geral ao verificar planos expirados:', error)
    }
  }

  start() {
    if (this.isRunning) {
      console.log('[ExpiredPlansService] Serviço já está rodando')
      return
    }

    console.log('[ExpiredPlansService] 🚀 Iniciando serviço de verificação de planos expirados')
    console.log(`[ExpiredPlansService] Intervalo: ${this.intervalTime / 1000 / 60} minutos`)
    
    this.isRunning = true
    
    // Executar imediatamente
    this.checkExpiredPlans()
    
    // Configurar execução periódica
    this.intervalId = setInterval(() => {
      this.checkExpiredPlans()
    }, this.intervalTime)

    console.log('[ExpiredPlansService] ✅ Serviço iniciado com sucesso')
  }

  stop() {
    if (!this.isRunning) {
      console.log('[ExpiredPlansService] Serviço não está rodando')
      return
    }

    console.log('[ExpiredPlansService] 🛑 Parando serviço de verificação de planos expirados')
    
    this.isRunning = false
    
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    console.log('[ExpiredPlansService] ✅ Serviço parado com sucesso')
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalTime: this.intervalTime,
      nextCheck: this.intervalId ? new Date(Date.now() + this.intervalTime) : null
    }
  }

  // Método para executar verificação manual
  async manualCheck() {
    console.log('[ExpiredPlansService] 🔍 Verificação manual solicitada')
    await this.checkExpiredPlans()
    return { success: true, message: 'Verificação manual concluída' }
  }
}

// Criar instância singleton
const expiredPlansService = new ExpiredPlansService()

module.exports = expiredPlansService 