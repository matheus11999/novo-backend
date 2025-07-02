const axios = require('axios');

async function testBulkCreation() {
    const testData = {
        users: [
            {
                name: "test12345",
                password: "12345", 
                profile: "default",
                comment: "Teste criação em massa"
            }
        ],
        options: {
            batchSize: 1,
            delayBetweenBatches: 100,
            maxRetries: 1
        }
    };

    const config = {
        method: 'POST',
        url: 'http://193.181.208.141:3000/hotspot/users/bulk',
        params: {
            ip: '10.66.66.7',
            username: 'admin', 
            password: '2605',
            port: 8728
        },
        headers: {
            'Authorization': 'Bearer 8e2c15402ccf4ada0cf71b257ec8a004d7ba7c046cec2143a730c4fdcf44412fec6b0196add2314694d3d255311546957861b6b17f392bb3b141892c1c3dd56b',
            'Content-Type': 'application/json'
        },
        data: testData,
        timeout: 30000
    };

    try {
        console.log('🧪 Testando criação em massa...');
        console.log('URL:', config.url);
        console.log('Dados:', JSON.stringify(testData, null, 2));
        
        const response = await axios(config);
        
        console.log('✅ Sucesso!');
        console.log('Status:', response.status);
        console.log('Resposta:', JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.error('❌ Erro na criação em massa:');
        console.error('Status:', error.response?.status);
        console.error('Dados do erro:', error.response?.data);
        console.error('Mensagem:', error.message);
        
        if (error.response?.data) {
            console.log('\n📋 Detalhes do erro:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testBulkCreation(); 