const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/database');
const { payment } = require('../config/mercadopago');
const axios = require('axios');

/**
 * Atualizar comentário do usuário com data de expiração usando timezone de Manaus
 */
async function updateCommentWithExpiration(credentials, username, password, sessionTimeout) {
    try {
        const mikrotikProxyUrl = 'http://router.mikropix.online';
        
        // Buscar informações do usuário primeiro
        const userResponse = await axios.post(`${mikrotikProxyUrl}/api/mikrotik/public/check-voucher/${credentials.mikrotik_id}`, {
            username: username
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        if (!userResponse.data?.success || !userResponse.data?.exists) {
            throw new Error(`Usuário ${username} não encontrado no MikroTik`);
        }

        const mikrotikUser = userResponse.data.user;
        let originalComment = mikrotikUser.comment || '';
        
        // Calcular data de expiração usando timezone de Manaus
        const now = new Date();
        let durationInSeconds = 0;
        
        if (sessionTimeout) {
            const timeout = sessionTimeout.toString().toLowerCase();
            if (timeout.includes(':')) {
                // Formato HH:MM:SS
                const parts = timeout.split(':');
                durationInSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
            } else if (timeout.endsWith('h')) {
                // Formato "1h", "2h", etc.
                const hours = parseInt(timeout.replace('h', ''));
                durationInSeconds = hours * 3600;
            } else if (timeout.endsWith('m')) {
                // Formato "30m", "45m", etc.
                const minutes = parseInt(timeout.replace('m', ''));
                durationInSeconds = minutes * 60;
            } else {
                // Formato em segundos
                durationInSeconds = parseInt(timeout) || 3600;
            }
        } else {
            // Padrão: 1 hora se não especificado
            durationInSeconds = 3600;
        }
        
        const expirationDate = new Date(now.getTime() + (durationInSeconds * 1000));
        
        // Converter para timezone America/Manaus
        const manausTimeStr = expirationDate.toLocaleString("sv-SE", {
            timeZone: "America/Manaus",
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const expirationStr = manausTimeStr.replace(',', '');
        
        // Atualizar comentário adicionando ou substituindo data de expiração
        let updatedComment = originalComment;
        
        // Se já tem "e:" no comentário, substituir
        if (originalComment.includes(' e:')) {
            updatedComment = originalComment.replace(/ e:[^\s]+/, ` e:${expirationStr}`);
        } else {
            // Adicionar data de expiração
            updatedComment = originalComment ? `${originalComment} e:${expirationStr}` : `e:${expirationStr}`;
        }
        
        // Atualizar comentário via mikrotik-proxy-api
        const updateResponse = await axios.put(`${mikrotikProxyUrl}/api/mikrotik/public/update-hotspot-user/${credentials.mikrotik_id}`, {
            username: username,
            comment: updatedComment
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        if (updateResponse.data?.success) {
            console.log(`⏰ [UPDATE-COMMENT] Comentário atualizado com sucesso para usuário: ${username}`);
            console.log(`⏰ [UPDATE-COMMENT] Expiração adicionada: ${expirationStr} (Timezone: America/Manaus)`);
            return updateResponse.data;
        } else {
            throw new Error(`Falha ao atualizar comentário: ${updateResponse.data?.error || 'Erro desconhecido'}`);
        }
    } catch (error) {
        console.error(`❌ [UPDATE-COMMENT] Erro ao atualizar comentário para ${username}:`, error.message);
        throw error;
    }
}

// Helper function to format duration
function formatDuration(sessionTimeout) {
    if (!sessionTimeout) return 'Ilimitado';
    
    // Handle MikroTik format (1h, 3h, 24h, 7d, etc.)
    const timeString = sessionTimeout.toString().toLowerCase().trim();
    
    // If it's already a formatted string, return as is
    if (timeString.includes('hora') || timeString.includes('dia') || timeString.includes('minuto')) {
        return sessionTimeout;
    }
    
    // Parse MikroTik time format
    const timeMatch = timeString.match(/^(\d+)([smhdw]?)$/);
    
    if (timeMatch) {
        const value = parseInt(timeMatch[1]);
        const unit = timeMatch[2] || 's'; // default to seconds if no unit
        
        switch (unit) {
            case 's': // seconds
                if (value >= 86400) { // >= 1 day
                    const days = Math.floor(value / 86400);
                    return `${days} dia${days > 1 ? 's' : ''}`;
                } else if (value >= 3600) { // >= 1 hour
                    const hours = Math.floor(value / 3600);
                    return `${hours} hora${hours > 1 ? 's' : ''}`;
                } else if (value >= 60) { // >= 1 minute
                    const minutes = Math.floor(value / 60);
                    return `${minutes} minuto${minutes > 1 ? 's' : ''}`;
                } else {
                    return `${value} segundo${value !== 1 ? 's' : ''}`;
                }
            case 'm': // minutes
                if (value >= 1440) { // >= 1 day
                    const days = Math.floor(value / 1440);
                    return `${days} dia${days > 1 ? 's' : ''}`;
                } else if (value >= 60) { // >= 1 hour
                    const hours = Math.floor(value / 60);
                    return `${hours} hora${hours > 1 ? 's' : ''}`;
                } else {
                    return `${value} minuto${value > 1 ? 's' : ''}`;
                }
            case 'h': // hours
                if (value >= 24) { // >= 1 day
                    const days = Math.floor(value / 24);
                    return `${days} dia${days > 1 ? 's' : ''}`;
                } else {
                    return `${value} hora${value > 1 ? 's' : ''}`;
                }
            case 'd': // days
            case 'w': // weeks (treat as days * 7)
                const totalDays = unit === 'w' ? value * 7 : value;
                return `${totalDays} dia${totalDays > 1 ? 's' : ''}`;
            default:
                return sessionTimeout;
        }
    }
    
    // Fallback: try to parse as pure seconds
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
        return `${seconds} segundo${seconds !== 1 ? 's' : ''}`;
    }
}

// Helper function to format duration in minutes for consistency
function formatDurationInMinutes(sessionTimeout) {
    if (!sessionTimeout) return 'Sem limite';
    
    const timeString = sessionTimeout.toString().toLowerCase().trim();
    
    // Handle different formats and convert to minutes
    if (timeString.endsWith('h')) {
        const hours = parseInt(timeString.replace('h', ''));
        const minutes = hours * 60;
        return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
    } else if (timeString.endsWith('m')) {
        const minutes = parseInt(timeString.replace('m', ''));
        return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
    } else if (timeString.includes(':')) {
        // Formato HH:MM:SS
        const parts = timeString.split(':');
        const hours = parseInt(parts[0]) || 0;
        const mins = parseInt(parts[1]) || 0;
        const totalMinutes = (hours * 60) + mins;
        
        return totalMinutes === 1 ? '1 minuto' : `${totalMinutes} minutos`;
    } else {
        // Formato em segundos
        const seconds = parseInt(timeString);
        if (!isNaN(seconds)) {
            const minutes = Math.floor(seconds / 60);
            
            if (minutes >= 1) {
                return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
            } else {
                return `${seconds} segundos`;
            }
        }
    }
    
    return 'Sem limite';
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
                .select('id, nome, valor, session_timeout, rate_limit')
                .eq('mikrotik_id', mikrotik_id)
                .eq('ativo', true)
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

            // COMISSÃO CORRIGIDA: Admin sempre recebe 10%, usuário recebe 90%
            const CommissionService = require('../services/commissionService');
            const commission = CommissionService.calculateCommission(plano.valor);
            
            const valorTotal = commission.valorTotal;
            const valorAdmin = commission.valorAdmin;
            const valorUsuario = commission.valorUsuario;

            const paymentData = {
                transaction_amount: valorTotal,
                description: `Plano ${plano.nome} - ${formatDuration(plano.session_timeout)}`,
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

            // USAR NOVA TABELA vendas_pix
            const { data: venda, error: vendaError } = await supabase
                .from('vendas_pix')
                .insert({
                    mikrotik_id: mikrotik.id,
                    plano_id: plano.id,
                    payment_id: paymentId,
                    status: 'pending',
                    valor_total: commission.valorTotal,
                    valor_admin: commission.valorAdmin,
                    valor_usuario: commission.valorUsuario,
                    porcentagem_admin: commission.porcentagemAdmin,
                    porcentagem_usuario: commission.porcentagemUsuario,
                    mercadopago_payment_id: mpPayment.id.toString(),
                    mercadopago_status: mpPayment.status,
                    qr_code: mpPayment.point_of_interaction?.transaction_data?.qr_code_base64 || null,
                    pix_code: mpPayment.point_of_interaction?.transaction_data?.qr_code || null,
                    plano_nome: plano.nome,
                    plano_valor: plano.valor,
                    plano_session_timeout: plano.session_timeout,
                    plano_rate_limit: plano.rate_limit,
                    expires_at: expiresAt.toISOString()
                })
                .select()
                .single();

            if (vendaError) {
                console.error('❌ Erro ao criar venda PIX:', vendaError);
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
                    commission_info: {
                        total: commission.valorTotal,
                        admin_percentage: commission.porcentagemAdmin,
                        admin_amount: commission.valorAdmin,
                        user_percentage: commission.porcentagemUsuario,
                        user_amount: commission.valorUsuario
                    }
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

            // USAR NOVA TABELA vendas_pix
            const { data: venda, error } = await supabase
                .from('vendas_pix')
                .select('*')
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
                    plan: {
                        nome: venda.plano_nome,
                        valor: venda.plano_valor,
                        session_timeout: venda.plano_session_timeout,
                        rate_limit: venda.plano_rate_limit
                    },
                    usuario_criado: venda.usuario_criado,
                    senha_usuario: venda.senha_usuario,
                    expires_at: venda.expires_at,
                    paid_at: venda.paid_at,
                    created_at: venda.created_at,
                    commission_info: {
                        total: venda.valor_total,
                        admin_amount: venda.valor_admin,
                        user_amount: venda.valor_usuario,
                        admin_percentage: venda.porcentagem_admin
                    }
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

            // Check for existing pending payments for this MAC - USAR NOVA TABELA
            const { data: existingPayment, error: existingError } = await supabase
                .from('vendas_pix')
                .select('*')
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
                        plan_name: payment.plano_nome,
                        plan_duration: formatDuration(payment.plano_session_timeout),
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

            // COMISSÃO CORRIGIDA para Captive Portal: Admin sempre recebe 10%, usuário recebe 90%
            const CommissionService = require('../services/commissionService');
            const commission = CommissionService.calculateCommission(plano.valor);
            
            const valorTotal = commission.valorTotal;
            const valorAdmin = commission.valorAdmin;
            const valorUsuario = commission.valorUsuario;

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
            expiresAt.setMinutes(expiresAt.getMinutes() + 30);

            // USAR NOVA TABELA vendas_pix
            const { data: venda, error: vendaError } = await supabase
                .from('vendas_pix')
                .insert({
                    mikrotik_id: mikrotik_id,
                    plano_id: plano.id,
                    payment_id: paymentId,
                    status: 'pending',
                    valor_total: commission.valorTotal,
                    valor_admin: commission.valorAdmin,
                    valor_usuario: commission.valorUsuario,
                    porcentagem_admin: commission.porcentagemAdmin,
                    porcentagem_usuario: commission.porcentagemUsuario,
                    mercadopago_payment_id: mpPayment.id.toString(),
                    mercadopago_status: mpPayment.status,
                    qr_code: mpPayment.point_of_interaction?.transaction_data?.qr_code_base64 || null,
                    pix_code: mpPayment.point_of_interaction?.transaction_data?.qr_code || null,
                    mac_address: mac_address.toUpperCase(),
                    plano_nome: plano.nome,
                    plano_valor: plano.valor,
                    plano_session_timeout: plano.session_timeout,
                    plano_rate_limit: plano.rate_limit,
                    expires_at: expiresAt.toISOString()
                })
                .select()
                .single();

            if (vendaError) {
                console.error('❌ Erro ao criar venda PIX captive:', vendaError);
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
                    plan_duration: formatDuration(plano.session_timeout),
                    commission_info: {
                        total: commission.valorTotal,
                        admin_percentage: commission.porcentagemAdmin,
                        admin_amount: commission.valorAdmin,
                        user_percentage: commission.porcentagemUsuario,
                        user_amount: commission.valorUsuario
                    }
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
            const { payment_id } = req.params;

            // USAR NOVA TABELA vendas_pix
            const { data: venda, error } = await supabase
                .from('vendas_pix')
                .select(`
                    *,
                    mikrotiks!inner(nome, user_id)
                `)
                .eq('payment_id', payment_id)
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
                    plan: {
                        nome: venda.plano_nome,
                        valor: venda.plano_valor,
                        session_timeout: venda.plano_session_timeout,
                        rate_limit: venda.plano_rate_limit
                    },
                    usuario_criado: venda.usuario_criado,
                    senha_usuario: venda.senha_usuario,
                    expires_at: venda.expires_at,
                    paid_at: venda.paid_at,
                    created_at: venda.created_at,
                    mikrotik: venda.mikrotiks,
                    commission_info: {
                        total: venda.valor_total,
                        admin_amount: venda.valor_admin,
                        user_amount: venda.valor_usuario,
                        admin_percentage: venda.porcentagem_admin
                    }
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

    async checkCaptiveUser(req, res) {
        try {
            const { username, password, mikrotik_id, mac_address, ip_address, user_agent } = req.body;

            console.log(`🔍 [CAPTIVE-CHECK] Verificando usuário: ${username} no MikroTik: ${mikrotik_id}`);

            // Validar campos obrigatórios
            if (!username || !password || !mikrotik_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields',
                    message: 'username, password, and mikrotik_id are required'
                });
            }

            // Verificar se username = password conforme especificado
            if (username !== password) {
                console.log(`❌ [CAPTIVE-CHECK] Username/password não coincidem: ${username} != ${password}`);
                return res.status(401).json({
                    success: false,
                    error: 'Invalid credentials',
                    message: 'Username and password must be identical'
                });
            }

            // Buscar dados do MikroTik
            const { data: mikrotik, error: mikrotikError } = await supabase
                .from('mikrotiks')
                .select('*')
                .eq('id', mikrotik_id)
                .eq('ativo', true)
                .single();

            if (mikrotikError || !mikrotik) {
                console.error(`❌ [CAPTIVE-CHECK] MikroTik não encontrado: ${mikrotik_id}`);
                return res.status(404).json({
                    success: false,
                    error: 'MikroTik not found',
                    message: 'The specified MikroTik was not found or is not active'
                });
            }

            // Verificar se usuário existe no MikroTik usando a nova API proxy
            const mikrotikProxyUrl = 'http://router.mikropix.online';
            
            console.log(`🔗 [CAPTIVE-CHECK] Conectando no MikroTik: ${mikrotik.ip} via proxy`);
            console.log(`📤 [CAPTIVE-CHECK] Buscando usuário: ${username}`);

            const axios = require('axios');
            const userResponse = await axios.post(`${mikrotikProxyUrl}/api/mikrotik/public/check-voucher/${mikrotik_id}`, {
                username: username
            }, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            if (!userResponse.data?.success || !userResponse.data?.exists) {
                console.log(`❌ [CAPTIVE-CHECK] Usuário não encontrado no MikroTik: ${username}`);
                return res.status(404).json({
                    success: false,
                    error: 'User not found',
                    message: 'Senha errada, tente novamente.'
                });
            }

            const mikrotikUser = userResponse.data.user;
            console.log(`✅ [CAPTIVE-CHECK] Usuário encontrado:`, {
                name: mikrotikUser.name,
                profile: mikrotikUser.profile,
                comment: mikrotikUser.comment,
                uptime: mikrotikUser.uptime,
                disabled: mikrotikUser.disabled
            });

            // Verificar se o uptime está zerado (usuário nunca se conectou)
            const uptimeZerado = !userResponse.data.used;
            
            if (!uptimeZerado) {
                console.log(`⏰ [CAPTIVE-CHECK] Usuário já utilizou o voucher - Uptime: ${mikrotikUser.uptime}`);
                return res.status(409).json({
                    success: false,
                    error: 'Voucher already used',
                    message: `This voucher has already been used. Current uptime: ${mikrotikUser.uptime}`,
                    data: {
                        uptime: mikrotikUser.uptime,
                        isActive: mikrotikUser.isActive,
                        username: mikrotikUser.name
                    }
                });
            }
            
            console.log(`✅ [CAPTIVE-CHECK] Voucher ainda não foi usado - pode ser salvo no banco`);

            // Validar se a senha confere
            if (mikrotikUser.password !== password) {
                console.log(`❌ [CAPTIVE-CHECK] Senha incorreta para usuário: ${username}`);
                return res.status(401).json({
                    success: false,
                    error: 'Invalid password',
                    message: 'Password does not match'
                });
            }

            // Extrair informações do plano do comentário
            let planoNome = mikrotikUser.profile || 'default';
            let planoValor = 0;
            let temComentario = false;
            let isPixComment = false;

            // Função para detectar se é comentário PIX
            function isPixVoucher(comment) {
                if (!comment) return false;
                const comment_lower = comment.toLowerCase();
                return comment_lower.includes('pix') || 
                       comment_lower.includes('payment_id');
            }

            // Função para detectar voucher físico com padrão específico
            function isPhysicalVoucher(comment) {
                if (!comment) return false;
                const comment_lower = comment.toLowerCase();
                // Detectar padrão: "Plano: X - Valor: Y - Gerado DD/MM/YYYY..."
                return comment_lower.includes('plano:') && 
                       comment_lower.includes('valor:') && 
                       comment_lower.includes('gerado') &&
                       /\d{2}\/\d{2}\/\d{4}/.test(comment); // Data no formato DD/MM/YYYY
            }

            // Tentar extrair informações do comentário - verificação mais rigorosa
            const cleanComment = mikrotikUser.comment ? mikrotikUser.comment.trim() : '';
            let isPhysicalComment = false;
            if (cleanComment && cleanComment !== '' && cleanComment !== 'null' && cleanComment !== 'undefined') {
                temComentario = true;
                isPixComment = isPixVoucher(cleanComment);
                isPhysicalComment = isPhysicalVoucher(cleanComment);
                
                console.log(`💬 [CAPTIVE-CHECK] Comentário original:`, cleanComment);
                console.log(`🔍 [CAPTIVE-CHECK] Tipo de comentário: ${isPixComment ? 'PIX' : isPhysicalComment ? 'Voucher Físico' : 'Comentário Genérico'}`);
                
                // Extrair nome do plano (formato: "Plano: Nome do Plano")
                const planoMatch = cleanComment.match(/Plano:\s*([^-]+)/i);
                if (planoMatch) {
                    planoNome = planoMatch[1].trim();
                    console.log(`📋 [CAPTIVE-CHECK] Plano extraído do comentário:`, planoNome);
                }
                
                // Extrair valor (formatos: "Valor: 29.90", "R$ 29,90", "valor: R$ 29.50")
                const valorMatch = cleanComment.match(/valor[:\s]*(?:R\$\s*)?(\d+[.,]?\d*)/i);
                if (valorMatch) {
                    planoValor = parseFloat(valorMatch[1].replace(',', '.'));
                    console.log(`💰 [CAPTIVE-CHECK] Valor extraído do comentário:`, planoValor);
                } else {
                    console.log(`⚠️ [CAPTIVE-CHECK] Valor não encontrado no comentário`);
                }
            } else {
                console.log(`ℹ️ [CAPTIVE-CHECK] Usuário sem comentário válido - apenas autenticação`);
                console.log(`🔍 [CAPTIVE-CHECK] Comentário bruto:`, mikrotikUser.comment);
                console.log(`🔍 [CAPTIVE-CHECK] Comentário limpo:`, cleanComment);
            }

            // Buscar informações no banco de dados (sempre, para complementar ou usar como fallback)
            const { data: plano } = await supabase
                .from('planos')
                .select('valor, nome, session_timeout, id')
                .eq('mikrotik_id', mikrotik_id)
                .or(`nome.eq.${mikrotikUser.profile},profile.eq.${mikrotikUser.profile}`)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (plano) {
                // Se não tem comentário ou valor do comentário é 0, usar dados do banco
                if (!temComentario || planoValor === 0) {
                    planoValor = parseFloat(plano.valor) || 0;
                    planoNome = plano.nome || mikrotikUser.profile;
                    console.log(`📊 [CAPTIVE-CHECK] Usando dados do banco - Plano: ${planoNome}, Valor: ${planoValor}`);
                }
            } else {
                // Se não encontrou plano no banco e não tem comentário, usar valores mínimos
                if (!temComentario && planoValor === 0) {
                    planoValor = 0; // Valor padrão 0 para vouchers sem informação
                    planoNome = mikrotikUser.profile || 'voucher-fisico';
                    console.log(`🆓 [CAPTIVE-CHECK] Plano não encontrado no banco - usando valores padrão`);
                }
            }

            console.log(`💰 [CAPTIVE-CHECK] Informações do plano:`, {
                nome: planoNome,
                valor: planoValor,
                profile: mikrotikUser.profile,
                comment: mikrotikUser.comment || 'sem comentário',
                temComentario: temComentario,
                isPixComment: isPixComment
            });

            // Se usuário não tem comentário OU tem comentário genérico sem informações úteis, apenas autenticar
            const shouldAuthenticateOnly = !temComentario || (temComentario && !isPixComment && !isPhysicalComment && planoValor === 0);
            
            if (shouldAuthenticateOnly) {
                const authReason = !temComentario ? 'sem comentário' : 'comentário genérico sem valor extraível';
                console.log(`🆓 [CAPTIVE-CHECK] Usuário ${authReason} - apenas autenticando (SEM BANCO)`);
                console.log(`🆓 [CAPTIVE-CHECK] temComentario = ${temComentario}, isPixComment = ${isPixComment}, isPhysicalComment = ${isPhysicalComment}, planoValor = ${planoValor}`);
                
                // Só atualizar comentário se contém "Valor"
                if (temComentario && mikrotikUser.comment && mikrotikUser.comment.includes('Valor:')) {
                    try {
                        // Buscar duração do plano no banco
                        const { data: planoInfo } = await supabase
                            .from('planos')
                            .select('session_timeout')
                            .eq('mikrotik_id', mikrotik_id)
                            .eq('nome', mikrotikUser.profile)
                            .single();
                        
                        const sessionTimeout = planoInfo?.session_timeout || '1h';
                        await updateCommentWithExpiration({ mikrotik_id }, mikrotikUser.name, mikrotikUser.password, sessionTimeout);
                        console.log(`⏰ [CAPTIVE-CHECK] Comentário genérico atualizado com data de expiração`);
                    } catch (expError) {
                        console.warn(`⚠️ [CAPTIVE-CHECK] Erro ao atualizar comentário genérico com expiração:`, expError.message);
                    }
                }
                
                // Gerar URL de autenticação do captive portal
                const authUrl = `http://${mikrotik.ip}/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
                
                console.log(`🔐 [CAPTIVE-CHECK] URL de autenticação gerada: ${authUrl}`);
                console.log(`🚪 [CAPTIVE-CHECK] RETORNANDO AQUI - não vai para o banco de dados`);
                
                return res.json({
                    success: true,
                    message: 'Conectado!',
                    data: {
                        username: mikrotikUser.name,
                        profile: mikrotikUser.profile,
                        plan_name: planoNome,
                        plan_value: 0,
                        auth_url: authUrl,
                        mikrotik_user_id: mikrotikUser['.id'] || mikrotikUser.name,
                        auth_type: !temComentario ? 'No Comment Authentication' : 'Generic Comment No Value',
                        has_comment: temComentario,
                        comment_type: !temComentario ? 'none' : 'generic_no_value',
                        commission_applicable: false,
                        sale_recorded: false,
                        voucher_recorded: false
                    }
                });
            }

            // Se chegou aqui, é usuário com comentário válido que deve ser registrado no banco

            // Para usuários COM comentário de voucher físico com padrão específico, registrar APENAS na tabela voucher
            if (isPhysicalComment) {
                console.log(`🎫 [CAPTIVE-CHECK] Voucher físico com padrão específico - registrando APENAS na tabela voucher`);
            
                // Preparar dados apenas para voucher (não vai para vendas_pix)
                const valorTotal = Math.max(0, planoValor);
                const paymentId = uuidv4();
                const normalizedMac = mac_address ? mac_address.toUpperCase() : mikrotikUser.name;

                // Registrar voucher físico APENAS na tabela voucher
                const voucherData = {
                    senha: username,
                    valor_venda: valorTotal,
                    mikrotik_id: mikrotik_id,
                    nome_plano: planoNome,
                    mac_address: normalizedMac,
                    ip_address: ip_address,
                    user_agent: user_agent,
                    profile: mikrotikUser.profile,
                    mikrotik_user_id: mikrotikUser['.id'] || mikrotikUser.name,
                    tipo_voucher: 'fisico',
                    tem_comissao: false
                };

                const { data: voucher, error: voucherError } = await supabase
                    .from('voucher')
                    .insert(voucherData)
                    .select()
                    .single();

                if (voucherError) {
                    console.error(`❌ [CAPTIVE-CHECK] Erro ao registrar voucher físico:`, voucherError);
                    throw voucherError;
                } else {
                    console.log(`🎫 [CAPTIVE-CHECK] Voucher físico registrado:`, {
                        id: voucher.id,
                        senha: voucher.senha,
                        plano: voucher.nome_plano,
                        valor: voucher.valor_venda
                    });
                }

                // Atualizar comentário com data de expiração (só se contém "Valor:")
                if (mikrotikUser.comment && mikrotikUser.comment.includes('Valor:')) {
                    try {
                        // Buscar duração do plano no banco
                        const { data: planoInfo } = await supabase
                            .from('planos')
                            .select('session_timeout')
                            .eq('mikrotik_id', mikrotik_id)
                            .eq('nome', mikrotikUser.profile)
                            .single();
                        
                        const sessionTimeout = planoInfo?.session_timeout || '1h';
                        await updateCommentWithExpiration({ mikrotik_id }, mikrotikUser.name, mikrotikUser.password, sessionTimeout);
                        console.log(`⏰ [CAPTIVE-CHECK] Comentário físico atualizado com data de expiração`);
                    } catch (expError) {
                        console.warn(`⚠️ [CAPTIVE-CHECK] Erro ao atualizar comentário físico com expiração:`, expError.message);
                    }
                }

                // Gerar URL de autenticação para voucher físico
                const authUrl = `http://${mikrotik.ip}/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

                console.log(`🔐 [CAPTIVE-CHECK] URL de autenticação física gerada: ${authUrl}`);
                console.log(`✅ [CAPTIVE-CHECK] Voucher físico salvo APENAS na tabela voucher (não vai para vendas_pix)`);

                return res.json({
                    success: true,
                    message: 'Conectado!',
                    data: {
                        username: mikrotikUser.name,
                        profile: mikrotikUser.profile,
                        plan_name: planoNome,
                        plan_value: valorTotal,
                        auth_url: authUrl,
                        payment_id: paymentId,
                        sale_recorded: false, // NÃO foi salvo em vendas_pix
                        voucher_recorded: !voucherError,
                        mikrotik_user_id: mikrotikUser['.id'] || mikrotikUser.name,
                        admin_commission: 0,
                        user_commission: 0,
                        auth_type: 'Physical Voucher',
                        has_comment: true,
                        commission_applicable: false
                    }
                });
            }

            // Para usuários COM comentário PIX, registrar no banco apenas para relatório (SEM comissão)
            if (isPixComment) {
                console.log(`📊 [CAPTIVE-CHECK] Usuário PIX - registrando apenas para relatório (sem comissão)`);
            
                // Registrar apenas valor total sem calcular comissão
                const valorTotal = Math.max(0, planoValor);
                const valorAdmin = 0; // Sem comissão para admin
                const valorUsuario = 0; // Sem comissão para usuário

                // Registrar venda no banco de dados
                const paymentId = uuidv4();
                const normalizedMac = mac_address ? mac_address.toUpperCase() : mikrotikUser.name;

                const vendaData = {
                    mikrotik_id: mikrotik_id,
                    payment_id: paymentId,
                    status: 'completed',
                    valor_total: valorTotal,
                    valor_admin: valorAdmin,
                    valor_usuario: valorUsuario,
                    mac_address: normalizedMac,
                    ip_address: ip_address,
                    user_agent: user_agent,
                    usuario_criado: mikrotikUser.name,
                    senha_usuario: mikrotikUser.password,
                    mikrotik_user_id: mikrotikUser['.id'] || mikrotikUser.name,
                    paid_at: new Date().toISOString(),
                    mercadopago_status: 'approved',
                    mercadopago_payment_id: `captive_${paymentId}`
                };

                // Tentar associar a um plano existente
                const { data: planoExistente } = await supabase
                    .from('planos')
                    .select('id')
                    .eq('mikrotik_id', mikrotik_id)
                    .eq('nome', mikrotikUser.profile)
                    .single();

                if (planoExistente) {
                    vendaData.plano_id = planoExistente.id;
                }

                const { data: venda, error: vendaError } = await supabase
                    .from('vendas_pix')
                    .insert(vendaData)
                    .select()
                    .single();

                if (vendaError) {
                    console.error(`❌ [CAPTIVE-CHECK] Erro ao registrar venda PIX:`, vendaError);
                    throw vendaError;
                }

                console.log(`💾 [CAPTIVE-CHECK] Venda PIX registrada:`, {
                    id: venda.id,
                    payment_id: paymentId,
                    valor: valorTotal,
                    usuario: mikrotikUser.name
                });

                // Não registrar no histórico de vendas - apenas tracking sem comissão
                console.log(`📊 [CAPTIVE-CHECK] Voucher PIX registrado apenas para relatório (sem crédito ao usuário)`);
                console.log(`📋 [CAPTIVE-CHECK] Valor registrado: R$ ${valorTotal} (sem comissão)`);

                // Registrar voucher PIX na tabela específica
                const voucherData = {
                    senha: username,
                    data_conexao: new Date().toISOString(),
                    valor_venda: valorTotal,
                    mikrotik_id: mikrotik_id,
                    nome_plano: planoNome,
                    comentario_original: mikrotikUser.comment,
                    username: mikrotikUser.name,
                    mac_address: normalizedMac,
                    ip_address: ip_address,
                    user_agent: user_agent,
                    profile: mikrotikUser.profile,
                    mikrotik_user_id: mikrotikUser['.id'] || mikrotikUser.name,
                    tipo_voucher: 'pix',
                    tem_comissao: false
                };

                const { data: voucher, error: voucherError } = await supabase
                    .from('voucher')
                    .insert(voucherData)
                    .select()
                    .single();

                if (voucherError) {
                    console.error(`❌ [CAPTIVE-CHECK] Erro ao registrar voucher PIX:`, voucherError);
                } else {
                    console.log(`🎫 [CAPTIVE-CHECK] Voucher PIX registrado:`, {
                        id: voucher.id,
                        senha: voucher.senha,
                        plano: voucher.nome_plano,
                        valor: voucher.valor_venda
                    });
                }

                // Atualizar comentário com data de expiração (só se contém "Valor:")
                if (mikrotikUser.comment && mikrotikUser.comment.includes('Valor:')) {
                    try {
                        // Buscar duração do plano no banco
                        const { data: planoInfo } = await supabase
                            .from('planos')
                            .select('session_timeout')
                            .eq('mikrotik_id', mikrotik_id)
                            .eq('nome', mikrotikUser.profile)
                            .single();
                        
                        const sessionTimeout = planoInfo?.session_timeout || '1h';
                        await updateCommentWithExpiration({ mikrotik_id }, mikrotikUser.name, mikrotikUser.password, sessionTimeout);
                        console.log(`⏰ [CAPTIVE-CHECK] Comentário PIX atualizado com data de expiração`);
                    } catch (expError) {
                        console.warn(`⚠️ [CAPTIVE-CHECK] Erro ao atualizar comentário PIX com expiração:`, expError.message);
                    }
                }

                // Gerar URL de autenticação para usuário PIX
                const authUrl = `http://${mikrotik.ip}/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

                console.log(`🔐 [CAPTIVE-CHECK] URL de autenticação PIX gerada: ${authUrl}`);

                return res.json({
                    success: true,
                    message: 'Conectado!',
                    data: {
                        username: mikrotikUser.name,
                        profile: mikrotikUser.profile,
                        plan_name: planoNome,
                        plan_value: valorTotal,
                        auth_url: authUrl,
                        payment_id: paymentId,
                        sale_recorded: true,
                        voucher_recorded: !voucherError,
                        mikrotik_user_id: mikrotikUser['.id'] || mikrotikUser.name,
                        admin_commission: 0,
                        user_commission: 0,
                        auth_type: 'PIX Voucher',
                        has_comment: true,
                        commission_applicable: false
                    }
                });
            }

            // Para usuários físicos COM comentário, registrar no banco SEM comissão
            console.log(`🔶 [CAPTIVE-CHECK] Voucher físico com comentário - registrando no banco sem comissão`);
            
            // Calcular valores (sem comissão)
            const valorTotal = Math.max(0, planoValor);
            const paymentId = uuidv4();
            const normalizedMac = mac_address ? mac_address.toUpperCase() : mikrotikUser.name;

            // Registrar venda no banco de dados (apenas para tracking)
            const vendaData = {
                mikrotik_id: mikrotik_id,
                payment_id: paymentId,
                status: 'completed',
                valor_total: valorTotal,
                valor_admin: 0, // Sem comissão para admin
                valor_usuario: 0, // Sem comissão para usuário
                mac_address: normalizedMac,
                ip_address: ip_address,
                user_agent: user_agent,
                usuario_criado: mikrotikUser.name,
                senha_usuario: mikrotikUser.password,
                mikrotik_user_id: mikrotikUser['.id'] || mikrotikUser.name,
                paid_at: new Date().toISOString(),
                mercadopago_status: 'approved',
                mercadopago_payment_id: `physical_${paymentId}`
            };

            // Tentar associar a um plano existente
            const { data: planoExistente } = await supabase
                .from('planos')
                .select('id')
                .eq('mikrotik_id', mikrotik_id)
                .eq('nome', mikrotikUser.profile)
                .single();

            if (planoExistente) {
                vendaData.plano_id = planoExistente.id;
            }

            const { data: venda, error: vendaError } = await supabase
                .from('vendas_pix')
                .insert(vendaData)
                .select()
                .single();

            if (vendaError) {
                console.error(`❌ [CAPTIVE-CHECK] Erro ao registrar venda física:`, vendaError);
                throw vendaError;
            }

            console.log(`💾 [CAPTIVE-CHECK] Venda física registrada:`, {
                id: venda.id,
                payment_id: paymentId,
                valor: valorTotal,
                usuario: mikrotikUser.name
            });

            // Registrar voucher físico na tabela específica
            const voucherData = {
                senha: username,
                data_conexao: new Date().toISOString(),
                valor_venda: valorTotal,
                mikrotik_id: mikrotik_id,
                nome_plano: planoNome,
                comentario_original: mikrotikUser.comment,
                username: mikrotikUser.name,
                mac_address: normalizedMac,
                ip_address: ip_address,
                user_agent: user_agent,
                profile: mikrotikUser.profile,
                mikrotik_user_id: mikrotikUser['.id'] || mikrotikUser.name,
                tipo_voucher: 'fisico',
                tem_comissao: false
            };

            const { data: voucher, error: voucherError } = await supabase
                .from('voucher')
                .insert(voucherData)
                .select()
                .single();

            if (voucherError) {
                console.error(`❌ [CAPTIVE-CHECK] Erro ao registrar voucher físico:`, voucherError);
            } else {
                console.log(`🎫 [CAPTIVE-CHECK] Voucher físico registrado:`, {
                    id: voucher.id,
                    senha: voucher.senha,
                    plano: voucher.nome_plano,
                    valor: voucher.valor_venda
                });
            }

            // Atualizar comentário com data de expiração (só se contém "Valor:")
            if (mikrotikUser.comment && mikrotikUser.comment.includes('Valor:')) {
                try {
                    // Buscar duração do plano no banco
                    const { data: planoInfo } = await supabase
                        .from('planos')
                        .select('session_timeout')
                        .eq('mikrotik_id', mikrotik_id)
                        .eq('nome', mikrotikUser.profile)
                        .single();
                    
                    const sessionTimeout = planoInfo?.session_timeout || '1h';
                    await updateCommentWithExpiration({ mikrotik_id }, mikrotikUser.name, mikrotikUser.password, sessionTimeout);
                    console.log(`⏰ [CAPTIVE-CHECK] Comentário físico final atualizado com data de expiração`);
                } catch (expError) {
                    console.warn(`⚠️ [CAPTIVE-CHECK] Erro ao atualizar comentário físico final com expiração:`, expError.message);
                }
            }

            // Gerar URL de autenticação para usuário físico
            const authUrl = `http://${mikrotik.ip}/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

            console.log(`🔐 [CAPTIVE-CHECK] URL de autenticação física gerada: ${authUrl}`);

            return res.json({
                success: true,
                message: 'Conectado!',
                data: {
                    username: mikrotikUser.name,
                    profile: mikrotikUser.profile,
                    plan_name: planoNome,
                    plan_value: valorTotal,
                    auth_url: authUrl,
                    payment_id: paymentId,
                    sale_recorded: true,
                    voucher_recorded: !voucherError,
                    mikrotik_user_id: mikrotikUser['.id'] || mikrotikUser.name,
                    admin_commission: 0,
                    user_commission: 0,
                    auth_type: 'Physical Voucher',
                    has_comment: true,
                    commission_applicable: false
                }
            });

        } catch (error) {
            console.error('❌ [CAPTIVE-CHECK] Erro na verificação:', error);
            
            // Tratar erros específicos da API MikroTik
            if (error.response) {
                console.error('[CAPTIVE-CHECK] Erro da API MikroTik:', {
                    status: error.response.status,
                    data: error.response.data
                });
                
                if (error.response.status === 401) {
                    return res.status(500).json({
                        success: false,
                        error: 'MikroTik authentication failed',
                        message: 'Failed to authenticate with MikroTik'
                    });
                }
            }

            res.status(500).json({
                success: false,
                error: 'Failed to check user',
                message: error.message
            });
        }
    }


}

module.exports = new PaymentController();
module.exports.formatDurationInMinutes = formatDurationInMinutes;