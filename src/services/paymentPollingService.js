const { supabase } = require('../config/database');
const { payment } = require('../config/mercadopago');
const MikroTikUserService = require('./mikrotikUserService');
const axios = require('axios');

class PaymentPollingService {
    constructor() {
        this.mikrotikUserService = new MikroTikUserService();
        this.isRunning = false;
        this.processingPayments = new Set(); // Mutex para evitar processamento duplo
        this.pollingInterval = 30000; // 30 segundos
        this.intervalId = null;
        this.maxPaymentAge = 24 * 60 * 60 * 1000; // 24 horas em ms
    }

    start() {
        if (this.isRunning) {
            console.log('🔄 [PAYMENT-POLLING] Serviço já está rodando');
            return;
        }

        this.isRunning = true;
        console.log(`🚀 [PAYMENT-POLLING] Iniciando polling a cada ${this.pollingInterval / 1000}s`);
        
        // Executar limpeza inicial de pagamentos antigos
        setTimeout(() => {
            this.cleanupOldTestPayments();
        }, 10000); // Após 10 segundos
        
        // Executar imediatamente
        this.checkPendingPayments();
        
        // Agendar execuções periódicas
        this.intervalId = setInterval(() => {
            this.checkPendingPayments();
        }, this.pollingInterval);
    }

    stop() {
        if (!this.isRunning) {
            console.log('⏹️ [PAYMENT-POLLING] Serviço já está parado');
            return;
        }

        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        console.log('⏹️ [PAYMENT-POLLING] Serviço parado');
    }

    async checkPendingPayments() {
        if (!this.isRunning) return;

        try {
            console.log('🔍 [PAYMENT-POLLING] Verificando pagamentos pendentes...');
            
            // Buscar vendas com status completed mas sem usuário criado
            // OU vendas pendentes que podem ter sido pagas
            // Excluir vendas marcadas como not_found no MercadoPago
            const { data: vendas, error } = await supabase
                .from('vendas_pix')
                .select(`
                    *,
                    planos (*),
                    mikrotiks (*)
                `)
                .or('status.eq.pending,and(status.eq.completed,mikrotik_user_created.eq.false)')
                .not('mercadopago_status', 'eq', 'not_found')
                .gte('created_at', new Date(Date.now() - this.maxPaymentAge).toISOString())
                .order('created_at', { ascending: false });

            if (error) {
                console.error('❌ [PAYMENT-POLLING] Erro ao buscar vendas:', error);
                return;
            }

            if (!vendas || vendas.length === 0) {
                console.log('✅ [PAYMENT-POLLING] Nenhuma venda pendente encontrada');
                return;
            }

            console.log(`📊 [PAYMENT-POLLING] Encontradas ${vendas.length} vendas para verificar`);

            // Processar cada venda
            for (const venda of vendas) {
                await this.processVenda(venda);
                
                // Aguardar um pouco entre processamentos
                await this.sleep(1000);
            }

            console.log('✅ [PAYMENT-POLLING] Verificação concluída');
        } catch (error) {
            console.error('❌ [PAYMENT-POLLING] Erro no polling:', error);
        }
    }

