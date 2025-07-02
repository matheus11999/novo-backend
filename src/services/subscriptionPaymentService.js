const { supabase } = require('../config/database');
const { payment } = require('../config/mercadopago');
const subscriptionController = require('../controllers/subscriptionController');

class SubscriptionPaymentService {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.processingPayments = new Set();
        // Verificar a cada 2 minutos
        this.POLLING_INTERVAL = 2 * 60 * 1000; // 2 minutes
    }

    start() {
        if (this.isRunning) {
            console.log('🔄 [SUBSCRIPTION POLLING] Service is already running');
            return;
        }

        this.isRunning = true;
        console.log('🚀 [SUBSCRIPTION POLLING] Starting subscription payment verification service');
        
        // Primeira verificação imediata
        this.checkPendingPayments();
        
        // Depois verificar periodicamente
        this.intervalId = setInterval(() => {
            this.checkPendingPayments();
        }, this.POLLING_INTERVAL);
    }

    stop() {
        if (!this.isRunning) {
            console.log('⏹️  [SUBSCRIPTION POLLING] Service is not running');
            return;
        }

        this.isRunning = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        console.log('⏹️  [SUBSCRIPTION POLLING] Subscription payment verification service stopped');
        
        // Limpar pagamentos em processamento
        this.processingPayments.clear();
    }

    async checkPendingPayments() {
        try {
            console.log('🔍 [SUBSCRIPTION POLLING] Checking for pending subscription payments...');

            // Buscar pagamentos pendentes que não expiraram
            const { data: pendingPayments, error } = await supabase
                .from('subscription_payments')
                .select(`
                    *,
                    subscription_plans (*)
                `)
                .eq('status', 'pending')
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: true })
                .limit(50);

            if (error) {
                console.error('❌ [SUBSCRIPTION POLLING] Error fetching pending payments:', error);
                return;
            }

            if (!pendingPayments || pendingPayments.length === 0) {
                console.log('✅ [SUBSCRIPTION POLLING] No pending payments found');
                return;
            }

            console.log(`📋 [SUBSCRIPTION POLLING] Found ${pendingPayments.length} pending payments`);

            const processingPromises = pendingPayments.map(payment => 
                this.verifyPaymentStatus(payment)
            );

            await Promise.allSettled(processingPromises);

            console.log('🏁 [SUBSCRIPTION POLLING] Finished checking pending payments');

        } catch (error) {
            console.error('❌ [SUBSCRIPTION POLLING] Critical error in checkPendingPayments:', error);
        }
    }

    async verifyPaymentStatus(subscriptionPayment) {
        const paymentId = subscriptionPayment.payment_id;
        
        // Evitar processamento duplo
        if (this.processingPayments.has(paymentId)) {
            console.log(`⏭️  [SUBSCRIPTION POLLING] Payment ${paymentId} already being processed, skipping`);
            return;
        }

        this.processingPayments.add(paymentId);

        try {
            console.log(`🔍 [SUBSCRIPTION POLLING] Verifying payment: ${paymentId}`);

            if (!subscriptionPayment.mercadopago_payment_id) {
                console.log(`⚠️  [SUBSCRIPTION POLLING] Payment ${paymentId} has no MercadoPago ID`);
                return;
            }

            // Buscar status atualizado no MercadoPago
            const mpPayment = await payment.get({ 
                id: subscriptionPayment.mercadopago_payment_id 
            });

            if (!mpPayment) {
                console.log(`❌ [SUBSCRIPTION POLLING] MercadoPago payment not found: ${subscriptionPayment.mercadopago_payment_id}`);
                return;
            }

            const currentStatus = mpPayment.status;
            const currentStatusDetail = mpPayment.status_detail;

            console.log(`📊 [SUBSCRIPTION POLLING] Payment ${paymentId}: ${currentStatus} (${currentStatusDetail})`);

            // Se status mudou, processar
            if (currentStatus !== 'pending') {
                await this.processStatusChange(subscriptionPayment, mpPayment);
            } else {
                console.log(`⏳ [SUBSCRIPTION POLLING] Payment ${paymentId} still pending`);
            }

        } catch (error) {
            console.error(`❌ [SUBSCRIPTION POLLING] Error verifying payment ${paymentId}:`, error);
            
            // Se for erro de rate limit, aguardar um pouco
            if (error.message.includes('429') || error.message.includes('rate limit')) {
                console.log('⏰ [SUBSCRIPTION POLLING] Rate limit hit, waiting...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        } finally {
            this.processingPayments.delete(paymentId);
        }
    }

    async processStatusChange(subscriptionPayment, mpPayment) {
        const paymentId = subscriptionPayment.payment_id;
        const newStatus = mpPayment.status;

        try {
            console.log(`🔄 [SUBSCRIPTION POLLING] Processing status change for ${paymentId}: ${newStatus}`);

            // Atualizar status no database
            const updateData = {
                status: newStatus === 'approved' ? 'approved' : newStatus,
                paid_at: newStatus === 'approved' ? new Date().toISOString() : null,
                updated_at: new Date().toISOString()
            };

            const { error: updateError } = await supabase
                .from('subscription_payments')
                .update(updateData)
                .eq('id', subscriptionPayment.id);

            if (updateError) {
                throw updateError;
            }

            // Se aprovado, ativar assinatura
            if (newStatus === 'approved') {
                console.log(`✅ [SUBSCRIPTION POLLING] Payment ${paymentId} approved, activating subscription...`);
                
                await subscriptionController.activateSubscription(subscriptionPayment);
                
                // Log da transação
                await supabase
                    .from('transacoes')
                    .insert({
                        user_id: subscriptionPayment.user_id,
                        tipo: 'credito',
                        valor: 0,
                        saldo_anterior: 0,
                        saldo_atual: 0,
                        motivo: `Ativação do Plano - Pagamento ${paymentId} (Polling)`
                    });

                console.log(`🎉 [SUBSCRIPTION POLLING] Subscription activated successfully for payment ${paymentId}`);
                
            } else if (newStatus === 'rejected' || newStatus === 'cancelled') {
                console.log(`❌ [SUBSCRIPTION POLLING] Payment ${paymentId} ${newStatus}`);
            } else {
                console.log(`ℹ️  [SUBSCRIPTION POLLING] Payment ${paymentId} status: ${newStatus}`);
            }

        } catch (error) {
            console.error(`❌ [SUBSCRIPTION POLLING] Error processing status change for ${paymentId}:`, error);
            
            // Marcar erro no pagamento
            await supabase
                .from('subscription_payments')
                .update({
                    error_message: error.message,
                    updated_at: new Date().toISOString()
                })
                .eq('id', subscriptionPayment.id);
        }
    }

    async markExpiredPayments() {
        try {
            console.log('🕐 [SUBSCRIPTION POLLING] Marking expired payments...');

            const { data: expiredPayments, error } = await supabase
                .from('subscription_payments')
                .update({ status: 'expired' })
                .eq('status', 'pending')
                .lt('expires_at', new Date().toISOString())
                .select();

            if (error) {
                console.error('❌ [SUBSCRIPTION POLLING] Error marking expired payments:', error);
                return;
            }

            if (expiredPayments && expiredPayments.length > 0) {
                console.log(`⏰ [SUBSCRIPTION POLLING] Marked ${expiredPayments.length} payments as expired`);
            }

        } catch (error) {
            console.error('❌ [SUBSCRIPTION POLLING] Error in markExpiredPayments:', error);
        }
    }

    // Método para verificação manual de um pagamento específico
    async verifySpecificPayment(paymentId) {
        try {
            console.log(`🔍 [SUBSCRIPTION POLLING] Manual verification for payment: ${paymentId}`);

            const { data: subscriptionPayment, error } = await supabase
                .from('subscription_payments')
                .select(`
                    *,
                    subscription_plans (*)
                `)
                .eq('payment_id', paymentId)
                .single();

            if (error || !subscriptionPayment) {
                throw new Error('Payment not found');
            }

            await this.verifyPaymentStatus(subscriptionPayment);
            return true;

        } catch (error) {
            console.error(`❌ [SUBSCRIPTION POLLING] Error in manual verification:`, error);
            throw error;
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            processingPayments: Array.from(this.processingPayments),
            intervalMs: this.POLLING_INTERVAL
        };
    }
}

// Instância singleton
const subscriptionPaymentService = new SubscriptionPaymentService();

module.exports = subscriptionPaymentService; 