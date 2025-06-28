const axios = require('axios');

// Script de teste para criação de usuário no MikroTik
async function testMikrotikUserCreation() {
    const BASE_URL = 'http://localhost:3000';
    
    // Dados de teste
    const testData = {
        mikrotik_id: 'b5cf26c0-8581-49ec-80b1-d765aacff841',
        mac_address: '00:11:22:33:44:55',
        plano_nome: 'Plano 5MB' // Ajustar conforme seus planos
    };

    console.log('🧪 Testando criação de usuário no MikroTik...');
    console.log('📊 Dados de teste:', testData);

    try {
        // Teste 1: Criar usuário
        console.log('\n📤 Enviando requisição de criação...');
        const response = await axios.post(`${BASE_URL}/api/test/create-mikrotik-user`, testData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Resposta recebida:');
        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(response.data, null, 2));

        // Teste 2: Deletar usuário (para limpeza)
        console.log('\n🗑️ Testando deleção do usuário...');
        const deleteResponse = await axios.post(`${BASE_URL}/api/test/delete-mikrotik-user`, {
            mikrotik_id: testData.mikrotik_id,
            mac_address: testData.mac_address
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Deleção concluída:');
        console.log('Status:', deleteResponse.status);
        console.log('Data:', JSON.stringify(deleteResponse.data, null, 2));

    } catch (error) {
        console.error('❌ Erro no teste:', error.message);
        if (error.response) {
            console.error('📥 Resposta de erro:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

// Executar teste
if (require.main === module) {
    testMikrotikUserCreation();
}

module.exports = { testMikrotikUserCreation };