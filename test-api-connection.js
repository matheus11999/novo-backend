#!/usr/bin/env node

/**
 * Script para testar conectividade entre Backend VPS1 e API MikroTik VPS2
 * 
 * Este script valida:
 * 1. Configurações de ambiente
 * 2. Conectividade com API VPS2
 * 3. Autenticação por token
 * 4. Rate limiting
 * 5. Endpoints essenciais
 */

require('dotenv').config();
const axios = require('axios');

class ApiConnectionTester {
    constructor() {
        this.mikrotikApiUrl = process.env.MIKROTIK_API_URL;
        this.mikrotikApiToken = process.env.MIKROTIK_API_TOKEN;
        this.results = [];
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const emoji = {
            'info': 'ℹ️ ',
            'success': '✅',
            'error': '❌',
            'warning': '⚠️ ',
            'test': '🧪'
        }[type] || 'ℹ️ ';
        
        console.log(`${emoji} [${timestamp}] ${message}`);
    }

    addResult(test, status, message, details = null) {
        this.results.push({
            test,
            status,
            message,
            details,
            timestamp: new Date().toISOString()
        });
    }

    async testConfiguration() {
        this.log('Testando configurações de ambiente...', 'test');
        
        const requiredEnvs = [
            'MIKROTIK_API_URL',
            'MIKROTIK_API_TOKEN'
        ];
        
        let configValid = true;
        
        for (const env of requiredEnvs) {
            if (!process.env[env]) {
                this.log(`Variável ${env} não configurada`, 'error');
                this.addResult('Configuration', 'FAIL', `Missing ${env}`, null);
                configValid = false;
            } else {
                this.log(`${env}: ✓ Configurado`, 'success');
            }
        }
        
        // Validar formato do token
        if (this.mikrotikApiToken) {
            if (this.mikrotikApiToken.length < 32) {
                this.log('Token muito curto (mínimo 32 caracteres)', 'warning');
                this.addResult('Token Validation', 'WARN', 'Token too short', {
                    currentLength: this.mikrotikApiToken.length,
                    minimumLength: 32
                });
            } else {
                this.log(`Token: ✓ Válido (${this.mikrotikApiToken.length} chars)`, 'success');
                this.addResult('Token Validation', 'PASS', 'Token format valid', {
                    tokenLength: this.mikrotikApiToken.length
                });
            }
        }
        
        if (configValid) {
            this.addResult('Configuration', 'PASS', 'All environment variables configured', null);
            return true;
        }
        
        return false;
    }

    async testBasicConnectivity() {
        this.log('Testando conectividade básica...', 'test');
        
        try {
            const response = await axios.get(`${this.mikrotikApiUrl}/health`, {
                timeout: 5000
            });
            
            this.log(`Health check: ✓ Status ${response.status}`, 'success');
            this.addResult('Basic Connectivity', 'PASS', 'Health endpoint accessible', {
                status: response.status,
                data: response.data
            });
            return true;
        } catch (error) {
            this.log(`Health check: ✗ ${error.message}`, 'error');
            this.addResult('Basic Connectivity', 'FAIL', error.message, {
                code: error.code,
                status: error.response?.status
            });
            return false;
        }
    }

