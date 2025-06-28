const paymentPollingService = require('../services/paymentPollingService');

class PaymentPollingController {
    async startPolling(req, res) {
        try {
            paymentPollingService.start();
            
            res.json({
                success: true,
                message: 'Serviço de polling iniciado',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('❌ [POLLING-CONTROLLER] Erro ao iniciar polling:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async stopPolling(req, res) {
        try {
            paymentPollingService.stop();
            
            res.json({
                success: true,
                message: 'Serviço de polling parado',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('❌ [POLLING-CONTROLLER] Erro ao parar polling:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async getStats(req, res) {
        try {
            const stats = await paymentPollingService.getStats();
            
            res.json({
                success: true,
                data: stats,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('❌ [POLLING-CONTROLLER] Erro ao buscar stats:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async checkNow(req, res) {
        try {
            console.log('🔍 [POLLING-CONTROLLER] Verificação manual iniciada');
            
            // Executar verificação imediata
            await paymentPollingService.checkPendingPayments();
            
            res.json({
                success: true,
                message: 'Verificação manual concluída',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('❌ [POLLING-CONTROLLER] Erro na verificação manual:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async processSpecificPayment(req, res) {
        try {
            const { paymentId } = req.params;
            
            if (!paymentId) {
                return res.status(400).json({
                    success: false,
                    error: 'Payment ID é obrigatório',
                    timestamp: new Date().toISOString()
                });
            }

            console.log(`🔍 [POLLING-CONTROLLER] Processamento específico: ${paymentId}`);
            
            const result = await paymentPollingService.processSpecificPayment(paymentId);
            
            if (result.success) {
                res.json({
                    success: true,
                    data: result,
                    message: `Pagamento ${paymentId} processado`,
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: result.error,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('❌ [POLLING-CONTROLLER] Erro no processamento específico:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async getPendingPayments(req, res) {
        try {
            const { supabase } = require('../config/database');
            
            const { data: pendingVendas, error } = await supabase
                .from('vendas')
                .select(`
                    id,
                    payment_id,
                    mac_address,
                    status,
                    mercadopago_status,
                    mikrotik_user_created,
                    valor_total,
                    created_at,
                    paid_at,
                    mikrotik_creation_status,
                    mikrotik_creation_attempts,
                    planos (nome, valor, session_timeout),
                    mikrotiks (nome, ip)
                `)
                .or('status.eq.pending,and(status.eq.completed,mikrotik_user_created.eq.false)')
                .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
                .order('created_at', { ascending: false });

            if (error) {
                throw error;
            }

            res.json({
                success: true,
                data: pendingVendas || [],
                count: pendingVendas?.length || 0,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('❌ [POLLING-CONTROLLER] Erro ao buscar pendentes:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
}

module.exports = new PaymentPollingController();