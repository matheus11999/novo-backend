const { supabase } = require('../config/database');
const axios = require('axios');

class MikroTikUserService {
    constructor() {
        this.maxRetries = 3;
        this.retryDelay = 2000; // 2 segundos
        this.mikrotikProxyUrl = 'http://router.mikropix.online:3001';
    }

    async createUserWithRetry(vendaData, attempt = 1) {
        const startTime = Date.now();
        let logId = null;
        
        try {
            console.log(`🔧 [MIKROTIK-USER-SERVICE] Tentativa ${attempt}/${this.maxRetries} - Criando usuário para venda: ${vendaData.id}`);
            
            // 1. Criar log inicial
            logId = await this.createUserLog(vendaData, attempt, 'pending');
            
            // 2. Preparar dados do usuário
            const macAddress = vendaData.mac_address;
            
            // Normalizar MAC para formato padrão E2:26:89:13:AD:71 (maiúsculo)
            const normalizedMac = macAddress.replace(/[:-]/g, '').toUpperCase();
            const formattedMac = normalizedMac.match(/.{1,2}/g).join(':');
            
            // Criar comentário com formato padronizado para captive portal
            const planName = vendaData.planos?.nome || 'Default';
            const planValue = vendaData.valor_total || vendaData.planos?.valor || 0;
            const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const comment = `PIX ${vendaData.payment_id} - Plano: ${planName} - Valor: ${parseFloat(planValue).toFixed(2)} - ${currentDate}`;
            
            const userData = {
                name: formattedMac, // Username com formato E2:26:89:13:AD:71
                password: formattedMac, // Password com formato E2:26:89:13:AD:71
                profile: vendaData.planos?.nome || 'default', // Usar nome do plano correto
                comment: comment, // Comentário formatado para captive portal
                'mac-address': formattedMac // MAC com formato E2:26:89:13:AD:71
            };
            
            console.log(`👤 [MIKROTIK-USER-SERVICE] Dados do usuário:`, {
                username: userData.name,
                profile: userData.profile,
                mac: userData['mac-address'],
                macOriginal: macAddress,
                macFormatted: formattedMac,
                plano: vendaData.planos?.nome
            });
            
            // 3. Obter credenciais do MikroTik (usar campos corretos)
            console.log(`🔍 [MIKROTIK-USER-SERVICE] Dados mikrotiks disponíveis:`, {
                id: vendaData.mikrotiks?.id,
                ip: vendaData.mikrotiks?.ip,
                hasUsername: !!vendaData.mikrotiks?.username,
                hasUsuario: !!vendaData.mikrotiks?.usuario,
                hasPassword: !!vendaData.mikrotiks?.password,
                hasSenha: !!vendaData.mikrotiks?.senha,
                port: vendaData.mikrotiks?.port,
                porta: vendaData.mikrotiks?.porta,
                allFields: Object.keys(vendaData.mikrotiks || {})
            });
            
            const credentials = {
                ip: vendaData.mikrotiks.ip,
                username: vendaData.mikrotiks.username || vendaData.mikrotiks.usuario,
                password: vendaData.mikrotiks.password || vendaData.mikrotiks.senha,
                port: vendaData.mikrotiks.port || vendaData.mikrotiks.porta || 8728
            };
            
            console.log(`🔑 [MIKROTIK-USER-SERVICE] Credenciais extraídas:`, {
                ip: credentials.ip,
                username: credentials.username,
                hasPassword: !!credentials.password,
                port: credentials.port
            });
            
            // Validar se temos todos os dados necessários
            if (!credentials.ip || !credentials.username || !credentials.password) {
                const missingFields = [];
                if (!credentials.ip) missingFields.push('IP');
                if (!credentials.username) missingFields.push('Username');
                if (!credentials.password) missingFields.push('Password');
                
                const errorMsg = `❌ Dados MikroTik incompletos - Campos ausentes: ${missingFields.join(', ')}. Dados disponíveis: IP=${credentials.ip}, User=${credentials.username}, Port=${credentials.port}`;
                console.error(`[MIKROTIK-USER-SERVICE] ${errorMsg}`);
                throw new Error(errorMsg);
            }
            
            // 4. Criar comentário no formato abreviado
            const now = new Date();
            const formattedDate = now.toLocaleDateString('pt-BR');
            const abbreviatedComment = `C:${formattedDate} V:${vendaData.planos?.valor || vendaData.plano_valor || 0} D:${vendaData.planos?.session_timeout || vendaData.plano_session_timeout || '1d'}`;
            
            // Adicionar comentário aos dados do usuário
            userData.comment = abbreviatedComment;
            
            console.log(`🔗 [MIKROTIK-USER-SERVICE] Conectando em: ${credentials.ip} via proxy`);
            console.log(`📤 [MIKROTIK-USER-SERVICE] User data payload:`, {
                ...userData,
                password: userData.password ? '[REDACTED]' : null // Ocultar senhas nos logs
            });
            
            // 5. Criar usuário usando a nova API proxy
            const response = await axios.post(`${this.mikrotikProxyUrl}/api/mikrotik/public/create-hotspot-user/${vendaData.mikrotiks.id}`, userData, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            });
            
            const duration = Date.now() - startTime;
            
            console.log(`📥 [MIKROTIK-USER-SERVICE] Response recebida em ${duration}ms:`, {
                success: response.data?.success,
                statusCode: response.status,
                errorMessage: response.data?.error || response.data?.message
            });
            
            if (response.data?.success) {
                console.log(`✅ [MIKROTIK-USER-SERVICE] Usuário criado com sucesso:`, {
                    username: formattedMac,
                    password: formattedMac,
                    mac: formattedMac,
                    duration: `${duration}ms`,
                    attempt: attempt
                });
                
                // Retornar sucesso da nova API proxy
                const mikrotikUserId = response.data.data?.create_result?.response?.data?.['.id'] || 
                                     response.data.data?.createResult?.[0]?.ret || 
                                     response.data.data?.user_id || 
                                     null;
                
                console.log(`📋 [MIKROTIK-USER-SERVICE] Detalhes da resposta:`, {
                    hasData: !!response.data.data,
                    hasCreateResult: !!response.data.data?.create_result,
                    extractedUserId: mikrotikUserId,
                    fullResponseData: response.data.data
                });
                
                // 5. Atualizar log como sucesso
                await this.updateUserLog(logId, {
                    status: 'success',
                    mikrotik_user_id: mikrotikUserId,
                    response_data: response.data,
                    duration_ms: duration
                });
                
                // 6. Atualizar venda como sucesso
                await this.updateVendaStatus(vendaData.id, {
                    mikrotik_user_created: true,
                    mikrotik_user_id: formattedMac,
                    mikrotik_creation_status: 'success',
                    mikrotik_created_at: new Date().toISOString(),
                    mikrotik_creation_attempts: attempt,
                    mikrotik_last_attempt_at: new Date().toISOString(),
                    mikrotik_creation_error: null
                });
                
                return {
                    success: true,
                    username: formattedMac,
                    mikrotikUserId: mikrotikUserId,
                    duration: duration,
                    attempt: attempt
                };
            } else {
                const errorMessage = response.data?.error || response.data?.message || 'Falha na criação do usuário';
                console.error(`❌ [MIKROTIK-USER-SERVICE] API retornou sucesso=false:`, {
                    error: errorMessage,
                    responseData: response.data,
                    duration: `${duration}ms`
                });
                throw new Error(errorMessage);
            }
            
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message;
            
            console.error(`❌ [MIKROTIK-USER-SERVICE] Erro na tentativa ${attempt}:`, {
                error: errorMessage,
                duration: `${duration}ms`,
                statusCode: error.response?.status,
                isTimeout: error.code === 'ECONNABORTED',
                isNetworkError: error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND',
                fullError: error.response?.data || error.message
            });
            
            // Atualizar log com erro
            if (logId) {
                await this.updateUserLog(logId, {
                    status: 'failed',
                    error_message: errorMessage,
                    response_data: error.response?.data || null,
                    duration_ms: duration
                });
            }
            
            // Se não é a última tentativa, fazer retry
            if (attempt < this.maxRetries) {
                console.log(`🔄 [MIKROTIK-USER-SERVICE] Aguardando ${this.retryDelay}ms para retry...`);
                await this.sleep(this.retryDelay);
                
                // Atualizar status para retrying
                await this.updateVendaStatus(vendaData.id, {
                    mikrotik_creation_status: 'retrying',
                    mikrotik_creation_attempts: attempt,
                    mikrotik_last_attempt_at: new Date().toISOString(),
                    mikrotik_creation_error: errorMessage
                });
                
                return await this.createUserWithRetry(vendaData, attempt + 1);
            } else {
                // Última tentativa falhada - marcar como falha definitiva
                console.error(`🚨 [MIKROTIK-USER-SERVICE] Todas as tentativas falharam para venda: ${vendaData.id}`);
                
                await this.updateVendaStatus(vendaData.id, {
                    mikrotik_user_created: false,
                    mikrotik_creation_status: 'failed',
                    mikrotik_creation_attempts: attempt,
                    mikrotik_last_attempt_at: new Date().toISOString(),
                    mikrotik_creation_error: errorMessage
                });
                
                return {
                    success: false,
                    error: errorMessage,
                    attempts: attempt
                };
            }
        }
    }

    async createUserLog(vendaData, attemptNumber, status) {
        try {
            // Normalizar MAC para o log (formato maiúsculo)
            const normalizedMac = vendaData.mac_address.replace(/[:-]/g, '').toUpperCase();
            const formattedMac = normalizedMac.match(/.{1,2}/g).join(':');
            
            const logData = {
                venda_id: vendaData.id,
                mikrotik_id: vendaData.mikrotik_id,
                mac_address: vendaData.mac_address,
                username: formattedMac, // Username formatado
                attempt_number: attemptNumber,
                status: status,
                request_data: {
                    username: formattedMac, // Username formatado E2:26:89:13:AD:71
                    password: formattedMac, // Password formatado E2:26:89:13:AD:71
                    profile: vendaData.planos?.nome || 'default',
                    mac_address: formattedMac, // MAC formatado E2:26:89:13:AD:71
                    mac_original: vendaData.mac_address,
                    plano_original: vendaData.planos?.nome
                }
            };
            
            const { data, error } = await supabase
                .from('mikrotik_user_creation_logs')
                .insert(logData)
                .select('id')
                .single();
            
            if (error) {
                console.error('❌ [MIKROTIK-USER-SERVICE] Erro ao criar log:', error);
                return null;
            }
            
            return data.id;
        } catch (error) {
            console.error('❌ [MIKROTIK-USER-SERVICE] Erro ao criar log:', error);
            return null;
        }
    }

    async updateUserLog(logId, updates) {
        try {
            if (!logId) return;
            
            const { error } = await supabase
                .from('mikrotik_user_creation_logs')
                .update(updates)
                .eq('id', logId);
            
            if (error) {
                console.error('❌ [MIKROTIK-USER-SERVICE] Erro ao atualizar log:', error);
            }
        } catch (error) {
            console.error('❌ [MIKROTIK-USER-SERVICE] Erro ao atualizar log:', error);
        }
    }

    async updateVendaStatus(vendaId, updates) {
        try {
            const { error } = await supabase
                .from('vendas_pix')
                .update(updates)
                .eq('id', vendaId);
            
            if (error) {
                console.error('❌ [MIKROTIK-USER-SERVICE] Erro ao atualizar venda:', error);
            } else {
                console.log(`✅ [MIKROTIK-USER-SERVICE] Venda atualizada:`, vendaId);
            }
        } catch (error) {
            console.error('❌ [MIKROTIK-USER-SERVICE] Erro ao atualizar venda:', error);
        }
    }

    async getFailedCreations() {
        try {
            const { data, error } = await supabase
                .from('vendas_pix')
                .select(`
                    *,
                    planos (*),
                    mikrotiks (*)
                `)
                .eq('status', 'completed')
                .eq('mikrotik_user_created', false)
                .in('mikrotik_creation_status', ['failed', 'retrying'])
                .order('created_at', { ascending: false });
            
            if (error) {
                console.error('❌ [MIKROTIK-USER-SERVICE] Erro ao buscar falhas:', error);
                return [];
            }
            
            return data || [];
        } catch (error) {
            console.error('❌ [MIKROTIK-USER-SERVICE] Erro ao buscar falhas:', error);
            return [];
        }
    }

    async retryFailedCreations() {
        try {
            console.log('🔄 [MIKROTIK-USER-SERVICE] Iniciando retry de criações falhadas...');
            
            const failedVendas = await this.getFailedCreations();
            console.log(`📊 [MIKROTIK-USER-SERVICE] Encontradas ${failedVendas.length} vendas para retry`);
            
            for (const venda of failedVendas) {
                console.log(`🔄 [MIKROTIK-USER-SERVICE] Tentando recriar usuário para venda: ${venda.id}`);
                await this.createUserWithRetry(venda, 1);
                
                // Aguardar um pouco entre tentativas
                await this.sleep(1000);
            }
            
            console.log('✅ [MIKROTIK-USER-SERVICE] Retry de criações concluído');
        } catch (error) {
            console.error('❌ [MIKROTIK-USER-SERVICE] Erro no retry:', error);
        }
    }

    /**
     * Cria um IP binding no MikroTik a partir dos dados de um pagamento.
     * Este método é utilizado pelo serviço de polling para garantir que o dispositivo
     * tenha acesso logo após a aprovação do pagamento.
     * @param {Object} vendaData Objeto da venda vindo do Supabase (inclui mikrotiks, planos, etc.)
     * @param {number} attempt   Número da tentativa atual (para futuras estratégias de retry)
     * @returns {Object} { success: boolean, details?: any, error?: string }
     */
    async createIpBindingFromPayment(vendaData, attempt = 1) {
        const startTime = Date.now();
        try {
            console.log(`🔗 [MIKROTIK-USER-SERVICE] Tentativa ${attempt} - Criando IP binding para pagamento: ${vendaData.payment_id}`);

            // === 1. Extrair credenciais do MikroTik ===
            const mikrotik = vendaData.mikrotiks || {};
            // A API ip-binding espera as chaves "usuario" e "senha" no objeto credentials.
            // Para manter compatibilidade com outros serviços que usam "username/password",
            // preenchemos ambos os pares de chaves.
            const credentials = {
                ip: mikrotik.ip,
                // aliases username/usuario e password/senha
                username: mikrotik.username || mikrotik.usuario,
                usuario: mikrotik.username || mikrotik.usuario,
                password: mikrotik.password || mikrotik.senha,
                senha: mikrotik.password || mikrotik.senha,
                port: mikrotik.port || mikrotik.porta || 8728,
                porta: mikrotik.port || mikrotik.porta || 8728
            };

            if (!credentials.ip || !credentials.username || !credentials.password) {
                throw new Error(`Dados MikroTik incompletos para IP binding (ip=${credentials.ip}, user=${credentials.username})`);
            }

            // === 2. Construir objeto paymentData esperado pela API ===
            const paymentData = {
                payment_id: vendaData.payment_id,
                mac_address: vendaData.mac_address,
                plano_nome: vendaData.planos?.nome || vendaData.plano_nome,
                plano_valor: vendaData.planos?.valor || vendaData.plano_valor,
                plano_session_timeout: vendaData.planos?.session_timeout || vendaData.plano_session_timeout,
                plano_rate_limit: vendaData.planos?.rate_limit || vendaData.plano_rate_limit
            };

            // === 3. Criar comentário no formato abreviado ===
            const now = new Date();
            const formattedDate = now.toLocaleDateString('pt-BR');
            const ipBindingComment = `C:${formattedDate} V:${paymentData.plano_valor || 0} ${paymentData.payment_id}`;

            // === 4. Montar dados do IP binding ===
            const bindingData = {
                address: '192.168.1.100', // IP fixo - deve ser configurado conforme necessário
                mac_address: vendaData.mac_address,
                comment: ipBindingComment
            };

            console.log(`🔗 [MIKROTIK-USER-SERVICE] Criando IP binding via proxy para MAC: ${vendaData.mac_address}`);

            // === 5. Executar chamada via nova API proxy ===
            const response = await axios.post(
                `${this.mikrotikProxyUrl}/api/mikrotik/public/create-ip-binding/${vendaData.mikrotiks.id}`,
                bindingData,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 20000
                }
            );

            const duration = Date.now() - startTime;
            console.log(`📥 [MIKROTIK-USER-SERVICE] IP binding response (${duration}ms):`, response.data);

            if (response.data?.success) {
                return { success: true, details: response.data, duration };
            }

            const errorMsg = response.data?.error || response.data?.message || 'Falha desconhecida ao criar IP binding';
            return { success: false, error: errorMsg, details: response.data, duration };
        } catch (error) {
            const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message;
            console.error('❌ [MIKROTIK-USER-SERVICE] Erro ao criar IP binding:', errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getCreationStats() {
        try {
            const { data, error } = await supabase
                .from('mikrotik_user_creation_logs')
                .select('status')
                .order('created_at', { ascending: false })
                .limit(1000);
            
            if (error) return { error: error.message };
            
            const stats = data.reduce((acc, log) => {
                acc[log.status] = (acc[log.status] || 0) + 1;
                return acc;
            }, {});
            
            return stats;
        } catch (error) {
            return { error: error.message };
        }
    }
}

module.exports = MikroTikUserService;