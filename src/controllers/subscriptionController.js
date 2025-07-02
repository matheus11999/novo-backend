const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/database');
const { payment } = require('../config/mercadopago');

class SubscriptionController {
    async createPayment(req, res) {
        try {
            const { plan_id } = req.body;
            const userId = req.user.id;

            if (!plan_id) {
                return res.status(400).json({
                    error: 'Plan ID is required',
                    message: 'Please provide a valid plan ID'
                });
            }

            // Buscar o plano
            const { data: plan, error: planError } = await supabase
                .from('subscription_plans')
                .select('*')
                .eq('id', plan_id)
                .eq('active', true)
                .single();

            if (planError || !plan) {
                return res.status(404).json({
                    error: 'Plan not found',
                    message: 'The specified plan was not found or is not active'
                });
            }

            // Buscar dados do usuário
            const { data: user, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();

            if (userError || !user) {
                return res.status(404).json({
                    error: 'User not found',
                    message: 'User not found'
                });
            }

            const paymentId = uuidv4();
            const webhookUrl = 'https://api.mikropix.online/api/webhook/subscription';

            const paymentData = {
                transaction_amount: parseFloat(plan.price),
                description: `Assinatura ${plan.name} - ${plan.duration_days} dias`,
                payment_method_id: 'pix',
                external_reference: paymentId,
                payer: {
                    email: user.email,
                    first_name: user.nome.split(' ')[0] || 'Cliente',
                    last_name: user.nome.split(' ').slice(1).join(' ') || 'MikroPix'
                },
                notification_url: webhookUrl
            };

            console.log(`[SUBSCRIPTION] Criando pagamento: ${paymentId} para usuário ${userId}`);
            const mpPayment = await payment.create({ body: paymentData });

            if (!mpPayment || !mpPayment.id) {
                throw new Error('Failed to create MercadoPago payment');
            }

            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + 30); // 30 minutes to pay

            // Salvar pagamento na tabela subscription_payments
            const { data: subscriptionPayment, error: paymentInsertError } = await supabase
                .from('subscription_payments')
                .insert({
                    user_id: userId,
                    plan_id: plan.id,
                    payment_id: paymentId,
                    mercadopago_payment_id: mpPayment.id.toString(),
                    amount: parseFloat(plan.price),
                    status: 'pending',
                    qr_code: mpPayment.point_of_interaction?.transaction_data?.qr_code_base64 || null,
                    pix_code: mpPayment.point_of_interaction?.transaction_data?.qr_code || null,
                    expires_at: expiresAt.toISOString()
                })
                .select()
                .single();

            if (paymentInsertError) {
                throw paymentInsertError;
            }

            console.log(`[SUBSCRIPTION] Pagamento criado com sucesso: ${paymentId}`);

            res.json({
                success: true,
                data: {
                    payment_id: paymentId,
                    mercadopago_payment_id: mpPayment.id,
                    qr_code: mpPayment.point_of_interaction?.transaction_data?.qr_code_base64,
                    pix_code: mpPayment.point_of_interaction?.transaction_data?.qr_code,
                    amount: parseFloat(plan.price),
                    expires_at: expiresAt,
                    status: 'pending'
                }
            });
        } catch (error) {
            console.error('Error creating subscription payment:', error);
            res.status(500).json({
                error: 'Failed to create payment',
                message: error.message
            });
        }
    }

    async getPaymentStatus(req, res) {
        try {
            const { payment_id } = req.params;
            const userId = req.user.id;

            const { data: payment, error } = await supabase
                .from('subscription_payments')
                .select('*')
                .eq('payment_id', payment_id)
                .eq('user_id', userId)
                .single();

            if (error || !payment) {
                return res.status(404).json({
                    error: 'Payment not found',
                    message: 'The specified payment was not found'
                });
            }

            res.json({
                success: true,
                data: payment
            });
        } catch (error) {
            console.error('Error fetching payment status:', error);
            res.status(500).json({
                error: 'Failed to fetch payment status',
                message: error.message
            });
        }
    }