    async testAuthentication() {
        this.log('Testando autenticação...', 'test');
        
        // Teste 1: Sem token (deve falhar)
        try {
            await axios.post(`${this.mikrotikApiUrl}/test-connection`, {
                ip: '192.168.1.1',
                username: 'admin',
                password: 'test'
            }, { timeout: 5000 });
            
            this.log('ERRO: API aceitou requisição sem token', 'error');
            this.addResult('Authentication - No Token', 'FAIL', 'API accepted request without token', null);
        } catch (error) {
            if (error.response?.status === 401) {
                this.log('Autenticação sem token: ✓ Rejeitada corretamente', 'success');
                this.addResult('Authentication - No Token', 'PASS', 'Request correctly rejected', {
                    status: 401
                });
            } else {
                this.log(`Erro inesperado: ${error.message}`, 'warning');
                this.addResult('Authentication - No Token', 'WARN', 'Unexpected error', {
                    message: error.message
                });
            }
        }
        
        // Teste 2: Com token inválido (deve falhar)
        try {
            await axios.post(`${this.mikrotikApiUrl}/test-connection`, {
                ip: '192.168.1.1',
                username: 'admin',
                password: 'test'
            }, {
                headers: {
                    'Authorization': 'Bearer invalid_token_here'
                },
                timeout: 5000
            });
            
            this.log('ERRO: API aceitou token inválido', 'error');
            this.addResult('Authentication - Invalid Token', 'FAIL', 'API accepted invalid token', null);
        } catch (error) {
            if (error.response?.status === 401) {
                this.log('Token inválido: ✓ Rejeitado corretamente', 'success');
                this.addResult('Authentication - Invalid Token', 'PASS', 'Invalid token correctly rejected', {
                    status: 401
                });
            } else {
                this.log(`Erro inesperado: ${error.message}`, 'warning');
                this.addResult('Authentication - Invalid Token', 'WARN', 'Unexpected error', {
                    message: error.message
                });
            }
        }
        
        // Teste 3: Com token válido (deve passar)
        try {
            const response = await axios.post(`${this.mikrotikApiUrl}/test-connection`, {
                ip: '192.168.1.1',
                username: 'admin',
                password: 'test'
            }, {
                headers: {
                    'Authorization': `Bearer ${this.mikrotikApiToken}`
                },
                timeout: 5000
            });
            
            this.log('Token válido: ✓ Aceito (teste de conectividade pode falhar por credenciais)', 'success');
            this.addResult('Authentication - Valid Token', 'PASS', 'Valid token accepted', {
                status: response.status
            });
        } catch (error) {
            if (error.response?.status === 401) {
                this.log('ERRO: Token válido foi rejeitado', 'error');
                this.addResult('Authentication - Valid Token', 'FAIL', 'Valid token rejected', {
                    status: 401
                });
            } else {
                // Outros erros (conexão com MikroTik, etc.) são esperados aqui
                this.log('Token válido: ✓ Aceito (erro de conexão com MikroTik é esperado)', 'success');
                this.addResult('Authentication - Valid Token', 'PASS', 'Valid token accepted, MikroTik connection failed as expected', {
                    error: error.message
                });
            }
        }
    }

    async testRateLimiting() {
        this.log('Testando rate limiting...', 'test');
        
        const requests = [];
        const maxRequests = 5; // Fazer várias requisições rápidas
        
        for (let i = 0; i < maxRequests; i++) {
            requests.push(
                axios.get(`${this.mikrotikApiUrl}/health`, {
                    headers: {
                        'Authorization': `Bearer ${this.mikrotikApiToken}`
                    },
                    timeout: 5000
                }).catch(error => error.response || error)
            );
        }
        
        try {
            const responses = await Promise.all(requests);
            const rateLimitedResponses = responses.filter(r => r.status === 429);
            
            if (rateLimitedResponses.length > 0) {
                this.log(`Rate limiting: ✓ Funcionando (${rateLimitedResponses.length}/${maxRequests} bloqueadas)`, 'success');
                this.addResult('Rate Limiting', 'PASS', 'Rate limiting is working', {
                    totalRequests: maxRequests,
                    blockedRequests: rateLimitedResponses.length
                });
            } else {
                this.log('Rate limiting: ⚠️  Não ativado ou limite alto', 'warning');
                this.addResult('Rate Limiting', 'WARN', 'Rate limiting not triggered', {
                    totalRequests: maxRequests,
                    blockedRequests: 0
                });
            }
        } catch (error) {
            this.log(`Erro no teste de rate limiting: ${error.message}`, 'error');
            this.addResult('Rate Limiting', 'ERROR', error.message, null);
        }
    }

