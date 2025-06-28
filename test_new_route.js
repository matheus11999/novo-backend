const axios = require('axios');

// Teste da nova rota mikrotik-user
async function testNewMikroTikRoute() {
    const BASE_URL = 'http://localhost:3000';
    
    console.log('🧪 Testando nova rota /api/mikrotik-user/manage-user...\n');

    // Dados de teste com credenciais corretas
    const testData = {
        mikrotik_id: 'b5cf26c0-8581-49ec-80b1-d765aacff841',
        mac_address: '00:11:22:33:44:55',
        username: '001122334455',
        password: '001122334455',
        profile: 'default',
        comment: 'Teste via nova rota - ' + new Date().toISOString()
    };

    console.log('📊 Dados de teste:', testData);

    try {
        // Teste 1: Gerenciar usuário (deletar + criar)
        console.log('\n1️⃣ Testando manage-user (deletar + criar)...');
        
        const manageResponse = await axios.post(`${BASE_URL}/api/mikrotik-user/manage-user`, testData, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        console.log('✅ Gerenciamento completo realizado!');
        console.log('📥 Status:', manageResponse.status);
        console.log('📥 Resposta:', JSON.stringify(manageResponse.data, null, 2));

        // Teste 2: Deletar usuário específico
        console.log('\n2️⃣ Testando delete-user...');
        
        const deleteData = {
            mikrotik_id: testData.mikrotik_id,
            mac_address: testData.mac_address
        };

        const deleteResponse = await axios.post(`${BASE_URL}/api/mikrotik-user/delete-user`, deleteData, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        console.log('✅ Deleção específica realizada!');
        console.log('📥 Status:', deleteResponse.status);
        console.log('📥 Resposta:', JSON.stringify(deleteResponse.data, null, 2));

        // Teste 3: Criar usuário específico
        console.log('\n3️⃣ Testando create-user...');
        
        const createResponse = await axios.post(`${BASE_URL}/api/mikrotik-user/create-user`, testData, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        console.log('✅ Criação específica realizada!');
        console.log('📥 Status:', createResponse.status);
        console.log('📥 Resposta:', JSON.stringify(createResponse.data, null, 2));

        return {
            success: true,
            message: 'Todos os testes realizados com sucesso',
            results: {
                manage: manageResponse.data,
                delete: deleteResponse.data,
                create: createResponse.data
            }
        };

    } catch (error) {
        console.error('\n❌ Erro no teste:', error.message);
        
        if (error.response) {
            console.error('📥 Status:', error.response.status);
            console.error('📥 Dados:', JSON.stringify(error.response.data, null, 2));
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
    testNewMikroTikRoute()
        .then(result => {
            console.log('\n🎯 Resultado final dos testes:', result.success ? '✅ SUCESSO' : '❌ FALHOU');
            if (!result.success) {
                console.log('💥 Detalhes do erro:', result);
            }
        })
        .catch(error => {
            console.error('\n💥 Erro geral:', error.message);
        });
}

module.exports = { testNewMikroTikRoute };