const axios = require('axios');

// Teste simples dos endpoints locais
async function testLocalEndpoints() {
    const BASE_URL = 'http://localhost:3000';
    
    console.log('🧪 Testando endpoints locais...\n');

    // Teste 1: Health check
    try {
        console.log('1️⃣ Testando health check...');
        const healthResponse = await axios.get(`${BASE_URL}/health`);
        console.log('✅ Health check OK:', healthResponse.data);
    } catch (error) {
        console.error('❌ Health check falhou:', error.message);
        return;
    }

    // Teste 2: Conectividade MikroTik API
    try {
        console.log('\n2️⃣ Testando conectividade MikroTik API...');
        const apiHealthResponse = await axios.get(`${BASE_URL}/api/test/mikrotik-api-health`);
        console.log('✅ MikroTik API conectividade:', apiHealthResponse.data);
    } catch (error) {
        console.error('❌ MikroTik API conectividade falhou:', error.response?.data || error.message);
    }

    // Teste 3: Buscar planos
    try {
        console.log('\n3️⃣ Testando busca de planos...');
        const plansResponse = await axios.post(`${BASE_URL}/api/payment/plans-by-mikrotik`, {
            mikrotik_id: 'b5cf26c0-8581-49ec-80b1-d765aacff841'
        });
        console.log('✅ Planos encontrados:', plansResponse.data);
    } catch (error) {
        console.error('❌ Busca de planos falhou:', error.response?.data || error.message);
    }

    // Teste 4: Verificar se MikroTik existe no banco
    try {
        console.log('\n4️⃣ Verificando dados do MikroTik no banco...');
        const mikrotikTestResponse = await axios.post(`${BASE_URL}/api/test/check-mikrotik`, {
            mikrotik_id: 'b5cf26c0-8581-49ec-80b1-d765aacff841'
        });
        console.log('✅ MikroTik no banco:', mikrotikTestResponse.data);
    } catch (error) {
        console.error('❌ Verificação do MikroTik falhou:', error.response?.data || error.message);
    }
}

// Executar teste
if (require.main === module) {
    testLocalEndpoints();
}

module.exports = { testLocalEndpoints };