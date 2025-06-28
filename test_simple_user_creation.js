const axios = require('axios');

// Teste simples criação de usuário usando endpoint local
async function testSimpleUserCreation() {
    const BASE_URL = 'http://localhost:3000';
    
    console.log('🧪 Teste simples de criação de usuário MikroTik...\n');

    // Dados de teste
    const testData = {
        mikrotik_id: 'b5cf26c0-8581-49ec-80b1-d765aacff841',
        mac_address: '00:11:22:33:44:55',
        plano_nome: 'default'  // Usar profile default que provavelmente existe
    };

    try {
        console.log('📤 Enviando requisição para criação de usuário...');
        console.log('📊 Dados:', testData);

        const response = await axios.post(`http://193.181.208.141:3000/api/test/create-mikrotik-user`, testData, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000  // 30 segundos timeout
        });

        console.log('\n✅ Sucesso!');
        console.log('📥 Status:', response.status);
        console.log('📥 Dados:', JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.error('\n❌ Erro na criação:');
        console.error('📥 Mensagem:', error.message);
        
        if (error.response) {
            console.error('📥 Status:', error.response.status);
            console.error('📥 Dados:', JSON.stringify(error.response.data, null, 2));
        }
    }

    // Teste adicional: verificar dados do MikroTik
    try {
        console.log('\n🔍 Verificando dados do MikroTik no banco...');
        
        const mikrotikResponse = await axios.post(`http://193.181.208.141:3000/api/test/check-mikrotik`, {
            mikrotik_id: testData.mikrotik_id
        });

        console.log('✅ Dados do MikroTik:');
        console.log('📥', JSON.stringify(mikrotikResponse.data, null, 2));

    } catch (error) {
        console.error('❌ Erro ao verificar MikroTik:', error.message);
    }
}

// Executar teste
if (require.main === module) {
    testSimpleUserCreation();
}

module.exports = { testSimpleUserCreation };