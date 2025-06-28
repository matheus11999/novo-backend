const axios = require('axios');

// Teste da API MikroTik em produção
async function testProductionMikroTik() {
    const MIKROTIK_API_URL = 'http://193.181.208.141:3000';
    const MIKROTIK_API_TOKEN = 'a7f8e9d2c1b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0';
    
    // Credenciais do MikroTik fornecidas pelo usuário
    const credentials = {
        ip: '10.66.66.7',
        username: 'admin',
        password: '2605',
        port: 8728
    };
    
    const headers = {
        'Authorization': `Bearer ${MIKROTIK_API_TOKEN}`,
        'Content-Type': 'application/json'
    };
    
    console.log('🚀 Testando API MikroTik em PRODUÇÃO...');
    console.log(`📡 URL: ${MIKROTIK_API_URL}`);
    console.log(`🔐 MikroTik: ${credentials.ip}:${credentials.port}`);
    console.log(`👤 Usuário: ${credentials.username}\n`);
    
    try {
        // 1. Health check da API
        console.log('1️⃣ Verificando health da API...');
        const health = await axios.get(`${MIKROTIK_API_URL}/health`, {
            timeout: 10000
        });
        console.log('✅ API Status:', health.data.status);
        console.log('📊 Uptime:', Math.round(health.data.uptime), 'segundos\n');
        
        // 2. Teste de conexão com MikroTik
        console.log('2️⃣ Testando conexão com MikroTik...');
        const connectionTest = await axios.post(`${MIKROTIK_API_URL}/test-connection`, {}, {
            params: credentials,
            headers: headers,
            timeout: 15000
        });
        console.log('✅ Conexão com MikroTik:', connectionTest.data.success ? 'OK' : 'FALHOU');
        if (connectionTest.data.data) {
            console.log('📋 Info:', connectionTest.data.data.message);
        }
        
        // 3. Listar usuários hotspot existentes
        console.log('\n3️⃣ Listando usuários hotspot...');
        const listUsers = await axios.get(`${MIKROTIK_API_URL}/hotspot/users`, {
            params: credentials,
            headers: headers,
            timeout: 15000
        });
        console.log(`✅ Usuários encontrados: ${listUsers.data.count}`);
        
        if (listUsers.data.count > 0) {
            console.log('📋 Usuários existentes:');
            listUsers.data.data.slice(0, 5).forEach((user, index) => {
                console.log(`   ${index + 1}. ${user.name} | MAC: ${user['mac-address'] || 'N/A'} | Profile: ${user.profile || 'default'}`);
            });
            if (listUsers.data.count > 5) {
                console.log(`   ... e mais ${listUsers.data.count - 5} usuários`);
            }
        }
        
        // 4. Teste de gerenciamento de usuário (deletar + criar)
        const testMac = '00:11:22:33:44:99';
        const cleanMac = testMac.replace(/[:-]/g, '').toLowerCase();
        const testUser = {
            name: cleanMac,
            password: cleanMac,
            profile: 'default',
            comment: `Teste produção PIX - ${new Date().toISOString()}`,
            'mac-address': testMac
        };
        
        console.log(`\n4️⃣ Testando gerenciamento de usuário: ${cleanMac}`);
        console.log(`🔧 MAC: ${testMac}`);
        console.log(`👤 Username/Password: ${cleanMac}`);
        
        const manageTest = await axios.post(`${MIKROTIK_API_URL}/hotspot/users/manage-with-mac`, testUser, {
            params: credentials,
            headers: headers,
            timeout: 20000
        });
        
        console.log('✅ Gerenciamento realizado:', manageTest.data.success ? 'SUCESSO' : 'FALHOU');
        
        if (manageTest.data.data) {
            const results = manageTest.data.data;
            
            // Resultado da deleção
            if (results.deleteResult) {
                console.log(`🗑️ Deleção: ${results.deleteResult.deleted ? 'Usuário deletado' : 'Nenhum usuário para deletar'}`);
                if (results.deleteResult.deletedUser) {
                    console.log(`   Deletado: ${results.deleteResult.deletedUser.name}`);
                }
            }
            
            // Resultado da criação
            if (results.createResult) {
                console.log(`👤 Criação: Usuário criado com sucesso`);
                console.log(`   ID: ${JSON.stringify(results.createResult).substring(0, 50)}...`);
            }
        }
        
        // 5. Verificar se o usuário foi criado
        console.log('\n5️⃣ Verificando usuário criado...');
        const finalUsers = await axios.get(`${MIKROTIK_API_URL}/hotspot/users`, {
            params: credentials,
            headers: headers,
            timeout: 15000
        });
        
        const createdUser = finalUsers.data.data.find(u => u.name === cleanMac);
        if (createdUser) {
            console.log('✅ Usuário encontrado na lista:');
            console.log(`   Nome: ${createdUser.name}`);
            console.log(`   MAC: ${createdUser['mac-address'] || 'N/A'}`);
            console.log(`   Profile: ${createdUser.profile || 'default'}`);
            console.log(`   Comment: ${createdUser.comment || 'N/A'}`);
            console.log(`   Disabled: ${createdUser.disabled || 'false'}`);
        } else {
            console.log('❌ Usuário não encontrado na lista final');
        }
        
        return {
            success: true,
            message: 'Teste em produção realizado com sucesso!',
            userCreated: !!createdUser,
            totalUsers: finalUsers.data.count
        };
        
    } catch (error) {
        console.error('\n❌ Erro no teste:', error.message);
        
        if (error.response) {
            console.error('📥 Status HTTP:', error.response.status);
            console.error('📥 Dados do erro:', JSON.stringify(error.response.data, null, 2));
        }
        
        if (error.code === 'ECONNREFUSED') {
            console.error('\n🚨 Não foi possível conectar à API MikroTik em produção');
            console.error('   Verifique se o serviço está rodando em:', MIKROTIK_API_URL);
        } else if (error.code === 'ENOTFOUND') {
            console.error('\n🚨 Host não encontrado:', MIKROTIK_API_URL);
        } else if (error.response?.status === 401) {
            console.error('\n🚨 Erro de autenticação - Token inválido');
        } else if (error.response?.status === 500) {
            console.error('\n🚨 Erro interno da API - Problema com MikroTik ou credenciais');
        }
        
        return {
            success: false,
            error: error.message,
            details: error.response?.data
        };
    }
}

// Executar teste
if (require.main === module) {
    console.log('🎯 Iniciando teste da API MikroTik em PRODUÇÃO...\n');
    
    testProductionMikroTik()
        .then(result => {
            console.log('\n🎯 RESULTADO FINAL:', result.success ? '✅ SUCESSO' : '❌ FALHOU');
            
            if (result.success) {
                console.log(`📊 Usuário criado: ${result.userCreated ? 'SIM' : 'NÃO'}`);
                console.log(`📊 Total de usuários: ${result.totalUsers}`);
                console.log('\n🎉 Sistema de gerenciamento de usuários hotspot funcionando!');
            } else {
                console.log('💥 Erro:', result.error);
                console.log('\n❗ Verifique logs acima para detalhes do problema');
            }
        })
        .catch(error => {
            console.error('\n💥 Erro geral no teste:', error.message);
        });
}

module.exports = { testProductionMikroTik };