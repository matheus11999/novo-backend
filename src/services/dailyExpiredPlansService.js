const cron = require('node-cron');
const { supabase } = require('../config/database');
const logger = require('../config/logger');
const cacheService = require('../config/cache');

class DailyExpiredPlansService {
    constructor() {
        this.isRunning = false;
        this.cronJob = null;
        this.processingBatch = new Set();
        this.batchSize = 50; // Processar 50 planos por vez
        this.maxConcurrency = 10; // Máximo 10 operações simultâneas
        
        // Executar todos os dias às 02:00 (horário do servidor)
        this.cronExpression = '0 2 * * *';
    }

    start() {
        if (this.isRunning) {
            logger.info('Daily expired plans service already running', { 
                component: 'EXPIRED_PLANS_SERVICE' 
            });
            return;
        }

        this.isRunning = true;
        
        // Agendar job diário
        this.cronJob = cron.schedule(this.cronExpression, async () => {
            await this.checkExpiredPlans();
        }, {
            scheduled: true,
            timezone: 'America/Sao_Paulo'
        });

        logger.info('Daily expired plans service started', { 
            component: 'EXPIRED_PLANS_SERVICE',
            schedule: this.cronExpression,
            timezone: 'America/Sao_Paulo'
        });

        // Executar uma vez na inicialização se necessário
        if (process.env.NODE_ENV === 'development') {
            logger.info('Running expired plans check on startup (development mode)', { 
                component: 'EXPIRED_PLANS_SERVICE' 
            });
            setTimeout(() => {
                this.checkExpiredPlans();
            }, 5000);
        }
    }

    stop() {
        if (!this.isRunning) {
            logger.info('Daily expired plans service already stopped', { 
                component: 'EXPIRED_PLANS_SERVICE' 
            });
            return;
        }

        this.isRunning = false;
        
        if (this.cronJob) {
            this.cronJob.destroy();
            this.cronJob = null;
        }

        logger.info('Daily expired plans service stopped', { 
            component: 'EXPIRED_PLANS_SERVICE' 
        });
    }

    async checkExpiredPlans() {
        const startTime = Date.now();
        
        try {
            logger.info('Starting daily expired plans check', { 
                component: 'EXPIRED_PLANS_SERVICE' 
            });

            const now = new Date().toISOString();
            
            // Query otimizada com índices
            const { data: expiredSubscriptions, error: fetchError } = await supabase
                .from('user_subscriptions')
                .select(`
                    id,
                    user_id,
                    plan_id,
                    status,
                    expires_at,
                    created_at,
                    users(id, nome, email),
                    subscription_plans(id, name, price, duration_days)
                `)
                .eq('status', 'active')
                .lt('expires_at', now)
                .order('expires_at', { ascending: true })
                .limit(1000); // Limite para evitar sobrecarga

            if (fetchError) {
                logger.error('Error fetching expired subscriptions', { 
                    component: 'EXPIRED_PLANS_SERVICE',
                    error: fetchError.message 
                });
                return;
            }

            if (!expiredSubscriptions || expiredSubscriptions.length === 0) {
                logger.info('No expired subscriptions found', { 
                    component: 'EXPIRED_PLANS_SERVICE' 
                });
                return;
            }

            logger.info('Found expired subscriptions', { 
                component: 'EXPIRED_PLANS_SERVICE',
                count: expiredSubscriptions.length 
            });

            // Processar em lotes
            const results = await this.processBatches(expiredSubscriptions);
            
            const duration = Date.now() - startTime;
            logger.info('Daily expired plans check completed', { 
                component: 'EXPIRED_PLANS_SERVICE',
                duration,
                totalProcessed: expiredSubscriptions.length,
                successful: results.successful,
                failed: results.failed
            });

            // Limpar cache relacionado
            await this.clearRelatedCache(expiredSubscriptions);

        } catch (error) {
            logger.error('Error in daily expired plans check', { 
                component: 'EXPIRED_PLANS_SERVICE',
                error: error.message 
            });
        }
    }

    async processBatches(subscriptions) {
        const chunks = this.chunk(subscriptions, this.batchSize);
        let totalSuccessful = 0;
        let totalFailed = 0;

        for (const chunk of chunks) {
            if (!this.isRunning) break;

            logger.info('Processing batch of expired subscriptions', { 
                component: 'EXPIRED_PLANS_SERVICE',
                batchSize: chunk.length 
            });

            // Processar lote com concorrência limitada
            const promises = chunk.map(subscription => this.processExpiredSubscription(subscription));
            const results = await this.promiseAllWithConcurrency(promises, this.maxConcurrency);

            // Contar resultados
            const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failed = results.filter(r => r.status === 'rejected' || !r.value.success).length;

            totalSuccessful += successful;
            totalFailed += failed;

            logger.info('Batch processed', { 
                component: 'EXPIRED_PLANS_SERVICE',
                batchSize: chunk.length,
                successful,
                failed 
            });

            // Aguardar entre lotes
            if (chunks.length > 1) {
                await this.sleep(1000);
            }
        }

        return { successful: totalSuccessful, failed: totalFailed };
    }