    async processVenda(venda) {
        const paymentId = venda.payment_id;
        
        // Verificar se já está sendo processado
        if (this.processingPayments.has(paymentId)) {
            console.log(`⏭️ [PAYMENT-POLLING] Venda ${paymentId} já sendo processada, pulando...`);
            return;
        }

        // Marcar como sendo processado
        this.processingPayments.add(paymentId);

        try {
            console.log(`🔍 [PAYMENT-POLLING] Processando venda: ${paymentId}`);

            // Consultar status no MercadoPago usando o ID correto
            if (!venda.mercadopago_payment_id) {
                console.log(`⚠️ [PAYMENT-POLLING] Venda ${paymentId} sem MercadoPago Payment ID`);
                return;
            }

            let mpPayment;
            try {
                mpPayment = await payment.get({ id: venda.mercadopago_payment_id });
            } catch (mpError) {
                // Erro 404 = pagamento não encontrado (comum para pagamentos antigos/teste)
                if (mpError.status === 404 || mpError.message?.includes('resource not found')) {
                    console.log(`ℹ️ [PAYMENT-POLLING] Pagamento não encontrado no MP (404): ${paymentId} - Provavelmente teste antigo`);
                    
                    // Marcar como não encontrado para não tentar novamente
                    await this.updateVendaStatus(venda.id, {
                        mercadopago_status: 'not_found',
                        updated_at: new Date().toISOString()
                    });
                    return;
                }
                
                // Outros erros, tentar novamente depois
                console.error(`❌ [PAYMENT-POLLING] Erro MP para ${paymentId}:`, mpError.message);
                return;
            }
            
            if (!mpPayment) {
                console.log(`❌ [PAYMENT-POLLING] Pagamento não encontrado no MP: ${paymentId}`);
                return;
            }

            console.log(`📊 [PAYMENT-POLLING] Status MP: ${mpPayment.status} (${mpPayment.status_detail}) | Status DB: ${venda.status}`);

            // Verificar se status mudou
            const needsUpdate = mpPayment.status !== venda.mercadopago_status;
            const isApproved = mpPayment.status === 'approved';
            const wasNotCompleted = venda.status !== 'completed';
            const userNotCreated = !venda.mikrotik_user_created;

            // Processar diferentes status
            if (isApproved && (wasNotCompleted || userNotCreated)) {
                console.log(`💰 [PAYMENT-POLLING] Pagamento aprovado: ${paymentId}`);
                await this.handleApprovedPayment(venda, mpPayment);
            } else if (mpPayment.status === 'rejected') {
                console.log(`❌ [PAYMENT-POLLING] Pagamento rejeitado: ${paymentId}`);
                await this.handleRejectedPayment(venda, mpPayment);
            } else if (mpPayment.status === 'cancelled') {
                console.log(`⏹️ [PAYMENT-POLLING] Pagamento cancelado: ${paymentId}`);
                await this.handleCancelledPayment(venda, mpPayment);
            } else if (needsUpdate) {
                console.log(`📝 [PAYMENT-POLLING] Atualizando status: ${venda.mercadopago_status} → ${mpPayment.status}`);
                await this.updatePaymentStatus(venda, mpPayment);
            } else {
                console.log(`ℹ️ [PAYMENT-POLLING] Nenhuma mudança para: ${paymentId}`);
            }

        } catch (error) {
            console.error(`❌ [PAYMENT-POLLING] Erro ao processar venda ${paymentId}:`, error);
        } finally {
            // Remover do conjunto de processamento
            this.processingPayments.delete(paymentId);
        }
    }

