const { supabase } = require('../config/database');
const logger = require('../config/logger');

class ErrorLogService {
    constructor() {
        this.batchQueue = [];
        this.batchSize = 10;
        this.flushInterval = 5000; // 5 segundos
        this.isProcessing = false;
        
        // Iniciar flush periódico
        setInterval(() => {
            this.flushBatch();
        }, this.flushInterval);
    }

    async logError({
        component,
        errorType,
        errorMessage,
        errorStack,
        context = {},
        paymentId,
        vendaId,
        userId,
        mikrotikId,
        severity = 'error'
    }) {
        try {
            const errorLog = {
                component,
                error_type: errorType,
                error_message: errorMessage,
                error_stack: errorStack,
                context,
                payment_id: paymentId,
                venda_id: vendaId,
                user_id: userId,
                mikrotik_id: mikrotikId,
                severity,
                created_at: new Date().toISOString()
            };

            // Adicionar à fila de batch
            this.batchQueue.push(errorLog);

            // Se a fila está cheia, fazer flush imediatamente
            if (this.batchQueue.length >= this.batchSize) {
                await this.flushBatch();
            }

            // Log local também
            logger.debug('Error logged to database queue', {
                component: 'ERROR_LOG_SERVICE',
                errorType,
                paymentId,
                vendaId
            });

        } catch (error) {
            logger.error('Failed to queue error log', {
                component: 'ERROR_LOG_SERVICE',
                error: error.message
            });
        }
    }

    async flushBatch() {
        if (this.isProcessing || this.batchQueue.length === 0) {
            return;
        }

        this.isProcessing = true;
        const batch = [...this.batchQueue];
        this.batchQueue = [];

        try {
            const { error } = await supabase
                .from('error_logs')
                .insert(batch);

            if (error) {
                logger.error('Failed to insert error logs batch', {
                    component: 'ERROR_LOG_SERVICE',
                    error: error.message,
                    batchSize: batch.length
                });
                
                // Retornar items à fila para tentar novamente
                this.batchQueue.unshift(...batch);
            } else {
                logger.debug('Error logs batch saved to database', {
                    component: 'ERROR_LOG_SERVICE',
                    batchSize: batch.length
                });
            }

        } catch (error) {
            logger.error('Exception while saving error logs', {
                component: 'ERROR_LOG_SERVICE',
                error: error.message
            });
            
            // Retornar items à fila
            this.batchQueue.unshift(...batch);
        } finally {
            this.isProcessing = false;
        }
    }

    async getRecentErrors(limit = 50, component = null, severity = null) {
        try {
            let query = supabase
                .from('error_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (component) {
                query = query.eq('component', component);
            }

            if (severity) {
                query = query.eq('severity', severity);
            }

            const { data, error } = await query;

            if (error) {
                logger.error('Failed to fetch recent errors', {
                    component: 'ERROR_LOG_SERVICE',
                    error: error.message
                });
                return [];
            }

            return data || [];

        } catch (error) {
            logger.error('Exception while fetching recent errors', {
                component: 'ERROR_LOG_SERVICE',
                error: error.message
            });
            return [];
        }
    }

    async getErrorStats() {
        try {
            const { data, error } = await supabase
                .from('error_logs')
                .select('component, error_type, severity')
                .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

            if (error) {
                logger.error('Failed to fetch error stats', {
                    component: 'ERROR_LOG_SERVICE',
                    error: error.message
                });
                return {};
            }

            // Agrupar estatísticas
            const stats = {
                total: data.length,
                byComponent: {},
                byType: {},
                bySeverity: {}
            };

            data.forEach(log => {
                // Por componente
                stats.byComponent[log.component] = (stats.byComponent[log.component] || 0) + 1;
                
                // Por tipo
                stats.byType[log.error_type] = (stats.byType[log.error_type] || 0) + 1;
                
                // Por severidade
                stats.bySeverity[log.severity] = (stats.bySeverity[log.severity] || 0) + 1;
            });

            return stats;

        } catch (error) {
            logger.error('Exception while calculating error stats', {
                component: 'ERROR_LOG_SERVICE',
                error: error.message
            });
            return {};
        }
    }

    async markErrorResolved(errorId) {
        try {
            const { error } = await supabase
                .from('error_logs')
                .update({ 
                    resolved: true, 
                    updated_at: new Date().toISOString() 
                })
                .eq('id', errorId);

            if (error) {
                logger.error('Failed to mark error as resolved', {
                    component: 'ERROR_LOG_SERVICE',
                    errorId,
                    error: error.message
                });
                return false;
            }

            return true;

        } catch (error) {
            logger.error('Exception while marking error as resolved', {
                component: 'ERROR_LOG_SERVICE',
                errorId,
                error: error.message
            });
            return false;
        }
    }

    // Cleanup old logs (older than 30 days)
    async cleanupOldLogs() {
        try {
            const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            const { error } = await supabase
                .from('error_logs')
                .delete()
                .lt('created_at', cutoffDate.toISOString());

            if (error) {
                logger.error('Failed to cleanup old error logs', {
                    component: 'ERROR_LOG_SERVICE',
                    error: error.message
                });
            } else {
                logger.info('Old error logs cleaned up', {
                    component: 'ERROR_LOG_SERVICE',
                    cutoffDate: cutoffDate.toISOString()
                });
            }

        } catch (error) {
            logger.error('Exception during error logs cleanup', {
                component: 'ERROR_LOG_SERVICE',
                error: error.message
            });
        }
    }

    // Force flush on shutdown
    async shutdown() {
        await this.flushBatch();
    }
}

// Create singleton instance
const errorLogService = new ErrorLogService();

module.exports = errorLogService;