const MikroTikUserService = require('../services/mikrotikUserService');

class MikroTikRetryController {
    constructor() {
        this.mikrotikUserService = new MikroTikUserService();
    }

    async retryFailedCreations(req, res) {
        try {
            console.log('🔄 [RETRY-CONTROLLER] Iniciando retry manual de criações falhadas...');
            
            await this.mikrotikUserService.retryFailedCreations();
            
            res.json({
                success: true,
                message: 'Retry de criações falhadas executado com sucesso',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('❌ [RETRY-CONTROLLER] Erro no retry:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async getFailedCreations(req, res) {
        try {
            const failedVendas = await this.mikrotikUserService.getFailedCreations();
            
            res.json({
                success: true,
                data: failedVendas,
                count: failedVendas.length,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('❌ [RETRY-CONTROLLER] Erro ao buscar falhas:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async getCreationStats(req, res) {
        try {
            const stats = await this.mikrotikUserService.getCreationStats();
            
            res.json({
                success: true,
                data: stats,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('❌ [RETRY-CONTROLLER] Erro ao buscar estatísticas:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async retrySpecificVenda(req, res) {
        try {
            const { vendaId } = req.params;
            
            console.log(`🔄 [RETRY-CONTROLLER] Retry específico para venda: ${vendaId}`);
            
            // Buscar dados da venda
            const { supabase } = require('../config/database');
            const { data: venda, error } = await supabase
                .from('vendas')
                .select(`
                    *,
                    planos (*),
                    mikrotiks (*)
                `)
                .eq('id', vendaId)
                .single();
            
            if (error || !venda) {
                return res.status(404).json({
                    success: false,
                    error: 'Venda não encontrada',
                    timestamp: new Date().toISOString()
                });
            }
            
            if (venda.status !== 'completed') {
                return res.status(400).json({
                    success: false,
                    error: 'Venda deve estar com status completed',
                    timestamp: new Date().toISOString()
                });
            }
            
            const result = await this.mikrotikUserService.createUserWithRetry(venda, 1);
            
            res.json({
                success: true,
                data: result,
                message: 'Retry específico executado',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('❌ [RETRY-CONTROLLER] Erro no retry específico:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
}

module.exports = new MikroTikRetryController();