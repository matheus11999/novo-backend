const { supabase } = require('../config/database');
const { payment } = require('../config/mercadopago');
const MikroTikUserService = require('./mikrotikUserService');
const logger = require('../config/logger');
const cacheService = require('../config/cache');
const circuitBreakerService = require('../config/circuitBreaker');
const errorLogService = require('./errorLogService');

class OptimizedPaymentPollingService {
    constructor() {
        this.mikrotikUserService = new MikroTikUserService();
        this.isRunning = false;
        this.processingPayments = new Set();
        this.pollingInterval = 60000; // 1 minuto (reduzido de 30s)
        this.intervalId = null;
        this.maxPaymentAge = 24 * 60 * 60 * 1000; // 24 horas
        this.batchSize = 20; // Processar em lotes de 20
        this.maxConcurrency = 5; // Máximo 5 processamentos simultâneos
        this.retryCount = new Map(); // Contar tentativas por pagamento
        this.maxRetries = 3;
        
        // Circuit breakers
        this.mpBreaker = circuitBreakerService.createMercadoPagoBreaker(
            this.getMercadoPagoPayment.bind(this)
        );
        this.mikrotikBreaker = circuitBreakerService.createMikrotikBreaker(
            this.createIpBindingForPayment.bind(this)
        );
    }

    start() {
        if (this.isRunning) {
            logger.info('Payment polling service already running', { 
                component: 'PAYMENT_POLLING' 
            });
            return;
        }

        this.isRunning = true;
        logger.info('Starting optimized payment polling service', { 
            component: 'PAYMENT_POLLING',
            interval: this.pollingInterval,
            batchSize: this.batchSize,
            maxConcurrency: this.maxConcurrency
        });
        
        // Executar limpeza inicial
        setTimeout(() => {
            this.cleanupOldTestPayments();
        }, 10000);
        
        // Executar imediatamente
        this.checkPendingPayments();
        
        // Agendar execuções periódicas
        this.intervalId = setInterval(() => {
            this.checkPendingPayments();
        }, this.pollingInterval);
    }

    stop() {
        if (!this.isRunning) {
            logger.info('Payment polling service already stopped', { 
                component: 'PAYMENT_POLLING' 
            });
            return;
        }

        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        logger.info('Payment polling service stopped', { 
            component: 'PAYMENT_POLLING' 
        });
    }

    async checkPendingPayments() {
        if (!this.isRunning) return;

        const startTime = Date.now();
        
        try {
            logger.info('Checking pending payments', { component: 'PAYMENT_POLLING' });
            
            // Query otimizada com índices - com tratamento de erro mais robusto
            let vendas, error;
            
            try {
                const result = await supabase
                    .from('vendas_pix')
                    .select(`
                        id,
                        payment_id,
                        mercadopago_payment_id,
                        status,
                        mercadopago_status,
                        ip_binding_created,
                        mac_address,
                        created_at,
                        user_id,
                        plano_id,
                        mikrotik_id,
                        planos(id, nome, valor),
                        mikrotiks(id, nome, ip, usuario, senha, porta, ativo)
                    `)
                    .or('status.eq.pending,and(status.eq.completed,ip_binding_created.eq.false)')
                    .not('mercadopago_status', 'eq', 'not_found')
                    .gte('created_at', new Date(Date.now() - this.maxPaymentAge).toISOString())
                    .order('created_at', { ascending: false })
                    .limit(100); // Limitar para não sobrecarregar
                
                vendas = result.data;
                error = result.error;
                
            } catch (queryError) {
                logger.error('Database query error in payment polling', { 
                    component: 'PAYMENT_POLLING',
                    error: queryError.message,
                    stack: queryError.stack
                });
                return;
            }

            if (error) {
                logger.error('Error fetching pending payments', { 
                    component: 'PAYMENT_POLLING',
                    error: error.message,
                    details: error.details || 'No additional details',
                    hint: error.hint || 'No hint available'
                });
                return;
            }

            if (!vendas || vendas.length === 0) {
                logger.info('No pending payments found', { component: 'PAYMENT_POLLING' });
                return;
            }

            logger.info('Found payments to process', { 
                component: 'PAYMENT_POLLING',
                count: vendas.length 
            });

            // Processar em lotes
            await this.processBatches(vendas);

            const duration = Date.now() - startTime;
            logger.performance('Payment polling cycle completed', {
                component: 'PAYMENT_POLLING',
                duration,
                totalPayments: vendas.length
            });

        } catch (error) {
            logger.error('Error in payment polling cycle', { 
                component: 'PAYMENT_POLLING',
                error: error.message,
                stack: error.stack,
                errorDetails: {
                    name: error.name,
                    cause: error.cause
                }
            });
        }
    }

