const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/database');
const { payment } = require('../config/mercadopago');

// Helper function to format duration
function formatDuration(sessionTimeout) {
    if (!sessionTimeout) return 'Ilimitado';
    
    const seconds = parseInt(sessionTimeout);
    if (isNaN(seconds)) return sessionTimeout;
    
    const days = Math.floor(seconds / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
        return `${days} dia${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
        return `${hours} hora${hours > 1 ? 's' : ''}`;
    } else if (minutes > 0) {
        return `${minutes} minuto${minutes > 1 ? 's' : ''}`;
    } else {
        return `${seconds} segundo${seconds > 1 ? 's' : ''}`;
    }
}

class PaymentController {
    async getPlans(req, res) {
        try {
            const mikrotikId = req.mikrotik.id;

            const { data: planos, error } = await supabase
                .from('planos')
                .select('*')
                .eq('mikrotik_id', mikrotikId)
                .eq('ativo', true)
                .order('valor', { ascending: true });

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

    async getPlansByMikrotik(req, res) {
        try {
            const { mikrotik_id } = req.body;

            if (!mikrotik_id) {
                return res.status(400).json({
                    error: 'MikroTik ID is required',
                    message: 'Please provide a valid mikrotik_id'
                });
            }

            // Get plans for the specified MikroTik
            const { data: planos, error } = await supabase
                .from('planos')
                .select('id, nome, valor, session_timeout, rate_limit, descricao')
                .eq('mikrotik_id', mikrotik_id)
                .eq('ativo', true)
                .eq('visivel', true)
                .order('valor', { ascending: true });

            if (error) {
                throw error;
            }

            // Format plans for captive portal
            const formattedPlans = planos.map(plano => ({
                id: plano.id,
                nome: plano.nome,
                preco: plano.valor,
                duracao: formatDuration(plano.session_timeout),
                descricao: plano.descricao,
                rate_limit: plano.rate_limit
            }));

            res.json({
                success: true,
                planos: formattedPlans
            });
        } catch (error) {
            console.error('Error fetching plans by mikrotik:', error);
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
            
            // Always use production URL for webhooks
            const webhookUrl = 'https://api.mikropix.online/api/webhook/mercadopago';

            const porcentagemAdmin = parseFloat(mikrotik.porcentagem);
            const valorTotal = parseFloat(plano.preco);
            const valorAdmin = (valorTotal * porcentagemAdmin) / 100;
            const valorUsuario = valorTotal - valorAdmin;

            const paymentData = {
                transaction_amount: valorTotal,
                description: `Plano ${plano.name} - ${plano.session_timeout}`,
                payment_method_id: 'pix',
                external_reference: paymentId,
                payer: {
                    email: 'customer@example.com',
                    first_name: 'Cliente',
                    last_name: 'Mikrotik'
                }
            };

            // Sempre configurar webhook em produção
            console.log(`[PAYMENT] Configurando webhook: ${webhookUrl}`);
            paymentData.notification_url = webhookUrl;

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

    async createCaptivePayment(req, res) {
        try {
            const { mikrotik_id, plano_id, mac_address } = req.body;

            if (!mikrotik_id || !plano_id || !mac_address) {
                return res.status(400).json({
                    error: 'Missing required fields',
                    message: 'mikrotik_id, plano_id, and mac_address are required'
                });
            }

            // Validate MAC address format
            const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
            if (!macRegex.test(mac_address)) {
                return res.status(400).json({
                    error: 'Invalid MAC address format',
                    message: 'MAC address must be in format XX:XX:XX:XX:XX:XX'
                });
            }

            // Check for existing pending payments for this MAC
            const { data: existingPayment, error: existingError } = await supabase
                .from('vendas')
                .select(`
                    *,
                    planos (nome, session_timeout, valor),
                    mikrotiks (nome)
                `)
                .eq('mikrotik_id', mikrotik_id)
                .eq('mac_address', mac_address.toUpperCase())
                .in('status', ['pending', 'processing'])
                .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()) // Últimos 30 minutos
                .order('created_at', { ascending: false })
                .limit(1);

            if (!existingError && existingPayment && existingPayment.length > 0) {
                const payment = existingPayment[0];
                console.log(`🔄 [PAYMENT] Retornando pagamento existente: ${payment.payment_id}`);
                
                return res.json({
                    success: true,
                    data: {
                        payment_id: payment.payment_id,
                        mercadopago_payment_id: payment.mercadopago_payment_id,
                        qr_code: payment.qr_code,
                        pix_code: payment.pix_code,
                        amount: payment.valor_total,
                        expires_at: payment.expires_at,
                        status: payment.status,
                        plan_name: payment.planos?.nome,
                        plan_duration: formatDuration(payment.planos?.session_timeout),
                        existing: true,
                        message: 'Pagamento existente encontrado'
                    }
                });
            }

            // Get MikroTik info
            const { data: mikrotik, error: mikrotikError } = await supabase
                .from('mikrotiks')
                .select('*')
                .eq('id', mikrotik_id)
                .eq('ativo', true)
                .single();

            if (mikrotikError || !mikrotik) {
                return res.status(404).json({
                    error: 'MikroTik not found',
                    message: 'The specified MikroTik was not found or is not active'
                });
            }

            // Get plan info
            const { data: plano, error: planoError } = await supabase
                .from('planos')
                .select('*')
                .eq('id', plano_id)
                .eq('mikrotik_id', mikrotik_id)
                .eq('ativo', true)
                .single();

            if (planoError || !plano) {
                return res.status(404).json({
                    error: 'Plan not found',
                    message: 'The specified plan was not found or is not active'
                });
            }

            const paymentId = uuidv4();
            
            // Always use production URL for webhooks
            const webhookUrl = 'https://api.mikropix.online/api/webhook/mercadopago';

            const porcentagemAdmin = parseFloat(mikrotik.porcentagem_admin) || 10;
            const valorTotal = parseFloat(plano.valor);
            const valorAdmin = (valorTotal * porcentagemAdmin) / 100;
            const valorUsuario = valorTotal - valorAdmin;

            // Gerar dados do pagador baseado no MAC address
            const cleanMac = mac_address.replace(/[:-]/g, '');
            const payerEmail = `cliente.${cleanMac.slice(-6)}@hotspot.com`;
            
            const paymentData = {
                transaction_amount: valorTotal,
                description: `${plano.nome} - ${formatDuration(plano.session_timeout)} - Hotspot`,
                payment_method_id: 'pix',
                external_reference: paymentId,
                payer: {
                    email: payerEmail,
                    first_name: 'Cliente',
                    last_name: 'Hotspot',
                    identification: {
                        type: 'CPF',
                        number: '11144477735' // CPF válido para hotspot
                    },
                    address: {
                        zip_code: '00000000',
                        street_name: 'Acesso Hotspot',
                        street_number: 1,
                        neighborhood: 'Centro',
                        city: 'Cidade',
                        federal_unit: 'SP'
                    }
                },
                metadata: {
                    mac_address: mac_address,
                    mikrotik_id: mikrotik_id,
                    plano_id: plano_id,
                    provedor: mikrotik.nome
                }
            };

            // Sempre configurar webhook em produção
            console.log(`[PAYMENT] Configurando webhook: ${webhookUrl}`);
            paymentData.notification_url = webhookUrl;

            const mpPayment = await payment.create({ body: paymentData });

            if (!mpPayment || !mpPayment.id) {
                throw new Error('Failed to create MercadoPago payment');
            }

            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + 30); // 30 minutes to pay

            const { data: venda, error: vendaError } = await supabase
                .from('vendas')
                .insert({
                    mikrotik_id: mikrotik_id,
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
                    mac_address: mac_address.toUpperCase(),
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
                    status: 'pending',
                    plan_name: plano.nome,
                    plan_duration: formatDuration(plano.session_timeout)
                }
            });
        } catch (error) {
            console.error('Error creating captive payment:', error);
            res.status(500).json({
                error: 'Failed to create payment',
                message: error.message
            });
        }
    }

    async getCaptivePaymentStatus(req, res) {
        try {
            const { payment_id, mac_address } = req.body;

            if (!payment_id) {
                return res.status(400).json({
                    error: 'Payment ID is required',
                    message: 'Please provide a valid payment_id'
                });
            }

            let query = supabase
                .from('vendas')
                .select(`
                    *,
                    planos (
                        nome,
                        session_timeout,
                        valor,
                        rate_limit
                    )
                `)
                .eq('payment_id', payment_id);

            // If MAC address is provided, also filter by it
            if (mac_address) {
                query = query.eq('mac_address', mac_address.toUpperCase());
            }

            const { data: venda, error } = await query.single();

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
                    mac_address: venda.mac_address,
                    expires_at: venda.expires_at,
                    paid_at: venda.paid_at,
                    created_at: venda.created_at
                }
            });
        } catch (error) {
            console.error('Error fetching captive payment status:', error);
            res.status(500).json({
                error: 'Failed to fetch payment status',
                message: error.message
            });
        }
    }

}

module.exports = new PaymentController();