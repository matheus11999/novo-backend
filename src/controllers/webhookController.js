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

            // Handle different payment statuses
            console.log(`📊 [WEBHOOK] Status: ${mpPayment.status} | Detail: ${mpPayment.status_detail}`);
            
            if (mpPayment.status === 'approved' && venda.status !== 'completed') {
                updateData.status = 'completed';
                updateData.paid_at = new Date().toISOString();
                console.log('✅ [WEBHOOK] Pagamento aprovado - processando...');
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

            // Apenas criar usuário se aprovado
            if (mpPayment.status === 'approved' && venda.status !== 'completed') {

                // Verificar se o polling service não está processando este pagamento
                const isBeingProcessed = paymentPollingService.processingPayments?.has(venda.payment_id);
                
                if (isBeingProcessed) {
                    console.log(`⏭️ [WEBHOOK] Pagamento ${venda.payment_id} sendo processado pelo polling, pulando...`);
                } else {
                    try {
                        // Marcar como sendo processado para evitar conflito
                        if (paymentPollingService.processingPayments) {
                            paymentPollingService.processingPayments.add(venda.payment_id);
                        }

                        // Create user in MikroTik using new service with retry
                        console.log(`🔧 [WEBHOOK] Criando usuário MikroTik para MAC: ${venda.mac_address}`);
                        
                        const userResult = await this.mikrotikUserService.createUserWithRetry(venda);
                        
                        if (userResult.success) {
                            updateData.usuario_criado = userResult.username;
                            updateData.senha_usuario = userResult.username;
                            updateData.mikrotik_user_id = userResult.mikrotikUserId;
                            
                            console.log(`✅ [WEBHOOK] Usuário MikroTik criado: ${userResult.username} (tentativa ${userResult.attempt})`);
                        } else {
                            console.error(`❌ [WEBHOOK] Falha na criação do usuário MikroTik:`, userResult.error);
                            updateData.error_message = userResult.error;
                            // Não falhar o pagamento, pois o sistema de retry cuidará disso
                        }
                    } catch (userError) {
                        console.error('❌ [WEBHOOK] Erro crítico na criação do usuário:', userError.message);
                        updateData.error_message = userError.message;
                        // Não falhar o pagamento, sistema de retry tentará novamente
                    } finally {
                        // Remover do conjunto de processamento
                        if (paymentPollingService.processingPayments) {
                            paymentPollingService.processingPayments.delete(venda.payment_id);
                        }
                    }
                }

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

                console.log(`💰 Payment approved for MAC: ${venda.mac_address}`);
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
            console.log('💳 Creating transaction history for sale:', venda.payment_id);
            
            // Buscar o admin user_id corretamente da tabela users
            const { data: adminUser, error: adminError } = await supabase
                .from('users')
                .select('id')
                .eq('role', 'admin')
                .limit(1)
                .single();

            if (adminError) {
                console.error('❌ Error finding admin user:', adminError);
                return;
            }

            const adminUserId = adminUser?.id;
            
            if (!adminUserId) {
                console.error('❌ Admin user not found');
                return;
            }

            const historyEntries = [
                {
                    venda_id: venda.id,
                    mikrotik_id: venda.mikrotik_id,
                    user_id: adminUserId, // Admin
                    tipo: 'admin',
                    valor: venda.valor_admin,
                    descricao: `Comissão admin - Venda ${venda.payment_id}`,
                    status: 'completed'
                },
                {
                    venda_id: venda.id,
                    mikrotik_id: venda.mikrotik_id,
                    user_id: venda.mikrotiks?.user_id || adminUserId, // Dono do MikroTik
                    tipo: 'usuario',
                    valor: venda.valor_usuario,
                    descricao: `Pagamento usuário - Venda ${venda.payment_id}`,
                    status: 'completed'
                }
            ];

            const { error } = await supabase
                .from('historico_vendas')
                .insert(historyEntries);

            if (error) {
                console.error('❌ Error inserting transaction history:', error);
                throw error;
            }

            // Criar transações para atualizar saldos
            await this.updateUserBalances(venda, adminUserId);

            console.log('✅ Transaction history created for sale:', venda.payment_id);
        } catch (error) {
            console.error('❌ Error creating transaction history:', error);
            // Não falhar o pagamento por causa disso
            console.warn('⚠️ Continuing without transaction history...');
        }
    }

    async updateUserBalances(venda, adminUserId) {
        try {
            console.log('💰 Updating user balances for sale:', venda.payment_id);

            // 1. Buscar saldo atual do admin
            const { data: adminData, error: adminError } = await supabase
                .from('users')
                .select('saldo')
                .eq('id', adminUserId)
                .single();

            if (adminError) {
                console.error('❌ Error fetching admin balance:', adminError);
                return;
            }

            const adminSaldoAnterior = parseFloat(adminData.saldo) || 0;
            const adminSaldoNovo = adminSaldoAnterior + parseFloat(venda.valor_admin);

            // 2. Buscar saldo atual do usuário do MikroTik
            const mikrotikUserId = venda.mikrotiks?.user_id || adminUserId;
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('saldo')
                .eq('id', mikrotikUserId)
                .single();

            if (userError) {
                console.error('❌ Error fetching user balance:', userError);
                return;
            }

            const userSaldoAnterior = parseFloat(userData.saldo) || 0;
            const userSaldoNovo = userSaldoAnterior + parseFloat(venda.valor_usuario);

            // 3. Criar as transações
            const transacoes = [
                {
                    user_id: adminUserId,
                    tipo: 'credito',
                    motivo: `Comissão admin - Venda ${venda.payment_id}`,
                    valor: parseFloat(venda.valor_admin),
                    referencia_id: venda.id,
                    referencia_tipo: 'venda',
                    saldo_anterior: adminSaldoAnterior,
                    saldo_atual: adminSaldoNovo
                },
                {
                    user_id: mikrotikUserId,
                    tipo: 'credito',
                    motivo: `Receita de venda - Venda ${venda.payment_id}`,
                    valor: parseFloat(venda.valor_usuario),
                    referencia_id: venda.id,
                    referencia_tipo: 'venda',
                    saldo_anterior: userSaldoAnterior,
                    saldo_atual: userSaldoNovo
                }
            ];

            const { error: transacaoError } = await supabase
                .from('transacoes')
                .insert(transacoes);

            if (transacaoError) {
                console.error('❌ Error creating balance transactions:', transacaoError);
                return;
            }

            // 4. Atualizar saldos dos usuários
            const { error: adminUpdateError } = await supabase
                .from('users')
                .update({ saldo: adminSaldoNovo })
                .eq('id', adminUserId);

            if (adminUpdateError) {
                console.error('❌ Error updating admin balance:', adminUpdateError);
                return;
            }

            // Se o usuário do MikroTik for diferente do admin
            if (mikrotikUserId !== adminUserId) {
                const { error: userUpdateError } = await supabase
                    .from('users')
                    .update({ saldo: userSaldoNovo })
                    .eq('id', mikrotikUserId);

                if (userUpdateError) {
                    console.error('❌ Error updating user balance:', userUpdateError);
                    return;
                }
            }

            console.log(`✅ Balances updated successfully:`);
            console.log(`  📊 Admin: R$ ${adminSaldoAnterior.toFixed(2)} → R$ ${adminSaldoNovo.toFixed(2)} (+R$ ${venda.valor_admin})`);
            console.log(`  📊 User: R$ ${userSaldoAnterior.toFixed(2)} → R$ ${userSaldoNovo.toFixed(2)} (+R$ ${venda.valor_usuario})`);

        } catch (error) {
            console.error('❌ Error updating user balances:', error);
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