    async processBatches(vendas) {
        const chunks = this.chunk(vendas, this.batchSize);
        
        for (const chunk of chunks) {
            if (!this.isRunning) break;
            
            // Processar lote com concorrência limitada
            const promises = chunk.map(venda => () => {
                logger.debug('Creating promise for payment processing', {
                    component: 'PAYMENT_POLLING',
                    paymentId: venda.payment_id,
                    vendaId: venda.id,
                    status: venda.status
                });
                return this.processVenda(venda);
            });
            
            // Aguardar com concorrência limitada
            const results = await this.promiseAllWithConcurrency(promises, this.maxConcurrency);
            
            // Log resultados do lote
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            
            // Log detalhado dos resultados
            for (let index = 0; index < results.length; index++) {
                const result = results[index];
                const venda = chunk[index];
                
                if (result.status === 'rejected') {
                    logger.error('Payment processing failed in batch', {
                        component: 'PAYMENT_POLLING',
                        paymentId: venda.payment_id,
                        vendaId: venda.id,
                        error: result.reason?.message || result.reason,
                        stack: result.reason?.stack
                    });
                } else if (result.value && !result.value.success) {
                    logger.warn('Payment processing completed with failure', {
                        component: 'PAYMENT_POLLING',
                        paymentId: venda.payment_id,
                        vendaId: venda.id,
                        reason: result.value.reason,
                        error: result.value.error
                    });

                    // Salvar failure no banco também
                    await errorLogService.logError({
                        component: 'PAYMENT_POLLING',
                        errorType: 'payment_processing_failure',
                        errorMessage: result.value.error || `Processing failed: ${result.value.reason}`,
                        errorStack: null,
                        context: {
                            reason: result.value.reason,
                            vendaInfo: {
                                id: venda.id,
                                payment_id: venda.payment_id,
                                status: venda.status,
                                mercadopago_payment_id: venda.mercadopago_payment_id,
                                mac_address: venda.mac_address
                            }
                        },
                        paymentId: venda.payment_id,
                        vendaId: venda.id,
                        userId: venda.user_id,
                        mikrotikId: venda.mikrotik_id,
                        severity: 'warn'
                    });
                }
            }
            
            logger.info('Batch processed', {
                component: 'PAYMENT_POLLING',
                batchSize: chunk.length,
                successful,
                failed
            });
            
            // Aguardar entre lotes para não sobrecarregar
            if (chunks.length > 1) {
                await this.sleep(500);
            }
        }
    }

