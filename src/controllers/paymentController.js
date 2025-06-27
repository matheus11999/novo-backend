const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/database');
const { payment } = require('../config/mercadopago');

class PaymentController {
    async getPlans(req, res) {
        try {
            const mikrotikId = req.mikrotik.id;

            const { data: planos, error } = await supabase
                .from('planos')
                .select('*')
                .eq('mikrotik_id', mikrotikId)
                .eq('ativo', true)
                .order('preco', { ascending: true });

            if (error) {
                throw error;
            }

            res.json({
                success: true,
                data: planos
            });
        } catch (error) {
            console.error('Error fetching plans:', error);
            res.status(500).json({
                error: 'Failed to fetch plans',
                message: error.message
            });
        }
    }

    async createPayment(req, res) {
        try {
            const { plano_id } = req.body;
            const mikrotik = req.mikrotik;

            if (!plano_id) {
                return res.status(400).json({
                    error: 'Plan ID is required',
                    message: 'Please provide a valid plan ID'
                });
            }

            const { data: plano, error: planoError } = await supabase
                .from('planos')
                .select('*')
                .eq('id', plano_id)
                .eq('mikrotik_id', mikrotik.id)
                .eq('ativo', true)
                .single();

            if (planoError || !plano) {
                return res.status(404).json({
                    error: 'Plan not found',
                    message: 'The specified plan was not found or is not active'
                });
            }

            const paymentId = uuidv4();
            
            // Generate webhook URL dynamically based on request
            const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
            const host = req.get('host');
            const webhookUrl = `${protocol}://${host}/api/webhook/mercadopago`;

            const porcentagemAdmin = parseFloat(mikrotik.porcentagem);
            const valorTotal = parseFloat(plano.preco);
            const valorAdmin = (valorTotal * porcentagemAdmin) / 100;
            const valorUsuario = valorTotal - valorAdmin;

            const paymentData = {
                transaction_amount: valorTotal,
                description: `Plano ${plano.name} - ${plano.session_timeout}`,
                payment_method_id: 'pix',
                external_reference: paymentId,
                notification_url: webhookUrl,
                payer: {
                    email: 'customer@example.com',
                    first_name: 'Cliente',
                    last_name: 'Mikrotik'
                }
            };

            const mpPayment = await payment.create({ body: paymentData });

            if (!mpPayment || !mpPayment.id) {
                throw new Error('Failed to create MercadoPago payment');
            }

            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + 30); // 30 minutes to pay

            const { data: venda, error: vendaError } = await supabase
                .from('vendas')
                .insert({
                    mikrotik_id: mikrotik.id,
                    plano_id: plano.id,
                    payment_id: paymentId,
                    status: 'pending',
                    valor_total: valorTotal,
                    valor_admin: valorAdmin,
                    valor_usuario: valorUsuario,
                    mercadopago_payment_id: mpPayment.id.toString(),
                    mercadopago_status: mpPayment.status,
                    qr_code: mpPayment.point_of_interaction?.transaction_data?.qr_code_base64 || null,
                    pix_code: mpPayment.point_of_interaction?.transaction_data?.qr_code || null,
                    expires_at: expiresAt.toISOString()
                })
                .select()
                .single();

            if (vendaError) {
                throw vendaError;
            }

            res.json({
                success: true,
                data: {
                    payment_id: paymentId,
                    mercadopago_payment_id: mpPayment.id,
                    qr_code: mpPayment.point_of_interaction?.transaction_data?.qr_code_base64,
                    pix_code: mpPayment.point_of_interaction?.transaction_data?.qr_code,
                    amount: valorTotal,
                    expires_at: expiresAt,
                    status: 'pending'
                }
            });
        } catch (error) {
            console.error('Error creating payment:', error);
            res.status(500).json({
                error: 'Failed to create payment',
                message: error.message
            });
        }
    }

    async getPaymentStatus(req, res) {
        try {
            const { payment_id } = req.params;
            const mikrotik = req.mikrotik;

            const { data: venda, error } = await supabase
                .from('vendas')
                .select(`
                    *,
                    planos (
                        name,
                        session_timeout,
                        preco
                    )
                `)
                .eq('payment_id', payment_id)
                .eq('mikrotik_id', mikrotik.id)
                .single();

            if (error || !venda) {
                return res.status(404).json({
                    error: 'Payment not found',
                    message: 'The specified payment was not found'
                });
            }

            res.json({
                success: true,
                data: {
                    payment_id: venda.payment_id,
                    status: venda.status,
                    mercadopago_status: venda.mercadopago_status,
                    amount: venda.valor_total,
                    plan: venda.planos,
                    usuario_criado: venda.usuario_criado,
                    senha_usuario: venda.senha_usuario,
                    expires_at: venda.expires_at,
                    paid_at: venda.paid_at,
                    created_at: venda.created_at
                }
            });
        } catch (error) {
            console.error('Error fetching payment status:', error);
            res.status(500).json({
                error: 'Failed to fetch payment status',
                message: error.message
            });
        }
    }
}

module.exports = new PaymentController();