    async handleApprovedPayment(venda, mpPayment) {
        try {
            console.log(`🎉 [PAYMENT-POLLING] Processando pagamento aprovado: ${venda.payment_id}`);

            // 1. Atualizar status da venda
            const updateData = {
                status: 'completed',
                mercadopago_status: mpPayment.status,
                paid_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // 2. Criar IP binding no MikroTik se ainda não foi criado
            if (!venda.ip_binding_created) {
                console.log(`🔗 [PAYMENT-POLLING] Criando IP binding para MAC: ${venda.mac_address}`);
                
                const bindingResult = await this.createIpBindingForPayment(venda);
                
                if (bindingResult.success) {
                    updateData.ip_binding_created = true;
                    updateData.ip_binding_mac = bindingResult.mac_address;
                    updateData.ip_binding_comment = bindingResult.comment;
                    updateData.ip_binding_created_at = bindingResult.created_at;
                    updateData.ip_binding_expires_at = bindingResult.expires_at;
                    updateData.mikrotik_creation_status = 'success';
                    
                    console.log(`✅ [PAYMENT-POLLING] IP binding criado para MAC: ${bindingResult.mac_address}`);
                    console.log(`📋 [PAYMENT-POLLING] Detalhes: Criado em ${bindingResult.created_at} | Expira em ${bindingResult.expires_at}`);
                } else {
                    console.error(`❌ [PAYMENT-POLLING] Falha na criação do IP binding:`, bindingResult.error);
                    updateData.error_message = bindingResult.error;
                    updateData.mikrotik_creation_status = 'failed';
                }
            } else {
                console.log(`ℹ️ [PAYMENT-POLLING] IP binding já foi criado para venda: ${venda.payment_id}`);
            }

            // 3. Atualizar venda no banco
            const { error: updateError } = await supabase
                .from('vendas_pix')
                .update(updateData)
                .eq('id', venda.id);

            if (updateError) {
                console.error('❌ [PAYMENT-POLLING] Erro ao atualizar venda:', updateError);
                return;
            }

            // 4. Criar histórico de transações se não existe
            if (venda.status !== 'completed') {
                await this.createTransactionHistory(venda);
            }

            console.log(`✅ [PAYMENT-POLLING] Pagamento processado com sucesso: ${venda.payment_id}`);

        } catch (error) {
            console.error(`❌ [PAYMENT-POLLING] Erro ao processar pagamento aprovado:`, error);
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
                console.error('❌ [PAYMENT-POLLING] Erro ao atualizar status:', error);
            } else {
                console.log(`✅ [PAYMENT-POLLING] Status atualizado: ${venda.payment_id} → ${mpPayment.status}`);
            }
        } catch (error) {
            console.error('❌ [PAYMENT-POLLING] Erro ao atualizar status:', error);
        }
    }

    async handleRejectedPayment(venda, mpPayment) {
        try {
            const { error } = await supabase
                .from('vendas_pix')
                .update({
                    status: 'failed',
                    mercadopago_status: mpPayment.status,
                    failed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    error_message: `Pagamento rejeitado: ${mpPayment.status_detail}`
                })
                .eq('id', venda.id);

            if (error) {
                console.error('❌ [PAYMENT-POLLING] Erro ao marcar como rejeitado:', error);
            } else {
                console.log(`✅ [PAYMENT-POLLING] Pagamento marcado como rejeitado: ${venda.payment_id}`);
            }
        } catch (error) {
            console.error('❌ [PAYMENT-POLLING] Erro ao processar rejeição:', error);
        }
    }

