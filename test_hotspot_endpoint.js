const axios = require('axios');

// Teste específico do endpoint /hotspot/users
async function testHotspotEndpoint() {
    const MIKROTIK_API_URL = 'http://193.181.208.141:3000';
    const MIKROTIK_API_TOKEN = 'a7f8e9d2c1b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0';
    
    console.log('🧪 Testando endpoint /hotspot/users específico...');

    const credentials = {
        ip: '10.66.66.7',
        username: 'admin', 
        password: 'admin123',
        port: 8728
    };

    // Teste 1: GET com diferentes formatos de parâmetros
    console.log('\n1️⃣ Testando GET /hotspot/users...');
    
    const getVariations = [
        { method: 'params', data: credentials },
        { method: 'query string', data: `?ip=${credentials.ip}&username=${credentials.username}&password=${credentials.password}&port=${credentials.port}` },
        { method: 'headers', data: credentials }
    ];

    for (const variation of getVariations) {
        try {
            console.log(`🔍 Testando GET com ${variation.method}...`);
            
            let config = {
                headers: {
                    'Authorization': `Bearer ${MIKROTIK_API_TOKEN}`,
                    'X-API-Token': MIKROTIK_API_TOKEN,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            };

            if (variation.method === 'params') {
                config.params = variation.data;
            } else if (variation.method === 'headers') {
                config.headers = { ...config.headers, ...variation.data };
            }

            const url = variation.method === 'query string' 
                ? `${MIKROTIK_API_URL}/hotspot/users${variation.data}`
                : `${MIKROTIK_API_URL}/hotspot/users`;

            const response = await axios.get(url, config);
            
            console.log(`✅ GET Success with ${variation.method}:`, response.status);
            console.log('📥 Response:', JSON.stringify(response.data, null, 2));
            return { success: true, method: 'GET', variation: variation.method };
            
        } catch (error) {
            console.log(`❌ GET with ${variation.method} failed:`, error.message);
            if (error.response) {
                console.log(`📥 Error response:`, error.response.status, error.response.data);
            }
        }
    }

    // Teste 2: POST com diferentes formatos de body
    console.log('\n2️⃣ Testando POST /hotspot/users...');
    
    const postVariations = [
        { method: 'direct credentials', data: credentials },
        { method: 'nested credentials', data: { credentials: credentials } },
        { method: 'connection object', data: { connection: credentials } },
        { method: 'mikrotik object', data: { mikrotik: credentials } }
    ];

    for (const variation of postVariations) {
        try {
            console.log(`🔍 Testando POST com ${variation.method}...`);
            
            const response = await axios.post(`${MIKROTIK_API_URL}/hotspot/users`, variation.data, {
                headers: {
                    'Authorization': `Bearer ${MIKROTIK_API_TOKEN}`,
                    'X-API-Token': MIKROTIK_API_TOKEN,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            
            console.log(`✅ POST Success with ${variation.method}:`, response.status);
            console.log('📥 Response:', JSON.stringify(response.data, null, 2));
            return { success: true, method: 'POST', variation: variation.method };
            
        } catch (error) {
            console.log(`❌ POST with ${variation.method} failed:`, error.message);
            if (error.response) {
                console.log(`📥 Error response:`, error.response.status, error.response.data);
            }
        }
    }

    // Teste 3: Tentar criar um usuário diretamente
    console.log('\n3️⃣ Testando criação de usuário...');
    
    const userToCreate = {
        name: '001122334455',
        password: '001122334455', 
        profile: 'default',
        comment: 'Teste API',
        'mac-address': '00:11:22:33:44:55'
    };

    const createVariations = [
        { method: 'user + credentials', data: { ...userToCreate, ...credentials } },
        { method: 'nested user', data: { user: userToCreate, credentials: credentials } },
        { method: 'separate objects', data: { user: userToCreate, connection: credentials } }
    ];

    for (const variation of createVariations) {
        try {
            console.log(`🔍 Testando criação com ${variation.method}...`);
            
            const response = await axios.post(`${MIKROTIK_API_URL}/hotspot/users`, variation.data, {
                headers: {
                    'Authorization': `Bearer ${MIKROTIK_API_TOKEN}`,
                    'X-API-Token': MIKROTIK_API_TOKEN,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });
            
            console.log(`✅ CREATE Success with ${variation.method}:`, response.status);
            console.log('📥 Response:', JSON.stringify(response.data, null, 2));
            return { success: true, method: 'CREATE', variation: variation.method };
            
        } catch (error) {
            console.log(`❌ CREATE with ${variation.method} failed:`, error.message);
            if (error.response) {
                console.log(`📥 Error response:`, error.response.status, error.response.data);
            }
        }
    }

    console.log('\n❌ Nenhuma variação funcionou');
    return { success: false };
}

// Executar teste
if (require.main === module) {
    testHotspotEndpoint()
        .then(result => {
            console.log('\n🎯 Resultado:', result);
        })
        .catch(error => {
            console.error('\n💥 Erro:', error.message);
        });
}

module.exports = { testHotspotEndpoint };