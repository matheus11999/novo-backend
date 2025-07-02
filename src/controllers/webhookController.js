const { supabase } = require('../config/database');
const { payment } = require('../config/mercadopago');
const axios = require('axios');
const MikroTikUserService = require('../services/mikrotikUserService');
const paymentPollingService = require('../services/paymentPollingService');

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
                    mikrotiks!inner(nome, user_id, porcentagem, ip, username, password, port)
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
                await this.processApprovedPayment(venda);
                
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

    async processApprovedPayment(venda) {
        try {
            console.log(`💰 [WEBHOOK] Processando pagamento aprovado: ${venda.payment_id}`);
            
            // 1. Criar comissões no histórico
            await this.createCommissionHistory(venda);
            
            // 2. Atualizar saldos dos usuários
            await this.updateUserBalances(venda);
            
            // 3. Tentar criar usuário no MikroTik (se ainda não foi criado)
            if (!venda.mikrotik_user_created) {
                await this.createMikrotikUser(venda);
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
            }

            console.log(`✅ Saldos atualizados com sucesso:`);
            console.log(`  📊 Admin: R$ ${adminSaldoAnterior.toFixed(2)} → R$ ${adminSaldoNovo.toFixed(2)} (+R$ ${venda.valor_admin})`);
            if (mikrotikUserId !== adminUserId) {
                console.log(`  📊 User: R$ ${userSaldoAnterior.toFixed(2)} → R$ ${userSaldoNovo.toFixed(2)} (+R$ ${venda.valor_usuario})`);
            }

        } catch (error) {
            console.error('❌ Erro ao atualizar saldos dos usuários:', error);
            throw error;
        }
    }

    async createMikrotikUser(venda) {
        try {
            console.log('👤 [WEBHOOK] Criando usuário no MikroTik para venda:', venda.payment_id);
            
            // Dados do usuário baseados no MAC address
            const macAddress = venda.mac_address;
            const normalizedMac = macAddress.replace(/[:-]/g, '').toUpperCase();
            const formattedMac = normalizedMac.match(/.{1,2}/g).join(':');
            
            // Comentário formatado para identificação
            const comment = `PIX ${venda.payment_id} - Plano: ${venda.plano_nome} - Valor: ${parseFloat(venda.plano_valor).toFixed(2)} - ${new Date().toISOString().split('T')[0]}`;
            
            const userData = {
                name: formattedMac,
                password: formattedMac,
                profile: venda.plano_nome || 'default',
                comment: comment,
                'mac-address': formattedMac
            };

            // Tentar criar via API do MikroTik
            const mikrotikResult = await this.createMikrotikUserAPI(venda.mikrotiks, userData, {
                nome: venda.plano_nome,
                session_timeout: venda.plano_session_timeout,
                rate_limit: venda.plano_rate_limit
            });

            if (mikrotikResult.success) {
                // Atualizar venda com sucesso
                await supabase
                    .from('vendas_pix')
                    .update({
                        usuario_criado: userData.name,
                        senha_usuario: userData.password,
                        mikrotik_user_id: mikrotikResult.mikrotikUserId || userData.name,
                        mikrotik_user_created: true,
                        mikrotik_creation_status: 'success',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', venda.id);

                console.log(`✅ Usuário MikroTik criado com sucesso: ${userData.name}`);
            } else {
                // Atualizar com erro
                await supabase
                    .from('vendas_pix')
                    .update({
                        mikrotik_creation_status: 'failed',
                        error_message: mikrotikResult.error || 'Falha na criação do usuário MikroTik',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', venda.id);

                console.error(`❌ Falha na criação do usuário MikroTik: ${mikrotikResult.error}`);
            }

        } catch (error) {
            console.error('❌ Erro ao criar usuário MikroTik:', error);
            
            // Atualizar venda com erro
            await supabase
                .from('vendas_pix')
                .update({
                    mikrotik_creation_status: 'failed',
                    error_message: `Erro na criação do usuário: ${error.message}`,
                    updated_at: new Date().toISOString()
                })
                .eq('id', venda.id);
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

    async createMikrotikUserAPI(mikrotik, userData, planData) {
        try {
            console.log(`👤 Creating MikroTik user: ${userData.username}`);
            
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

            const userPayload = {
                name: userData.username,
                password: userData.password,
                profile: userData.profile,
                comment: userData.comment,
                'mac-address': userData['mac-address']
            };

            console.log(`📡 Sending user creation request to MikroTik API:`, userPayload);
            
            const response = await axios.post(`${mikrotikApiUrl}/users/create`, {
                credentials: credentials,
                user: userPayload
            }, {
                headers: {
                    'Authorization': `Bearer ${mikrotikApiToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            console.log(`📥 MikroTik API response:`, response.data);

            if (response.data?.success) {
                return {
                    success: true,
                    user_id: response.data.data?.['.id'] || null,
                    data: response.data
                };
            } else {
                return {
                    success: false,
                    error: response.data?.error || response.data?.message || 'Unknown error creating user'
                };
            }
        } catch (error) {
            console.error('❌ MikroTik API Error:', error.message);
            if (error.response) {
                console.error('❌ Error response:', error.response.data);
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