    async processExpiredSubscription(subscription) {
        const subscriptionId = subscription.id;

        // Verificar se já está sendo processado
        if (this.processingBatch.has(subscriptionId)) {
            logger.debug('Subscription already being processed', { 
                component: 'EXPIRED_PLANS_SERVICE',
                subscriptionId 
            });
            return { success: false, reason: 'already_processing' };
        }

        this.processingBatch.add(subscriptionId);

        try {
            logger.info('Processing expired subscription', { 
                component: 'EXPIRED_PLANS_SERVICE',
                subscriptionId,
                userId: subscription.user_id,
                userName: subscription.users?.nome,
                planName: subscription.subscription_plans?.name,
                expiredAt: subscription.expires_at
            });

            // Atualizar status para 'expired' em uma transação
            const { error: updateError } = await supabase
                .from('user_subscriptions')
                .update({ 
                    status: 'expired',
                    expired_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', subscriptionId)
                .eq('status', 'active'); // Garantir que ainda está ativo

            if (updateError) {
                logger.error('Error updating expired subscription', { 
                    component: 'EXPIRED_PLANS_SERVICE',
                    subscriptionId,
                    error: updateError.message 
                });
                return { success: false, reason: 'database_error', error: updateError.message };
            }

            // Registrar log de auditoria
            await this.logSubscriptionExpiry(subscription);

            // Invalidar cache do usuário
            await cacheService.del(cacheService.keys.userPlans(subscription.user_id));

            logger.info('Subscription expired successfully', { 
                component: 'EXPIRED_PLANS_SERVICE',
                subscriptionId,
                userId: subscription.user_id
            });

            return { success: true, subscriptionId };

        } catch (error) {
            logger.error('Error processing expired subscription', { 
                component: 'EXPIRED_PLANS_SERVICE',
                subscriptionId,
                error: error.message 
            });
            return { success: false, reason: 'processing_error', error: error.message };

        } finally {
            this.processingBatch.delete(subscriptionId);
        }
    }

    async logSubscriptionExpiry(subscription) {
        try {
            // Inserir log de auditoria
            const { error } = await supabase
                .from('subscription_audit_logs')
                .insert({
                    subscription_id: subscription.id,
                    user_id: subscription.user_id,
                    action: 'expired',
                    old_status: 'active',
                    new_status: 'expired',
                    expired_at: subscription.expires_at,
                    processed_at: new Date().toISOString(),
                    metadata: {
                        plan_name: subscription.subscription_plans?.name,
                        duration_days: subscription.subscription_plans?.duration_days,
                        automatic_expiry: true
                    }
                });

            if (error) {
                logger.warn('Failed to log subscription expiry audit', { 
                    component: 'EXPIRED_PLANS_SERVICE',
                    subscriptionId: subscription.id,
                    error: error.message 
                });
            }
        } catch (error) {
            logger.warn('Error logging subscription expiry', { 
                component: 'EXPIRED_PLANS_SERVICE',
                subscriptionId: subscription.id,
                error: error.message 
            });
        }
    }

    async clearRelatedCache(subscriptions) {
        try {
            // Limpar cache dos usuários afetados
            const userIds = [...new Set(subscriptions.map(s => s.user_id))];
            
            for (const userId of userIds) {
                await cacheService.del(cacheService.keys.userPlans(userId));
            }

            logger.info('Cache cleared for affected users', { 
                component: 'EXPIRED_PLANS_SERVICE',
                userCount: userIds.length 
            });
        } catch (error) {
            logger.warn('Error clearing cache', { 
                component: 'EXPIRED_PLANS_SERVICE',
                error: error.message 
            });
        }
    }

    // Utility methods
    chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    async promiseAllWithConcurrency(promises, concurrency) {
        const results = [];
        const executing = [];
        
        for (const promise of promises) {
            const p = Promise.resolve(promise()).then(
                value => ({ status: 'fulfilled', value }),
                reason => ({ status: 'rejected', reason })
            );
            
            results.push(p);
            
            if (promises.length >= concurrency) {
                executing.push(p);
                
                if (executing.length >= concurrency) {
                    await Promise.race(executing);
                    executing.splice(executing.findIndex(p => p.status !== 'pending'), 1);
                }
            }
        }
        
        return Promise.all(results);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Status e health check
    getStatus() {
        return {
            isRunning: this.isRunning,
            nextRun: this.cronJob ? this.cronJob.nextDate() : null,
            schedule: this.cronExpression,
            timezone: 'America/Sao_Paulo',
            processingCount: this.processingBatch.size,
            batchSize: this.batchSize,
            maxConcurrency: this.maxConcurrency
        };
    }

    // Forçar execução manual (para testes)
    async forceCheck() {
        if (!this.isRunning) {
            logger.warn('Service not running, cannot force check', { 
                component: 'EXPIRED_PLANS_SERVICE' 
            });
            return false;
        }

        logger.info('Forcing manual expired plans check', { 
            component: 'EXPIRED_PLANS_SERVICE' 
        });

        await this.checkExpiredPlans();
        return true;
    }
}

module.exports = DailyExpiredPlansService;