    async processWebhook(req, res) {
        try {
            console.log('[SUBSCRIPTION WEBHOOK] Received webhook:', req.body);
            
            const { type, data } = req.body;
            
            // Only process payment notifications
            if (type !== 'payment') {
                console.log('[SUBSCRIPTION WEBHOOK] Notification type not handled:', type);
                return res.status(200).json({ message: 'Notification type not handled' });
            }
            
            if (!data || !data.id) {
                console.log('[SUBSCRIPTION WEBHOOK] Invalid webhook data');
                return res.status(400).json({ error: 'Invalid webhook data' });
            }

            const mercadopagoPaymentId = data.id.toString();
            console.log(`[SUBSCRIPTION WEBHOOK] Processing payment: ${mercadopagoPaymentId}`);

            // Buscar o pagamento no banco
            const { data: subscriptionPayment, error: paymentError } = await supabase
                .from('subscription_payments')
                .select(`
                    *,
                    subscription_plans (*)
                `)
                .eq('mercadopago_payment_id', mercadopagoPaymentId)
                .single();

            if (paymentError || !subscriptionPayment) {
                console.log(`[SUBSCRIPTION WEBHOOK] Payment not found: ${mercadopagoPaymentId}`);
                return res.status(404).json({ error: 'Payment not found' });
            }

            // Buscar detalhes do pagamento no MercadoPago
            const mpPayment = await payment.get({ id: mercadopagoPaymentId });
            
            if (!mpPayment) {
                console.log(`[SUBSCRIPTION WEBHOOK] MercadoPago payment not found: ${mercadopagoPaymentId}`);
                return res.status(404).json({ error: 'MercadoPago payment not found' });
            }

            const newStatus = mpPayment.status;
            const statusDetail = mpPayment.status_detail;
            
            console.log(`[SUBSCRIPTION WEBHOOK] Payment ${subscriptionPayment.payment_id}: ${newStatus} (${statusDetail})`);

            // Verificar se o status realmente mudou
            if (newStatus === subscriptionPayment.status) {
                console.log(`[SUBSCRIPTION WEBHOOK] Status unchanged for ${subscriptionPayment.payment_id}`);
                return res.status(200).json({ message: 'Status unchanged' });
            }

            // Atualizar status do pagamento
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

            // Se aprovado, ativar/renovar assinatura
            if (newStatus === 'approved') {
                console.log(`[SUBSCRIPTION WEBHOOK] Activating subscription for payment: ${subscriptionPayment.payment_id}`);
                
                await this.activateSubscription(subscriptionPayment);
                
                // Log da transação
                await supabase
                    .from('transacoes')
                    .insert({
                        user_id: subscriptionPayment.user_id,
                        tipo: 'credito',
                        valor: 0, // Não mexe no saldo, apenas ativa plano
                        saldo_anterior: 0,
                        saldo_atual: 0,
                        motivo: `Ativação do Plano - Pagamento ${subscriptionPayment.payment_id} (Webhook)`
                    });

                console.log(`[SUBSCRIPTION WEBHOOK] ✅ Subscription activated for user: ${subscriptionPayment.user_id}`);
                
            } else if (newStatus === 'rejected' || newStatus === 'cancelled') {
                console.log(`[SUBSCRIPTION WEBHOOK] ❌ Payment ${subscriptionPayment.payment_id} ${newStatus}`);
            } else {
                console.log(`[SUBSCRIPTION WEBHOOK] ℹ️ Payment ${subscriptionPayment.payment_id} status: ${newStatus}`);
            }

            res.status(200).json({ success: true, message: 'Webhook processed successfully' });
            
        } catch (error) {
            console.error('[SUBSCRIPTION WEBHOOK] Error processing webhook:', error);
            res.status(500).json({
                error: 'Failed to process webhook',
                message: error.message
            });
        }
    }

    async activateSubscription(subscriptionPayment) {
        try {
            // Buscar o plano
            const { data: plan } = await supabase
                .from('subscription_plans')
                .select('*')
                .eq('id', subscriptionPayment.plan_id)
                .single();

            if (!plan) {
                throw new Error('Plan not found');
            }

            // Verificar se já existe assinatura ativa
            const { data: currentSubscription } = await supabase
                .from('user_subscriptions')
                .select('*')
                .eq('user_id', subscriptionPayment.user_id)
                .eq('status', 'active')
                .order('expires_at', { ascending: false })
                .limit(1)
                .single();

            let startsAt = new Date();
            let expiresAt = new Date();

            if (currentSubscription && new Date(currentSubscription.expires_at) > startsAt) {
                // Se tem assinatura ativa, estender a partir da data de expiração atual
                startsAt = new Date(currentSubscription.expires_at);
                expiresAt = new Date(startsAt);
                expiresAt.setDate(expiresAt.getDate() + plan.duration_days);

                // Cancelar assinatura atual
                await supabase
                    .from('user_subscriptions')
                    .update({ status: 'cancelled' })
                    .eq('id', currentSubscription.id);
            } else {
                // Nova assinatura a partir de agora
                expiresAt.setDate(expiresAt.getDate() + plan.duration_days);
            }

            // Criar nova assinatura
            const { error: subscriptionError } = await supabase
                .from('user_subscriptions')
                .insert({
                    user_id: subscriptionPayment.user_id,
                    plan_id: plan.id,
                    starts_at: startsAt.toISOString(),
                    expires_at: expiresAt.toISOString(),
                    status: 'active'
                });

            if (subscriptionError) {
                throw subscriptionError;
            }

            // Atualizar o pagamento com a subscription_id
            await supabase
                .from('subscription_payments')
                .update({ subscription_id: subscriptionPayment.id })
                .eq('id', subscriptionPayment.id);

            console.log(`[SUBSCRIPTION] Activated subscription for user ${subscriptionPayment.user_id} until ${expiresAt}`);
        } catch (error) {
            console.error('Error activating subscription:', error);
            throw error;
        }
    }
}

module.exports = new SubscriptionController(); 