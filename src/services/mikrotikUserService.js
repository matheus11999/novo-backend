const { supabase } = require('../config/database');
const axios = require('axios');

class MikroTikUserService {
    constructor() {
        this.maxRetries = 3;
        this.retryDelay = 2000; // 2 segundos
        this.mikrotikApiUrl = process.env.MIKROTIK_API_URL || 'http://193.181.208.141:3000';
        this.mikrotikApiToken = process.env.MIKROTIK_API_TOKEN;
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
            const cleanMac = macAddress.replace(/[:-]/g, '').toLowerCase();
            
            const userData = {
                name: cleanMac,
                password: cleanMac,
                profile: vendaData.planos?.nome || 'default', // Usar nome do plano correto
                comment: `PIX ${vendaData.payment_id} - ${new Date().toISOString()}`,
                'mac-address': macAddress
            };
            
            console.log(`👤 [MIKROTIK-USER-SERVICE] Dados do usuário:`, {
                username: userData.name,
                profile: userData.profile,
                mac: userData['mac-address'],
                plano: vendaData.planos?.nome
            });
            
            // 3. Obter credenciais do MikroTik
            const credentials = {
                ip: vendaData.mikrotiks.ip,
                username: vendaData.mikrotiks.usuario,
                password: vendaData.mikrotiks.senha,
                port: vendaData.mikrotiks.porta || 8728
            };
            
            // 4. Fazer requisição para API MikroTik (criação direta)
            const response = await axios.post(`${this.mikrotikApiUrl}/hotspot/users/create-directly`, userData, {
                params: credentials,
                headers: {
                    'Authorization': `Bearer ${this.mikrotikApiToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            });
            
            const duration = Date.now() - startTime;
            
            if (response.data?.success) {
                console.log(`✅ [MIKROTIK-USER-SERVICE] Usuário criado com sucesso em ${duration}ms:`, cleanMac);
                
                // 5. Atualizar log como sucesso
                await this.updateUserLog(logId, {
                    status: 'success',
                    mikrotik_user_id: response.data.data?.createResult?.[0]?.ret || null,
                    response_data: response.data,
                    duration_ms: duration
                });
                
                // 6. Atualizar venda como sucesso
                await this.updateVendaStatus(vendaData.id, {
                    mikrotik_user_created: true,
                    mikrotik_user_id: cleanMac,
                    mikrotik_creation_status: 'success',
                    mikrotik_created_at: new Date().toISOString(),
                    mikrotik_creation_attempts: attempt,
                    mikrotik_last_attempt_at: new Date().toISOString(),
                    mikrotik_creation_error: null
                });
                
                return {
                    success: true,
                    username: cleanMac,
                    mikrotikUserId: response.data.data?.createResult?.[0]?.ret,
                    duration: duration,
                    attempt: attempt
                };
            } else {
                throw new Error(response.data?.error || 'Falha na criação do usuário');
            }
            
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error.response?.data?.error || error.message;
            
            console.error(`❌ [MIKROTIK-USER-SERVICE] Erro na tentativa ${attempt}:`, errorMessage);
            
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
            const logData = {
                venda_id: vendaData.id,
                mikrotik_id: vendaData.mikrotik_id,
                mac_address: vendaData.mac_address,
                username: vendaData.mac_address.replace(/[:-]/g, '').toLowerCase(),
                attempt_number: attemptNumber,
                status: status,
                request_data: {
                    username: vendaData.mac_address.replace(/[:-]/g, '').toLowerCase(),
                    profile: vendaData.planos?.nome || 'default',
                    mac_address: vendaData.mac_address,
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
                .from('vendas')
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
                .from('vendas')
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