    async processVenda(venda) {
        const paymentId = venda.payment_id;
        
        // Verificar se já está sendo processado
        if (this.processingPayments.has(paymentId)) {
            logger.debug('Payment already being processed', { 
                component: 'PAYMENT_POLLING',
                paymentId 
            });
            return { success: false, reason: 'already_processing' };
        }

        // Verificar limite de tentativas
        const retryCount = this.retryCount.get(paymentId) || 0;
        if (retryCount >= this.maxRetries) {
            logger.warn('Max retries exceeded for payment', { 
                component: 'PAYMENT_POLLING',
                paymentId,
                retryCount 
            });

            // Atualizar no banco para não ser mais processado
            try {
                await supabase
                    .from('vendas_pix')
                    .update({
                        mercadopago_status: 'not_found',
                        status: venda.status === 'completed' ? 'completed' : 'failed',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', venda.id);
            } catch (updateError) {
                logger.error('Error updating payment after max retries', {
                    component: 'PAYMENT_POLLING',
                    paymentId,
                    error: updateError.message
                });
            }

            // Reset retry counter to avoid memory leak
            this.retryCount.delete(paymentId);

            return { success: false, reason: 'max_retries_exceeded' };
        }

        // Marcar como sendo processado
        this.processingPayments.add(paymentId);

        try {
            logger.debug('Processing payment', { 
                component: 'PAYMENT_POLLING',
                paymentId,
                vendaData: {
                    id: venda.id,
                    status: venda.status,
                    mercadopago_status: venda.mercadopago_status,
                    ip_binding_created: venda.ip_binding_created
                }
            });

            // Verificações básicas de dados
            if (!venda || !venda.id) {
                logger.error('Invalid venda object', { 
                    component: 'PAYMENT_POLLING',
                    paymentId,
                    venda 
                });
                return { success: false, reason: 'invalid_venda_data' };
            }

            // Verificar se tem MercadoPago Payment ID
            if (!venda.mercadopago_payment_id) {
                logger.warn('Payment without MercadoPago ID', { 
                    component: 'PAYMENT_POLLING',
                    paymentId 
                });
                return { success: false, reason: 'no_mp_id' };
            }

            // Verificar cache primeiro
            const cacheKey = cacheService.keys.paymentStatus(venda.mercadopago_payment_id);
            let mpPayment = await cacheService.get(cacheKey);
            
            if (!mpPayment) {
                // Consultar MercadoPago com circuit breaker
                try {
                    mpPayment = await this.mpBreaker.fire(venda.mercadopago_payment_id);
                    
                    if (mpPayment) {
                        // Cache por 5 minutos
                        await cacheService.set(cacheKey, mpPayment, 300);
                    }
                } catch (circuitBreakerError) {
                    logger.warn('Circuit breaker error for MercadoPago API', { 
                        component: 'PAYMENT_POLLING',
                        paymentId,
                        error: circuitBreakerError.message
                    });
                    
                    // Tentar sem circuit breaker como fallback
                    try {
                        mpPayment = await this.getMercadoPagoPayment(venda.mercadopago_payment_id);
                        if (mpPayment) {
                            await cacheService.set(cacheKey, mpPayment, 300);
                        }
                    } catch (fallbackError) {
                        logger.error('Fallback MercadoPago API also failed', { 
                            component: 'PAYMENT_POLLING',
                            paymentId,
                            error: fallbackError.message
                        });
                        mpPayment = null;
                    }
                }
            }

            if (!mpPayment) {
                logger.error('Payment not found in MercadoPago', { 
                    component: 'PAYMENT_POLLING',
                    paymentId 
                });
                return { success: false, reason: 'mp_payment_not_found' };
            }

            logger.debug('MercadoPago payment status', { 
                component: 'PAYMENT_POLLING',
                paymentId,
                mpStatus: mpPayment.status,
                dbStatus: venda.status 
            });

            // Verificar se precisa atualizar
            const needsUpdate = mpPayment.status !== venda.mercadopago_status;
            const isApproved = mpPayment.status === 'approved';
            const wasNotCompleted = venda.status !== 'completed';
            const userNotCreated = !venda.ip_binding_created;

            let result = { success: true, action: 'no_change' };

            // Processar diferentes status
            if (isApproved && (wasNotCompleted || userNotCreated)) {
                result = await this.handleApprovedPayment(venda, mpPayment);
            } else if (mpPayment.status === 'rejected') {
                result = await this.handleRejectedPayment(venda, mpPayment);
            } else if (mpPayment.status === 'cancelled') {
                result = await this.handleCancelledPayment(venda, mpPayment);
            } else if (needsUpdate) {
                result = await this.updatePaymentStatus(venda, mpPayment);
            }

            // Resetar contador de tentativas se sucesso
            if (result.success) {
                this.retryCount.delete(paymentId);
            } else {
                this.retryCount.set(paymentId, retryCount + 1);
            }

            return result;

        } catch (error) {
            // Log detalhado no console
            logger.error('Error processing payment', { 
                component: 'PAYMENT_POLLING',
                paymentId,
                error: error.message,
                stack: error.stack,
                vendaInfo: {
                    id: venda.id,
                    status: venda.status,
                    mercadopago_payment_id: venda.mercadopago_payment_id,
                    mac_address: venda.mac_address
                }
            });

            // Salvar erro no banco de dados
            await errorLogService.logError({
                component: 'PAYMENT_POLLING',
                errorType: 'payment_processing_error',
                errorMessage: error.message,
                errorStack: error.stack,
                context: {
                    vendaInfo: {
                        id: venda.id,
                        status: venda.status,
                        mercadopago_payment_id: venda.mercadopago_payment_id,
                        mac_address: venda.mac_address,
                        ip_binding_created: venda.ip_binding_created,
                        created_at: venda.created_at
                    },
                    retryCount: retryCount,
                    maxRetries: this.maxRetries
                },
                paymentId: paymentId,
                vendaId: venda.id,
                userId: venda.user_id,
                mikrotikId: venda.mikrotik_id,
                severity: 'error'
            });
            
            // Incrementar contador de tentativas
            this.retryCount.set(paymentId, retryCount + 1);
            
            return { success: false, reason: 'processing_error', error: error.message };
            
        } finally {
            // Remover do conjunto de processamento
            this.processingPayments.delete(paymentId);
        }
    }

    async getMercadoPagoPayment(paymentId) {
        try {
            if (!paymentId) {
                logger.warn('MercadoPago payment ID is empty', { 
                    component: 'PAYMENT_POLLING' 
                });
                return null;
            }

            const mpPayment = await payment.get({ id: paymentId });
            
            // Verificar se o retorno é válido
            if (!mpPayment || !mpPayment.status) {
                logger.warn('Invalid MercadoPago response', { 
                    component: 'PAYMENT_POLLING',
                    paymentId,
                    response: mpPayment 
                });
                return null;
            }
            
            return mpPayment;
            
        } catch (error) {
            // Tratar erro 404 como não encontrado
            if (error.status === 404 || error.message?.includes('resource not found')) {
                logger.info('Payment not found in MercadoPago (404)', { 
                    component: 'PAYMENT_POLLING',
                    paymentId 
                });
                return null;
            }
            
            // Tratar erros de rede/timeout
            if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                logger.warn('MercadoPago network error', { 
                    component: 'PAYMENT_POLLING',
                    paymentId,
                    errorCode: error.code,
                    error: error.message
                });
                return null;
            }
            
            logger.error('MercadoPago API error', { 
                component: 'PAYMENT_POLLING',
                paymentId,
                error: error.message,
                status: error.status,
                code: error.code
            });
            
            throw error;
        }
    }

    async handleApprovedPayment(venda, mpPayment) {
        try {
            logger.info('Processing approved payment', { 
                component: 'PAYMENT_POLLING',
                paymentId: venda.payment_id 
            });

            // 1. Atualizar status da venda
            const updateData = {
                status: 'completed',
                mercadopago_status: mpPayment.status,
                paid_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // 2. Criar IP binding se necessário
            if (!venda.ip_binding_created) {
                logger.info('Creating IP binding for payment', { 
                    component: 'PAYMENT_POLLING',
                    paymentId: venda.payment_id,
                    macAddress: venda.mac_address 
                });
                
                const bindingResult = await this.mikrotikBreaker.fire(venda);
                
                if (bindingResult && bindingResult.success) {
                    updateData.ip_binding_created = true;

                    // Preenche colunas já existentes na tabela vendas_pix para manter consistência com o webhook
                    if (bindingResult.details?.data?.data) {
                        const bindingData = bindingResult.details.data.data;
                        updateData.ip_binding_mac = bindingData.mac_address || venda.mac_address;
                        updateData.ip_binding_comment = bindingData.comment || null;
                        updateData.ip_binding_created_at = bindingData.created_at || new Date().toISOString();
                        updateData.ip_binding_expires_at = bindingData.expires_at || null;
                    }

                    updateData.mikrotik_creation_status = 'success';
                    
                    logger.info('IP binding created successfully', { 
                        component: 'PAYMENT_POLLING',
                        paymentId: venda.payment_id 
                    });
                } else {
                    logger.error('Failed to create IP binding', { 
                        component: 'PAYMENT_POLLING',
                        paymentId: venda.payment_id,
                        error: bindingResult?.error 
                    });
                }
            }

            // 3. Atualizar no banco
            const { error } = await supabase
                .from('vendas_pix')
                .update(updateData)
                .eq('id', venda.id);

            if (error) {
                logger.error('Error updating payment in database', { 
                    component: 'PAYMENT_POLLING',
                    paymentId: venda.payment_id,
                    error: error.message 
                });
                return { success: false, reason: 'database_error', error: error.message };
            }

            // 4. Limpar cache relacionado
            await cacheService.del(cacheService.keys.paymentStatus(venda.mercadopago_payment_id));
            await cacheService.del(cacheService.keys.userPlans(venda.user_id));

            logger.info('Payment approved and processed successfully', { 
                component: 'PAYMENT_POLLING',
                paymentId: venda.payment_id 
            });

            return { success: true, action: 'approved_and_processed' };

        } catch (error) {
            logger.error('Error handling approved payment', { 
                component: 'PAYMENT_POLLING',
                paymentId: venda.payment_id,
                error: error.message 
            });
            return { success: false, reason: 'processing_error', error: error.message };
        }
    }

    async handleRejectedPayment(venda, mpPayment) {
        try {
            const { error } = await supabase
                .from('vendas_pix')
                .update({
                    status: 'failed',
                    mercadopago_status: mpPayment.status,
                    failure_reason: mpPayment.status_detail || 'Payment rejected',
                    updated_at: new Date().toISOString()
                })
                .eq('id', venda.id);

            if (error) {
                logger.error('Error updating rejected payment', { 
                    component: 'PAYMENT_POLLING',
                    paymentId: venda.payment_id,
                    error: error.message 
                });
                return { success: false, reason: 'database_error' };
            }

            logger.info('Payment rejected and updated', { 
                component: 'PAYMENT_POLLING',
                paymentId: venda.payment_id 
            });

            return { success: true, action: 'rejected_and_updated' };

        } catch (error) {
            logger.error('Error handling rejected payment', { 
                component: 'PAYMENT_POLLING',
                paymentId: venda.payment_id,
                error: error.message 
            });
            return { success: false, reason: 'processing_error' };
        }
    }

    async handleCancelledPayment(venda, mpPayment) {
        try {
            const { error } = await supabase
                .from('vendas_pix')
                .update({
                    status: 'cancelled',
                    mercadopago_status: mpPayment.status,
                    updated_at: new Date().toISOString()
                })
                .eq('id', venda.id);

            if (error) {
                logger.error('Error updating cancelled payment', { 
                    component: 'PAYMENT_POLLING',
                    paymentId: venda.payment_id,
                    error: error.message 
                });
                return { success: false, reason: 'database_error' };
            }

            logger.info('Payment cancelled and updated', { 
                component: 'PAYMENT_POLLING',
                paymentId: venda.payment_id 
            });

            return { success: true, action: 'cancelled_and_updated' };

        } catch (error) {
            logger.error('Error handling cancelled payment', { 
                component: 'PAYMENT_POLLING',
                paymentId: venda.payment_id,
                error: error.message 
            });
            return { success: false, reason: 'processing_error' };
        }
    }

    async updatePaymentStatus(venda, mpPayment) {
        try {
            const { error } = await supabase
                .from('vendas_pix')
                .update({
                    mercadopago_status: mpPayment.status,
                    updated_at: new Date().toISOString()
                })
                .eq('id', venda.id);

            if (error) {
                logger.error('Error updating payment status', { 
                    component: 'PAYMENT_POLLING',
                    paymentId: venda.payment_id,
                    error: error.message 
                });
                return { success: false, reason: 'database_error' };
            }

            logger.info('Payment status updated', { 
                component: 'PAYMENT_POLLING',
                paymentId: venda.payment_id,
                newStatus: mpPayment.status 
            });

            return { success: true, action: 'status_updated' };

        } catch (error) {
            logger.error('Error updating payment status', { 
                component: 'PAYMENT_POLLING',
                paymentId: venda.payment_id,
                error: error.message 
            });
            return { success: false, reason: 'processing_error' };
        }
    }

    async createIpBindingForPayment(venda) {
        try {
            return await this.mikrotikUserService.createIpBindingFromPayment(venda);
        } catch (error) {
            logger.error('Error creating IP binding', { 
                component: 'PAYMENT_POLLING',
                paymentId: venda.payment_id,
                error: error.message 
            });
            return { success: false, error: error.message };
        }
    }

    async cleanupOldTestPayments() {
        try {
            logger.info('Cleaning up old test payments', { component: 'PAYMENT_POLLING' });
            
            const cutoffDate = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)); // 7 dias
            
            const { error } = await supabase
                .from('vendas_pix')
                .update({ mercadopago_status: 'not_found' })
                .eq('status', 'pending')
                .lt('created_at', cutoffDate.toISOString());

            if (error) {
                logger.error('Error cleaning up old payments', { 
                    component: 'PAYMENT_POLLING',
                    error: error.message 
                });
            } else {
                logger.info('Old test payments cleaned up', { component: 'PAYMENT_POLLING' });
            }
        } catch (error) {
            logger.error('Error in cleanup process', { 
                component: 'PAYMENT_POLLING',
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

    async promiseAllWithConcurrency(promiseFunctions, concurrency) {
        const results = [];
        
        // Processar em lotes sequenciais para evitar problemas
        for (let i = 0; i < promiseFunctions.length; i += concurrency) {
            const batch = promiseFunctions.slice(i, i + concurrency);
            
            // Executar lote atual
            const batchPromises = batch.map(async (promiseFunc) => {
                try {
                    const result = await promiseFunc();
                    return { status: 'fulfilled', value: result };
                } catch (error) {
                    return { status: 'rejected', reason: error };
                }
            });
            
            // Aguardar todos do lote atual
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // Pequena pausa entre lotes
            if (i + concurrency < promiseFunctions.length) {
                await this.sleep(100);
            }
        }
        
        return results;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Health check
    getStatus() {
        return {
            isRunning: this.isRunning,
            pollingInterval: this.pollingInterval,
            processingCount: this.processingPayments.size,
            retryCount: this.retryCount.size,
            batchSize: this.batchSize,
            maxConcurrency: this.maxConcurrency,
            circuitBreakers: {
                mercadopago: this.mpBreaker.opened ? 'OPEN' : 'CLOSED',
                mikrotik: this.mikrotikBreaker.opened ? 'OPEN' : 'CLOSED'
            }
        };
    }
}

module.exports = OptimizedPaymentPollingService;