    async testEssentialEndpoints() {
        this.log('Testando endpoints essenciais...', 'test');
        
        const endpoints = [
            { method: 'GET', path: '/health', description: 'Health check' },
            { method: 'POST', path: '/test-connection', description: 'Connection test', requiresAuth: true }
        ];
        
        for (const endpoint of endpoints) {
            try {
                const config = {
                    method: endpoint.method.toLowerCase(),
                    url: `${this.mikrotikApiUrl}${endpoint.path}`,
                    timeout: 5000
                };
                
                if (endpoint.requiresAuth) {
                    config.headers = {
                        'Authorization': `Bearer ${this.mikrotikApiToken}`
                    };
                    config.data = {
                        ip: '192.168.1.1',
                        username: 'admin', 
                        password: 'test'
                    };
                }
                
                const response = await axios(config);
                this.log(`${endpoint.method} ${endpoint.path}: ✓ Disponível`, 'success');
                this.addResult(`Endpoint ${endpoint.path}`, 'PASS', `${endpoint.description} available`, {
                    status: response.status
                });
            } catch (error) {
                if (endpoint.requiresAuth && (error.response?.status === 400 || error.message.includes('MikroTik'))) {
                    // Erro esperado por credenciais inválidas
                    this.log(`${endpoint.method} ${endpoint.path}: ✓ Disponível (erro de MikroTik esperado)`, 'success');
                    this.addResult(`Endpoint ${endpoint.path}`, 'PASS', `${endpoint.description} available`, {
                        note: 'MikroTik connection error expected'
                    });
                } else {
                    this.log(`${endpoint.method} ${endpoint.path}: ✗ ${error.message}`, 'error');
                    this.addResult(`Endpoint ${endpoint.path}`, 'FAIL', error.message, {
                        status: error.response?.status
                    });
                }
            }
        }
    }

    generateReport() {
        const passCount = this.results.filter(r => r.status === 'PASS').length;
        const failCount = this.results.filter(r => r.status === 'FAIL').length;
        const warnCount = this.results.filter(r => r.status === 'WARN').length;
        const errorCount = this.results.filter(r => r.status === 'ERROR').length;
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 RELATÓRIO FINAL DE CONECTIVIDADE');
        console.log('='.repeat(60));
        console.log();
        console.log(`✅ Testes Passou: ${passCount}`);
        console.log(`❌ Testes Falhou: ${failCount}`);
        console.log(`⚠️  Avisos: ${warnCount}`);
        console.log(`🔥 Erros: ${errorCount}`);
        console.log();
        
        if (failCount === 0 && errorCount === 0) {
            console.log('🎉 SUCESSO: Backend VPS1 está configurado corretamente para a API VPS2!');
        } else {
            console.log('⚠️  ATENÇÃO: Existem problemas que precisam ser corrigidos:');
            console.log();
            
            this.results.filter(r => r.status === 'FAIL' || r.status === 'ERROR').forEach(result => {
                console.log(`❌ ${result.test}: ${result.message}`);
            });
        }
        
        console.log();
        console.log('📋 CONFIGURAÇÕES ATUAIS:');
        console.log(`   API URL: ${this.mikrotikApiUrl}`);
        console.log(`   Token configurado: ${!!this.mikrotikApiToken}`);
        console.log(`   Token length: ${this.mikrotikApiToken?.length || 0} caracteres`);
        console.log();
        
        if (warnCount > 0) {
            console.log('⚠️  AVISOS:');
            this.results.filter(r => r.status === 'WARN').forEach(result => {
                console.log(`   • ${result.test}: ${result.message}`);
            });
            console.log();
        }
        
        console.log('🔧 PRÓXIMOS PASSOS:');
        if (failCount === 0 && errorCount === 0) {
            console.log('   1. ✅ Sistema pronto para uso!');
            console.log('   2. ✅ Monitore logs de produção');
            console.log('   3. ✅ Configure rate limits conforme necessário');
        } else {
            console.log('   1. 🔧 Corrija os problemas listados acima');
            console.log('   2. 🔧 Verifique configurações do .env');
            console.log('   3. 🔧 Execute este teste novamente');
        }
        
        console.log('='.repeat(60));
    }

    async run() {
        console.log('🚀 INICIANDO TESTE DE CONECTIVIDADE API VPS1 → VPS2');
        console.log('='.repeat(60));
        console.log();
        
        const configOk = await this.testConfiguration();
        if (!configOk) {
            this.log('Configuração inválida, interrompendo testes', 'error');
            this.generateReport();
            return;
        }
        
        await this.testBasicConnectivity();
        await this.testAuthentication();
        await this.testRateLimiting();
        await this.testEssentialEndpoints();
        
        this.generateReport();
    }
}

// Executar teste se chamado diretamente
if (require.main === module) {
    const tester = new ApiConnectionTester();
    tester.run().catch(error => {
        console.error('❌ Erro fatal no teste:', error.message);
        process.exit(1);
    });
}

module.exports = ApiConnectionTester;