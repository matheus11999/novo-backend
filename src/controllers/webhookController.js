const { supabase } = require('../config/database');
const { payment } = require('../config/mercadopago');
const { generateMikrotikUser } = require('../utils/mikrotikUtils');

class WebhookController {
    async handleMercadoPagoWebhook(req, res) {
        try {
            console.log('MercadoPago Webhook received:', req.body);

            const { type, data } = req.body;

            // Only process payment notifications
            if (type !== 'payment') {
                return res.status(200).json({ message: 'Notification type not handled' });
            }

            const paymentId = data.id;
            if (!paymentId) {
                return res.status(400).json({ error: 'Payment ID not provided' });
            }

            // Get payment details from MercadoPago
            const mpPayment = await payment.get({ id: paymentId });
            
            if (!mpPayment) {
                return res.status(404).json({ error: 'Payment not found in MercadoPago' });
            }

            const externalReference = mpPayment.external_reference;
            if (!externalReference) {
                console.log('No external reference found for payment:', paymentId);
                return res.status(200).json({ message: 'No external reference' });
            }

            // Find the sale in our database
            const { data: venda, error: vendaError } = await supabase
                .from('vendas')
                .select(`
                    *,
                    planos (*),
                    mikrotiks (*)
                `)
                .eq('payment_id', externalReference)
                .single();

            if (vendaError || !venda) {
                console.log('Sale not found for external reference:', externalReference);
                return res.status(404).json({ error: 'Sale not found' });
            }

            // Update payment status
            const updateData = {
                mercadopago_status: mpPayment.status,
                updated_at: new Date().toISOString()
            };

            // Handle approved payment
            if (mpPayment.status === 'approved' && venda.status !== 'completed') {
                updateData.status = 'completed';
                updateData.paid_at = new Date().toISOString();

                // Generate MikroTik user (placeholder - you mentioned you don't want this implemented yet)
                const mikrotikUser = generateMikrotikUser();
                updateData.usuario_criado = mikrotikUser.username;
                updateData.senha_usuario = mikrotikUser.password;

                // Update the sale
                const { error: updateError } = await supabase
                    .from('vendas')
                    .update(updateData)
                    .eq('id', venda.id);

                if (updateError) {
                    throw updateError;
                }

                // Create transaction history
                await this.createTransactionHistory(venda);

                console.log(`Payment approved and user created: ${mikrotikUser.username}`);
            } 
            // Handle other status updates
            else if (mpPayment.status !== venda.mercadopago_status) {
                const { error: updateError } = await supabase
                    .from('vendas')
                    .update(updateData)
                    .eq('id', venda.id);

                if (updateError) {
                    throw updateError;
                }

                console.log(`Payment status updated to: ${mpPayment.status}`);
            }

            res.status(200).json({ message: 'Webhook processed successfully' });
        } catch (error) {
            console.error('Webhook processing error:', error);
            res.status(500).json({
                error: 'Webhook processing failed',
                message: error.message
            });
        }
    }

    async createTransactionHistory(venda) {
        try {
            const historyEntries = [
                {
                    venda_id: venda.id,
                    mikrotik_id: venda.mikrotik_id,
                    user_id: venda.mikrotiks.user_id,
                    tipo: 'admin',
                    valor: venda.valor_admin,
                    descricao: `Comissão admin - Venda ${venda.payment_id}`
                },
                {
                    venda_id: venda.id,
                    mikrotik_id: venda.mikrotik_id,
                    user_id: venda.mikrotiks.user_id,
                    tipo: 'usuario',
                    valor: venda.valor_usuario,
                    descricao: `Pagamento usuario - Venda ${venda.payment_id}`
                }
            ];

            const { error } = await supabase
                .from('historico_vendas')
                .insert(historyEntries);

            if (error) {
                throw error;
            }

            console.log('Transaction history created for sale:', venda.payment_id);
        } catch (error) {
            console.error('Error creating transaction history:', error);
            throw error;
        }
    }
}

module.exports = new WebhookController();