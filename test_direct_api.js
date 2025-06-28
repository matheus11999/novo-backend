const axios = require('axios');

// Teste direto da API MikroTik VPS2
async function testDirectMikroTikAPI() {
    const MIKROTIK_API_URL = 'http://193.181.208.141:3000';
    const MIKROTIK_API_TOKEN = 'a7f8e9d2c1b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0';
    
    console.log('🧪 Testando API MikroTik VPS2 diretamente...');
    console.log('🔗 URL:', MIKROTIK_API_URL);
    console.log('🔑 Token configurado:', !!MIKROTIK_API_TOKEN);

    // Teste 1: Conectividade básica
    console.log('\n1️⃣ Testando conectividade básica...');
    const testEndpoints = [
        '/',
        '/health',
        '/status',
        '/api',
        '/api/health'
    ];

    for (const endpoint of testEndpoints) {
        try {
            console.log(`🔍 Testando: ${MIKROTIK_API_URL}${endpoint}`);
            const response = await axios.get(`${MIKROTIK_API_URL}${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${MIKROTIK_API_TOKEN}`,
                    'X-API-Token': MIKROTIK_API_TOKEN
                },
                timeout: 5000
            });
            
            console.log(`✅ ${endpoint} - Status: ${response.status}`);
            console.log(`📥 Response:`, JSON.stringify(response.data, null, 2));
            break; // Se chegou aqui, encontrou um endpoint funcional
        } catch (error) {
            console.log(`❌ ${endpoint} - Error: ${error.message}`);
            if (error.response) {
                console.log(`📥 Error response:`, error.response.data);
            }
        }
    }

    // Teste 2: Tentar listar usuários (se conseguir conectar)
    console.log('\n2️⃣ Testando endpoints de usuários...');
    const userEndpoints = [
        '/api/hotspot/users',
        '/hotspot/users',
        '/api/users', 
        '/users',
        '/api/mikrotik/users',
        '/mikrotik/users'
    ];

    const credentials = {
        ip: '10.66.66.7',
        username: 'admin',
        password: 'admin123',
        port: 8728
    };

    for (const endpoint of userEndpoints) {
        try {
            console.log(`🔍 Testando users endpoint: ${MIKROTIK_API_URL}${endpoint}`);
            
            // Try GET first
            try {
                const response = await axios.get(`${MIKROTIK_API_URL}${endpoint}`, {
                    headers: {
                        'Authorization': `Bearer ${MIKROTIK_API_TOKEN}`,
                        'X-API-Token': MIKROTIK_API_TOKEN
                    },
                    params: credentials,
                    timeout: 10000
                });
                
                console.log(`✅ GET ${endpoint} - Status: ${response.status}`);
                console.log(`📥 Users response:`, JSON.stringify(response.data, null, 2));
                
                // Se chegou aqui, encontrou endpoint funcional
                return { success: true, endpoint, method: 'GET', credentials };
            } catch (getError) {
                console.log(`❌ GET ${endpoint} failed: ${getError.message}`);
                
                // Try POST
                try {
                    const response = await axios.post(`${MIKROTIK_API_URL}${endpoint}`, credentials, {
                        headers: {
                            'Authorization': `Bearer ${MIKROTIK_API_TOKEN}`,
                            'X-API-Token': MIKROTIK_API_TOKEN,
                            'Content-Type': 'application/json'
                        },
                        timeout: 10000
                    });
                    
                    console.log(`✅ POST ${endpoint} - Status: ${response.status}`);
                    console.log(`📥 Users response:`, JSON.stringify(response.data, null, 2));
                    
                    return { success: true, endpoint, method: 'POST', credentials };
                } catch (postError) {
                    console.log(`❌ POST ${endpoint} failed: ${postError.message}`);
                }
            }
        } catch (error) {
            console.log(`❌ ${endpoint} - Error: ${error.message}`);
        }
    }

    console.log('\n❌ Nenhum endpoint de usuários funcional encontrado');
    return { success: false };
}

// Executar teste
if (require.main === module) {
    testDirectMikroTikAPI()
        .then(result => {
            console.log('\n🎯 Resultado final:', result);
        })
        .catch(error => {
            console.error('\n💥 Erro no teste:', error.message);
        });
}

module.exports = { testDirectMikroTikAPI };