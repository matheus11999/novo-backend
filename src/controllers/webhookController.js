const { supabase } = require('../config/database');
const { payment } = require('../config/mercadopago');
const axios = require('axios');
const MikroTikUserService = require('../services/mikrotikUserService');
const paymentPollingService = require('../services/paymentPollingService');
const automaticWithdrawalService = require('../services/automaticWithdrawalService');
const { formatDurationInMinutes } = require('./paymentController');

class WebhookController {
    constructor() {
        this.mikrotikUserService = new MikroTikUserService();
    }

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

            // USAR NOVA TABELA vendas_pix
            const { data: venda, error: vendaError } = await supabase
                .from('vendas_pix')
                .select(`
                    *,
                    mikrotiks!inner(*),
                    planos!inner(*)
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

            // Handle different payment statuses
            console.log(`📊 [WEBHOOK] Status: ${mpPayment.status} | Detail: ${mpPayment.status_detail}`);
            
            if (mpPayment.status === 'approved' && venda.status !== 'completed') {
                updateData.status = 'completed';
                updateData.paid_at = new Date().toISOString();
                console.log('✅ [WEBHOOK] Pagamento aprovado - processando...');
                
                // Processar comissões e criar usuário MikroTik
                await this.processApprovedPayment(venda, mpPayment);
                
            } else if (mpPayment.status === 'rejected') {
                updateData.status = 'failed';
                updateData.failed_at = new Date().toISOString();
                console.log('❌ [WEBHOOK] Pagamento rejeitado');
            } else if (mpPayment.status === 'cancelled') {
                updateData.status = 'cancelled';
                updateData.cancelled_at = new Date().toISOString();
                console.log('⏹️ [WEBHOOK] Pagamento cancelado');
            } else if (mpPayment.status === 'pending') {
                // Manter como pending, apenas atualizar status detail
                console.log('⏳ [WEBHOOK] Pagamento ainda pendente');
            } else if (mpPayment.status === 'in_process') {
                updateData.status = 'processing';
                console.log('🔄 [WEBHOOK] Pagamento em processamento');
            } else {
                console.log(`ℹ️ [WEBHOOK] Status não mapeado: ${mpPayment.status}`);
            }

            // Update the sale record
            const { error: updateError } = await supabase
                .from('vendas_pix')
                .update(updateData)
                .eq('id', venda.id);

            if (updateError) {
                console.error('❌ Erro ao atualizar venda PIX:', updateError);
                throw updateError;
            }

            console.log(`Payment status updated to: ${mpPayment.status}`);
            res.status(200).json({ message: 'Webhook processed successfully' });
        } catch (error) {
            console.error('Webhook processing error:', error);
            res.status(500).json({
                error: 'Webhook processing failed',
                message: error.message
            });
        }
    }

    async processApprovedPayment(venda, mpPayment) {
        try {
            console.log(`💰 [WEBHOOK] Processando pagamento aprovado: ${venda.payment_id}`);
            
            // 1. Criar comissões no histórico
            await this.createCommissionHistory(venda);
            
            // 2. Atualizar saldos dos usuários
            await this.updateUserBalances(venda);
            
            // 3. Tentar criar IP binding no MikroTik (se ainda não foi criado)
            if (!venda.ip_binding_created) {
                await this.createMikrotikIpBinding(venda, mpPayment);
            } else {
                console.log(`ℹ️ [WEBHOOK] IP binding já foi criado para venda: ${venda.payment_id}`);
            }
            
            console.log(`✅ [WEBHOOK] Pagamento processado com sucesso: ${venda.payment_id}`);
        } catch (error) {
            console.error(`❌ [WEBHOOK] Erro ao processar pagamento: ${venda.payment_id}`, error);
            
            // Salvar erro na venda
            await supabase
                .from('vendas_pix')
                .update({
                    error_message: `Erro no processamento: ${error.message}`,
                    updated_at: new Date().toISOString()
                })
                .eq('id', venda.id);
        }
    }

    async createCommissionHistory(venda) {
        try {
            console.log('💳 [WEBHOOK] Criando histórico de comissões para venda:', venda.payment_id);
            
            // Buscar o admin user_id
            const { data: adminUser, error: adminError } = await supabase
                .from('users')
                .select('id')
                .eq('role', 'admin')
                .limit(1)
                .single();

            if (adminError || !adminUser) {
                console.error('❌ Admin user não encontrado:', adminError);
                throw new Error('Admin user not found');
            }

            const adminUserId = adminUser.id;
            const mikrotikUserId = venda.mikrotiks.user_id;

            // Criar registros de comissão
            const comissoes = [
                {
                    venda_pix_id: venda.id,
                    mikrotik_id: venda.mikrotik_id,
                    user_id: adminUserId,
                    tipo: 'admin',
                    valor: parseFloat(venda.valor_admin),
                    percentual: parseFloat(venda.porcentagem_admin),
                    descricao: `Comissão admin - Venda PIX ${venda.payment_id}`,
                    status: 'completed'
                },
                {
                    venda_pix_id: venda.id,
                    mikrotik_id: venda.mikrotik_id,
                    user_id: mikrotikUserId,
                    tipo: 'usuario',
                    valor: parseFloat(venda.valor_usuario),
                    percentual: 100 - parseFloat(venda.porcentagem_admin),
                    descricao: `Receita de venda PIX - ${venda.payment_id}`,
                    status: 'completed'
                }
            ];

            const { error: comissaoError } = await supabase
                .from('vendas_pix_comissoes')
                .insert(comissoes);

            if (comissaoError) {
                console.error('❌ Erro ao criar histórico de comissões:', comissaoError);
                throw comissaoError;
            }

            console.log('✅ Histórico de comissões criado com sucesso');
        } catch (error) {
            console.error('❌ Erro ao criar histórico de comissões:', error);
            throw error;
        }
    }

    async updateUserBalances(venda) {
        try {
            console.log('💰 [WEBHOOK] Atualizando saldos dos usuários para venda:', venda.payment_id);

            // Buscar admin user
            const { data: adminUser, error: adminError } = await supabase
                .from('users')
                .select('id, saldo')
                .eq('role', 'admin')
                .limit(1)
                .single();

            if (adminError || !adminUser) {
                console.error('❌ Admin user não encontrado:', adminError);
                throw new Error('Admin user not found');
            }

            const adminUserId = adminUser.id;
            const adminSaldoAnterior = parseFloat(adminUser.saldo) || 0;
            const adminSaldoNovo = adminSaldoAnterior + parseFloat(venda.valor_admin);

            // Buscar usuário do MikroTik
            const mikrotikUserId = venda.mikrotiks.user_id;
            const { data: mikrotikUser, error: mikrotikUserError } = await supabase
                .from('users')
                .select('id, saldo')
                .eq('id', mikrotikUserId)
                .single();

            if (mikrotikUserError || !mikrotikUser) {
                console.error('❌ MikroTik user não encontrado:', mikrotikUserError);
                throw new Error('MikroTik user not found');
            }

            const userSaldoAnterior = parseFloat(mikrotikUser.saldo) || 0;
            const userSaldoNovo = userSaldoAnterior + parseFloat(venda.valor_usuario);

            // Criar transações para histórico
            const transacoes = [];

            // Transação para admin
            if (parseFloat(venda.valor_admin) > 0) {
                transacoes.push({
                    user_id: adminUserId,
                    tipo: 'credito',
                    motivo: `Comissão admin - Venda PIX ${venda.payment_id}`,
                    valor: parseFloat(venda.valor_admin),
                    saldo_anterior: adminSaldoAnterior,
                    saldo_atual: adminSaldoNovo,
                    venda_id: venda.id
                });
            }

            // Transação para usuário do MikroTik (se diferente do admin)
            if (mikrotikUserId !== adminUserId && parseFloat(venda.valor_usuario) > 0) {
                transacoes.push({
                    user_id: mikrotikUserId,
                    tipo: 'credito',
                    motivo: `Receita de venda PIX - ${venda.payment_id}`,
                    valor: parseFloat(venda.valor_usuario),
                    saldo_anterior: userSaldoAnterior,
                    saldo_atual: userSaldoNovo,
                    venda_id: venda.id
                });
            }

            // Inserir transações
            if (transacoes.length > 0) {
                const { error: transacaoError } = await supabase
                    .from('transacoes')
                    .insert(transacoes);

                if (transacaoError) {
                    console.error('❌ Erro ao criar transações:', transacaoError);
                    throw transacaoError;
                }
            }

            // Atualizar saldo do admin
            if (parseFloat(venda.valor_admin) > 0) {
                const { error: adminUpdateError } = await supabase
                    .from('users')
                    .update({ saldo: adminSaldoNovo })
                    .eq('id', adminUserId);

                if (adminUpdateError) {
                    console.error('❌ Erro ao atualizar saldo do admin:', adminUpdateError);
                    throw adminUpdateError;
                }

                // Check and process automatic withdrawal for admin if conditions are met
                try {
                    const automaticWithdrawalResult = await automaticWithdrawalService.processAutomaticWithdrawal(
                        adminUserId, 
                        adminSaldoNovo, 
                        adminSaldoAnterior
                    );
                    
                    if (automaticWithdrawalResult.success) {
                        console.log('✅ Admin automatic withdrawal created:', automaticWithdrawalResult);
                    } else if (automaticWithdrawalResult.reason) {
                        console.log(`ℹ️ Admin automatic withdrawal not triggered: ${automaticWithdrawalResult.reason}`);
                    } else {
                        console.error('❌ Error in admin automatic withdrawal:', automaticWithdrawalResult.error);
                    }
                } catch (autoWithdrawalError) {
                    console.error('❌ Unexpected error in admin automatic withdrawal processing:', autoWithdrawalError);
                    // Don't throw here as this shouldn't break the main payment flow
                }
            }

            // Atualizar saldo do usuário do MikroTik (se diferente do admin)
            if (mikrotikUserId !== adminUserId && parseFloat(venda.valor_usuario) > 0) {
                const { error: userUpdateError } = await supabase
                    .from('users')
                    .update({ saldo: userSaldoNovo })
                    .eq('id', mikrotikUserId);

                if (userUpdateError) {
                    console.error('❌ Erro ao atualizar saldo do usuário:', userUpdateError);
                    throw userUpdateError;
                }

                // Check and process automatic withdrawal if conditions are met
                try {
                    const automaticWithdrawalResult = await automaticWithdrawalService.processAutomaticWithdrawal(
                        mikrotikUserId, 
                        userSaldoNovo, 
                        userSaldoAnterior
                    );
                    
                    if (automaticWithdrawalResult.success) {
                        console.log('✅ Automatic withdrawal created:', automaticWithdrawalResult);
                    } else if (automaticWithdrawalResult.reason) {
                        console.log(`ℹ️ Automatic withdrawal not triggered: ${automaticWithdrawalResult.reason}`);
                    } else {
                        console.error('❌ Error in automatic withdrawal:', automaticWithdrawalResult.error);
                    }
                } catch (autoWithdrawalError) {
                    console.error('❌ Unexpected error in automatic withdrawal processing:', autoWithdrawalError);
                    // Don't throw here as this shouldn't break the main payment flow
                }
            }

            console.log(`✅ Saldos atualizados com sucesso:`);
            console.log(`  📊 Admin: R$ ${adminSaldoAnterior.toFixed(2)} → R$ ${adminSaldoNovo.toFixed(2)} (+R$ ${venda.valor_admin})`);
            if (mikrotikUserId !== adminUserId) {
                console.log(`  📊 User: R$ ${userSaldoAnterior.toFixed(2)} → R$ ${userSaldoNovo.toFixed(2)} (+R$ ${venda.valor_usuario})`);
            }

        } catch (error) {
            console.error('❌ Erro ao atualizar saldos dos usuários:', error);
            // Melhorar log de erro para incluir detalhes da venda
            console.error('Detalhes da Venda com Erro:', {
                venda_id: venda.id,
                payment_id: venda.payment_id,
                mikrotik_id: venda.mikrotik_id,
                admin_id: venda.mikrotiks?.user_id,
            });
            throw error;
        }
    }

    async createMikrotikIpBinding(venda, mpPayment) {
        try {
            console.log(`🔗 [WEBHOOK] Criando IP binding no MikroTik para venda: ${venda.id}`);
            
            const mikrotik = venda.mikrotiks;
            if (!mikrotik || !mikrotik.ip || !(mikrotik.username || mikrotik.usuario) || !(mikrotik.password || mikrotik.senha)) {
                 const errorMsg = 'Credenciais do MikroTik ausentes ou incompletas na venda.';
                 console.error(`❌ [WEBHOOK] ${errorMsg}`, {
                    mikrotik_id: mikrotik.id,
                    has_ip: !!mikrotik.ip,
                    has_username: !!mikrotik.username,
                    has_usuario: !!mikrotik.usuario,
                    has_password: 'true', // não logar a senha
                 });
                 throw new Error(errorMsg);
            }

            console.log(`🔗 Creating MikroTik IP binding for MAC: ${venda.mac_address}`);

            const paymentData = {
                payment_id: venda.id,
                mac_address: venda.mac_address,
                plano_nome: venda.planos?.nome || 'N/A',
                plano_valor: venda.valor_total,
                plano_session_timeout: venda.planos?.session_timeout,
                plano_rate_limit: venda.planos?.rate_limit,
                // Dados do pagamento do MP para referência
                mp_payment_id: mpPayment.id,
                mp_status: mpPayment.status,
                mp_paid_at: mpPayment.date_approved,
            };

            const response = await this.mikrotikUserService.createIpBindingFromPayment(venda);

            if (response.success) {
                 console.log(`✅ [WEBHOOK] IP binding criado com sucesso via API para venda: ${venda.id}`);
                 await supabase
                    .from('vendas_pix')
                    .update({
                        ip_binding_created: true,
                        ip_binding_mac: venda.mac_address,
                        ip_binding_comment: response.details?.data?.comment || null,
                        ip_binding_created_at: new Date().toISOString(),
                        ip_binding_expires_at: response.details?.data?.expires_at || null,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', venda.id);
            } else {
                const errorMsg = `Falha na criação do IP binding: ${response.error}`;
                console.error(`❌ [WEBHOOK] ${errorMsg}`);
                throw new Error(errorMsg);
            }

        } catch (error) {
            console.error('❌ Erro ao criar IP binding:', error);
            // Lançar o erro para que a transação principal possa tratá-lo
            throw error;
        }
    }

    // Função auxiliar para criar usuário no MikroTik
    // NOTA: Esta função parece ser mais antiga e pode precisar de revisão,
    // mas o foco atual é no IP Binding.
    async createMikrotikUser(venda) {
        try {
            console.log(`[WEBHOOK] Criando usuário no MikroTik para venda: ${venda.id}`);
            
            const mikrotik = venda.mikrotiks;
            if (!mikrotik) {
                throw new Error('Dados do MikroTik não encontrados na venda');
            }

            const macAddress = venda.mac_address.replace(/:/g, '');
            const userData = {
                name: macAddress,
                password: macAddress,
                profile: venda.planos?.nome || 'default',
                comment: `PIX-${venda.id}`,
                'mac-address': venda.mac_address
            };
            
            // Lógica para chamar a API de criação de usuário
            // ... (código existente) ...

        } catch (error) {
            console.error('Erro ao criar usuário no MikroTik:', error);
            throw error;
        }
    }

    async deleteMikrotikUserByMac(mikrotik, macAddress) {
        try {
            console.log(`🗑️ Attempting to delete existing user with MAC: ${macAddress}`);
            
            const mikrotikApiUrl = process.env.MIKROTIK_API_URL || 'http://localhost:3001';
            const mikrotikApiToken = process.env.MIKROTIK_API_TOKEN;

            if (!mikrotikApiToken) {
                console.warn('⚠️ MIKROTIK_API_TOKEN not configured');
                return;
            }

            const credentials = {
                ip: mikrotik.ip,
                usuario: mikrotik.usuario,
                senha: mikrotik.senha,
                porta: mikrotik.porta || 8728
            };

            // Buscar usuários com o MAC
            const listResponse = await axios.post(`${mikrotikApiUrl}/users/list`, {
                credentials: credentials
            }, {
                headers: {
                    'Authorization': `Bearer ${mikrotikApiToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            if (listResponse.data?.success && listResponse.data?.data) {
                const users = listResponse.data.data;
                const cleanMac = macAddress.replace(/[:-]/g, '').toLowerCase();
                
                const userToDelete = users.find(user => 
                    (user['mac-address'] && user['mac-address'].replace(/[:-]/g, '').toLowerCase() === cleanMac) ||
                    (user.name && user.name.toLowerCase() === cleanMac)
                );

                if (userToDelete) {
                    console.log(`🎯 Found user to delete: ${userToDelete.name}`);
                    
                    await axios.post(`${mikrotikApiUrl}/users/delete`, {
                        credentials: credentials,
                        userId: userToDelete['.id']
                    }, {
                        headers: {
                            'Authorization': `Bearer ${mikrotikApiToken}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 10000
                    });
                    
                    console.log(`✅ Deleted existing user: ${userToDelete.name}`);
                } else {
                    console.log(`ℹ️ No existing user found with MAC: ${macAddress}`);
                }
            }
        } catch (error) {
            console.warn(`⚠️ Warning: Could not delete existing user with MAC ${macAddress}:`, error.message);
        }
    }
    
    async createMikrotikIpBindingAPI(mikrotik, paymentData) {
        try {
            console.log(`🔗 Creating MikroTik IP binding for MAC: ${paymentData.mac_address}`);
            
            const mikrotikApiUrl = process.env.MIKROTIK_API_URL || 'http://localhost:3001';
            const mikrotikApiToken = process.env.MIKROTIK_API_TOKEN;

            if (!mikrotikApiToken) {
                throw new Error('MIKROTIK_API_TOKEN not configured');
            }

            const credentials = {
                ip: mikrotik.ip,
                usuario: mikrotik.usuario,
                senha: mikrotik.senha,
                porta: mikrotik.porta || 8728
            };

            console.log(`📡 [WEBHOOK] Enviando request para MikroTik API:`, {
                payment_id: paymentData.payment_id,
                mac_address: paymentData.mac_address,
                plano_nome: paymentData.plano_nome,
                mikrotik_ip: credentials.ip
            });
            
            const response = await axios.post(`${mikrotikApiUrl}/ip-binding/create-from-payment?ip=${credentials.ip}&username=${credentials.usuario}&password=${credentials.senha}&port=${credentials.porta}`, {
                credentials: credentials,
                paymentData: paymentData
            }, {
                headers: {
                    'Authorization': `Bearer ${mikrotikApiToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            });

            console.log(`📥 MikroTik API response status:`, response.status);
            console.log(`📥 MikroTik API response data:`, JSON.stringify(response.data, null, 2));

            if (response.data?.success) {
                console.log(`✅ IP binding created successfully`);
                return {
                    success: true,
                    binding_id: response.data.data?.result?.[0] || null,
                    data: response.data
                };
            } else {
                const errorMsg = response.data?.error || response.data?.message || 'Unknown error creating IP binding';
                console.error(`❌ IP binding creation failed:`, errorMsg);
                console.error(`❌ Full response data:`, response.data);
                return {
                    success: false,
                    error: errorMsg
                };
            }
        } catch (error) {
            console.error('❌ MikroTik API Error details:');
            console.error('   - Error message:', error.message);
            console.error('   - Error code:', error.code);
            console.error('   - Request URL:', error.config?.url);
            console.error('   - Request data:', error.config?.data);
            
            if (error.response) {
                console.error('   - Response status:', error.response.status);
                console.error('   - Response data:', JSON.stringify(error.response.data, null, 2));
            } else if (error.request) {
                console.error('   - No response received');
                console.error('   - Request timeout or network error');
            }
            
            return {
                success: false,
                error: error.response?.data?.error || error.response?.data?.message || error.message
            };
        }
    }

    async manageMikrotikUser(mikrotik, userData, vendaId) {
        try {
            console.log(`🔧 Managing MikroTik user: ${userData.username || userData.name}`);
            
            const backendApiUrl = process.env.BACKEND_API_URL || 'http://localhost:3000';
            
            const payload = {
                mikrotik_id: mikrotik.id,
                mac_address: userData['mac-address'],
                username: userData.username || userData.name,
                password: userData.password,
                profile: userData.profile,
                comment: userData.comment
            };

            console.log(`📡 Calling internal API to manage user...`);
            
            const response = await axios.post(`${backendApiUrl}/api/mikrotik-user/manage-user`, payload, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            console.log(`📥 User management response:`, response.data);

            if (response.data?.success) {
                return {
                    success: true,
                    user_id: response.data.data?.create_result?.response?.data?.['.id'] || null,
                    data: response.data
                };
            } else {
                return {
                    success: false,
                    error: response.data?.message || 'User management failed'
                };
            }
        } catch (error) {
            console.error('❌ MikroTik user management error:', error.message);
            if (error.response) {
                console.error('❌ Error response:', error.response.data);
            }
            return {
                success: false,
                error: error.response?.data?.error || error.response?.data?.message || error.message
            };
        }
    }
}

module.exports = new WebhookController();