    async handleCancelledPayment(venda, mpPayment) {
        try {
            const { error } = await supabase
                .from('vendas_pix')
                .update({
                    status: 'cancelled',
                    mercadopago_status: mpPayment.status,
                    cancelled_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', venda.id);

            if (error) {
                console.error('❌ [PAYMENT-POLLING] Erro ao marcar como cancelado:', error);
            } else {
                console.log(`✅ [PAYMENT-POLLING] Pagamento marcado como cancelado: ${venda.payment_id}`);
            }
        } catch (error) {
            console.error('❌ [PAYMENT-POLLING] Erro ao processar cancelamento:', error);
        }
    }

    async createTransactionHistory(venda) {
        try {
            console.log('💳 [PAYMENT-POLLING] Criando histórico de transações...');
            
            // Buscar admin user corretamente da tabela users
            const { data: adminUser, error: adminError } = await supabase
                .from('users')
                .select('id')
                .eq('role', 'admin')
                .limit(1)
                .single();

            if (adminError) {
                console.error('❌ [PAYMENT-POLLING] Error finding admin user:', adminError);
                return;
            }

            const adminUserId = adminUser?.id;
            
            if (!adminUserId) {
                console.error('❌ [PAYMENT-POLLING] Admin user not found');
                return;
            }

            const historyEntries = [
                {
                    venda_id: venda.id,
                    mikrotik_id: venda.mikrotik_id,
                    user_id: adminUserId,
                    tipo: 'admin',
                    valor: venda.valor_admin,
                    descricao: `Comissão admin - Venda ${venda.payment_id}`,
                    status: 'completed'
                },
                {
                    venda_id: venda.id,
                    mikrotik_id: venda.mikrotik_id,
                    user_id: venda.mikrotiks?.user_id || adminUserId,
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
                console.error('❌ [PAYMENT-POLLING] Erro ao inserir histórico:', error);
            } else {
                console.log('✅ [PAYMENT-POLLING] Histórico de transações criado');
            }

            // Criar transações para saldos
            await this.updateUserBalances(venda, adminUserId);

        } catch (error) {
            console.error('❌ [PAYMENT-POLLING] Erro no histórico:', error);
        }
    }

    async updateUserBalances(venda, adminUserId) {
        try {
            console.log('💰 [PAYMENT-POLLING] Atualizando saldos dos usuários...');

            // 1. Buscar saldo atual do admin
            const { data: adminData, error: adminError } = await supabase
                .from('users')
                .select('saldo')
                .eq('id', adminUserId)
                .single();

            if (adminError) {
                console.error('❌ [PAYMENT-POLLING] Error fetching admin balance:', adminError);
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
                console.error('❌ [PAYMENT-POLLING] Error fetching user balance:', userError);
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
                console.error('❌ [PAYMENT-POLLING] Erro nas transações:', transacaoError);
                return;
            }

            // 4. Atualizar saldos dos usuários
            const { error: adminUpdateError } = await supabase
                .from('users')
                .update({ saldo: adminSaldoNovo })
                .eq('id', adminUserId);

            if (adminUpdateError) {
                console.error('❌ [PAYMENT-POLLING] Error updating admin balance:', adminUpdateError);
                return;
            }

            // Se o usuário do MikroTik for diferente do admin
            if (mikrotikUserId !== adminUserId) {
                const { error: userUpdateError } = await supabase
                    .from('users')
                    .update({ saldo: userSaldoNovo })
                    .eq('id', mikrotikUserId);

                if (userUpdateError) {
                    console.error('❌ [PAYMENT-POLLING] Error updating user balance:', userUpdateError);
                    return;
                }
            }

            console.log(`✅ [PAYMENT-POLLING] Saldos atualizados com sucesso:`);
            console.log(`  📊 Admin: R$ ${adminSaldoAnterior.toFixed(2)} → R$ ${adminSaldoNovo.toFixed(2)} (+R$ ${venda.valor_admin})`);
            console.log(`  📊 User: R$ ${userSaldoAnterior.toFixed(2)} → R$ ${userSaldoNovo.toFixed(2)} (+R$ ${venda.valor_usuario})`);

        } catch (error) {
            console.error('❌ [PAYMENT-POLLING] Erro nos saldos:', error);
        }
    }

    async getStats() {
        try {
            return {
                isRunning: this.isRunning,
                pollingInterval: this.pollingInterval,
                processingCount: this.processingPayments.size,
                processingPayments: Array.from(this.processingPayments),
                uptime: this.isRunning ? Date.now() - this.startTime : 0
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Limpar pagamentos antigos de teste que não existem mais no MP
    async cleanupOldTestPayments() {
        try {
            console.log('🧹 [PAYMENT-POLLING] Limpando pagamentos de teste antigos...');
            
            const { data: oldVendas, error } = await supabase
                .from('vendas_pix')
                .select('id, payment_id, created_at')
                .eq('status', 'pending')
                .is('mercadopago_status', null)
                .lt('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()) // Mais de 2 horas
                .limit(50);
            
            if (error || !oldVendas || oldVendas.length === 0) {
                console.log('ℹ️ [PAYMENT-POLLING] Nenhum pagamento antigo para limpar');
                return;
            }
            
            console.log(`🧹 [PAYMENT-POLLING] Verificando ${oldVendas.length} pagamentos antigos...`);
            
            for (const venda of oldVendas) {
                try {
                    await payment.get({ id: venda.payment_id });
                    // Se chegou aqui, pagamento existe no MP
                } catch (mpError) {
                    if (mpError.status === 404 || mpError.message?.includes('resource not found')) {
                        // Marcar como not_found
                        await this.updateVendaStatus(venda.id, {
                            mercadopago_status: 'not_found',
                            updated_at: new Date().toISOString()
                        });
                        console.log(`🗑️ [PAYMENT-POLLING] Marcado como not_found: ${venda.payment_id}`);
                    }
                }
                
                await this.sleep(500); // Evitar rate limit
            }
            
            console.log('✅ [PAYMENT-POLLING] Limpeza de pagamentos antigos concluída');
        } catch (error) {
            console.error('❌ [PAYMENT-POLLING] Erro na limpeza:', error);
        }
    }

    // Método para processar venda específica manualmente
    async processSpecificPayment(paymentId) {
        try {
            console.log(`🔍 [PAYMENT-POLLING] Processamento manual de: ${paymentId}`);

            const { data: venda, error } = await supabase
                .from('vendas_pix')
                .select(`
                    *,
                    planos (*),
                    mikrotiks (*)
                `)
                .eq('payment_id', paymentId)
                .single();

            if (error || !venda) {
                throw new Error('Venda não encontrada');
            }

            await this.processVenda(venda);
            return { success: true, message: 'Pagamento processado com sucesso' };

        } catch (error) {
            console.error(`❌ [PAYMENT-POLLING] Erro no processamento manual:`, error);
            return { success: false, error: error.message };
        }
    }

    // Método para criar IP binding para pagamento
    async createIpBindingForPayment(venda) {
        try {
            console.log(`🔗 [PAYMENT-POLLING] Criando IP binding para pagamento: ${venda.payment_id}`);
            
            const mikrotikApiUrl = process.env.MIKROTIK_API_URL || 'http://localhost:3001';
            const mikrotikApiToken = process.env.MIKROTIK_API_TOKEN;

            if (!mikrotikApiToken) {
                throw new Error('MIKROTIK_API_TOKEN not configured');
            }

            const credentials = {
                ip: venda.mikrotiks.ip,
                usuario: venda.mikrotiks.usuario,
                senha: venda.mikrotiks.senha,
                porta: venda.mikrotiks.porta || 8728
            };

            const macAddress = venda.mac_address;
            const normalizedMac = macAddress.replace(/[:-]/g, '').toUpperCase();
            const formattedMac = normalizedMac.match(/.{1,2}/g).join(':');

            const paymentData = {
                payment_id: venda.payment_id,
                mac_address: formattedMac,
                plano_nome: venda.plano_nome,
                plano_valor: venda.plano_valor,
                plano_session_timeout: venda.plano_session_timeout,
                plano_rate_limit: venda.plano_rate_limit
            };

            console.log(`📡 [PAYMENT-POLLING] Enviando request para MikroTik API:`, {
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

            console.log(`📥 [PAYMENT-POLLING] MikroTik API response:`, response.data);

            if (response.data?.success) {
                return {
                    success: true,
                    mac_address: response.data.data?.mac_address,
                    comment: response.data.data?.comment,
                    created_at: response.data.data?.created_at,
                    expires_at: response.data.data?.expires_at,
                    data: response.data
                };
            } else {
                return {
                    success: false,
                    error: response.data?.error || response.data?.message || 'Unknown error creating IP binding'
                };
            }
        } catch (error) {
            console.error('❌ [PAYMENT-POLLING] MikroTik API Error:', error.message);
            if (error.response) {
                console.error('❌ [PAYMENT-POLLING] Error response:', error.response.data);
            }
            return {
                success: false,
                error: error.response?.data?.error || error.response?.data?.message || error.message
            };
        }
    }
}

// Instância singleton
const paymentPollingService = new PaymentPollingService();

module.exports = paymentPollingService;