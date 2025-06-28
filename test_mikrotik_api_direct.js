const axios = require('axios');

// Teste direto da API MikroTik com novas rotas
async function testMikroTikAPIDirect() {
    const MIKROTIK_API_URL = 'http://localhost:3000';
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
    
    console.log('🧪 Testando API MikroTik diretamente...\n');
    
    try {
        // 1. Teste de conexão
        console.log('1️⃣ Testando conexão com MikroTik...');
        const connectionTest = await axios.post(`${MIKROTIK_API_URL}/test-connection`, {}, {
            params: credentials,
            headers: headers,
            timeout: 15000
        });
        console.log('✅ Conexão OK:', connectionTest.data);
        
        // 2. Listar usuários existentes
        console.log('\n2️⃣ Listando usuários existentes...');
        const listUsers = await axios.get(`${MIKROTIK_API_URL}/hotspot/users`, {
            params: credentials,
            headers: headers,
            timeout: 15000
        });
        console.log(`✅ Encontrados ${listUsers.data.count} usuários:`, 
            listUsers.data.data.map(u => `${u.name} (MAC: ${u['mac-address'] || 'N/A'})`));
        
        // 3. Testar deleção por MAC address (teste com MAC fictício)
        const testMac = '00:11:22:33:44:55';
        console.log(`\n3️⃣ Testando deleção por MAC: ${testMac}...`);
        const deleteTest = await axios.post(`${MIKROTIK_API_URL}/hotspot/users/delete-by-mac`, {
            mac_address: testMac
        }, {
            params: credentials,
            headers: headers,
            timeout: 15000
        });
        console.log('✅ Resultado da deleção:', deleteTest.data);
        
        // 4. Testar criação de usuário com MAC como username/password
        const cleanMac = testMac.replace(/[:-]/g, '').toLowerCase();
        const testUser = {
            name: cleanMac,
            password: cleanMac,
            profile: 'default',
            comment: `Teste via API - ${new Date().toISOString()}`,
            'mac-address': testMac
        };
        
        console.log(`\n4️⃣ Testando criação de usuário: ${testUser.name}...`);
        const createTest = await axios.post(`${MIKROTIK_API_URL}/hotspot/users`, testUser, {
            params: credentials,
            headers: headers,
            timeout: 15000
        });
        console.log('✅ Usuário criado:', createTest.data);
        
        // 5. Testar gerenciamento completo (deletar + criar)
        const testUser2 = {
            name: '001122334466',
            password: '001122334466',
            profile: 'default',
            comment: `Teste gerenciamento - ${new Date().toISOString()}`,
            'mac-address': '00:11:22:33:44:66'
        };
        
        console.log(`\n5️⃣ Testando gerenciamento completo (deletar + criar): ${testUser2.name}...`);
        const manageTest = await axios.post(`${MIKROTIK_API_URL}/hotspot/users/manage-with-mac`, testUser2, {
            params: credentials,
            headers: headers,
            timeout: 15000
        });
        console.log('✅ Gerenciamento completo:', manageTest.data);
        
        // 6. Verificar usuários finais
        console.log('\n6️⃣ Verificando usuários após testes...');
        const finalUsers = await axios.get(`${MIKROTIK_API_URL}/hotspot/users`, {
            params: credentials,
            headers: headers,
            timeout: 15000
        });
        console.log(`✅ Total de usuários após testes: ${finalUsers.data.count}`);
        finalUsers.data.data.forEach(user => {
            console.log(`   - ${user.name} (MAC: ${user['mac-address'] || 'N/A'}) | Comment: ${user.comment || 'N/A'}`);
        });
        
        return {
            success: true,
            message: 'Todos os testes passaram com sucesso!',
            totalUsers: finalUsers.data.count
        };
        
    } catch (error) {
        console.error('\n❌ Erro no teste:', error.message);
        
        if (error.response) {
            console.error('📥 Status:', error.response.status);
            console.error('📥 Dados:', JSON.stringify(error.response.data, null, 2));
        }
        
        if (error.code === 'ECONNREFUSED') {
            console.error('\n🚨 API MikroTik não está rodando em localhost:3000');
            console.error('   Execute: cd mikrotik-api+wireguard-vps2 && npm start');
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
    testMikroTikAPIDirect()
        .then(result => {
            console.log('\n🎯 Resultado final:', result.success ? '✅ SUCESSO' : '❌ FALHOU');
            if (!result.success) {
                console.log('💥 Erro:', result.error);
            }
        })
        .catch(error => {
            console.error('\n💥 Erro geral:', error.message);
        });
}

module.exports = { testMikroTikAPIDirect };