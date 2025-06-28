const axios = require('axios');

// Teste local com credenciais corretas
async function testLocalMikroTik() {
    // Configurações locais
    const MIKROTIK_API_URL = 'http://localhost:3000';
    const MIKROTIK_API_TOKEN = 'a7f8e9d2c1b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0';
    
    // Credenciais corretas do MikroTik
    const credentials = {
        ip: '10.66.66.7',
        username: 'admin',
        password: '2605',
        port: 8728
    };

    // Dados do usuário de teste
    const testMac = '00:11:22:33:44:55';
    const cleanMac = testMac.replace(/[:-]/g, '').toLowerCase();
    
    const userData = {
        name: cleanMac,
        password: cleanMac,
        profile: 'default',
        comment: 'Teste exclusao/criacao - ' + new Date().toISOString(),
        'mac-address': testMac
    };

    console.log('🧪 Testando exclusão e criação de usuário MikroTik...');
    console.log('🔗 API URL:', MIKROTIK_API_URL);
    console.log('🔧 Credenciais MikroTik:', credentials.ip, credentials.username);
    console.log('👤 Usuário de teste:', userData.name);

    try {
        // PASSO 1: Listar usuários para ver se já existe
        console.log('\n1️⃣ Listando usuários existentes...');
        const listResponse = await axios.get(`${MIKROTIK_API_URL}/hotspot/users`, {
            headers: {
                'Authorization': `Bearer ${MIKROTIK_API_TOKEN}`,
                'X-API-Token': MIKROTIK_API_TOKEN,
                'Content-Type': 'application/json'
            },
            params: credentials,
            timeout: 15000
        });

        console.log('✅ Lista de usuários obtida:', listResponse.status);
        console.log('📊 Total de usuários:', listResponse.data?.data?.length || 0);

        // Verificar se usuário já existe
        const existingUsers = listResponse.data?.data || [];
        const existingUser = existingUsers.find(user => 
            (user['mac-address'] && user['mac-address'].replace(/[:-]/g, '').toLowerCase() === cleanMac) ||
            (user.name && user.name.toLowerCase() === cleanMac)
        );

        if (existingUser) {
            console.log('🔍 Usuário existente encontrado:', existingUser);

            // PASSO 2: Tentar deletar usuário existente
            console.log('\n2️⃣ Deletando usuário existente...');
            try {
                const deleteResponse = await axios.delete(`${MIKROTIK_API_URL}/hotspot/users`, {
                    headers: {
                        'Authorization': `Bearer ${MIKROTIK_API_TOKEN}`,
                        'X-API-Token': MIKROTIK_API_TOKEN,
                        'Content-Type': 'application/json'
                    },
                    params: {
                        ...credentials,
                        id: existingUser['.id']
                    },
                    timeout: 15000
                });

                console.log('✅ Usuário deletado com sucesso:', deleteResponse.status);
                console.log('📥 Resposta da deleção:', deleteResponse.data);
            } catch (deleteError) {
                console.log('❌ Erro na deleção:', deleteError.message);
                if (deleteError.response) {
                    console.log('📥 Erro na deleção:', deleteError.response.data);
                }
            }
        } else {
            console.log('ℹ️ Usuário não existe ainda');
        }

        // PASSO 3: Criar novo usuário
        console.log('\n3️⃣ Criando novo usuário...');
        const createPayload = {
            ...credentials,
            ...userData
        };

        console.log('📤 Payload de criação:', createPayload);

        const createResponse = await axios.post(`${MIKROTIK_API_URL}/hotspot/users`, createPayload, {
            headers: {
                'Authorization': `Bearer ${MIKROTIK_API_TOKEN}`,
                'X-API-Token': MIKROTIK_API_TOKEN,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        console.log('✅ Usuário criado com sucesso:', createResponse.status);
        console.log('📥 Resposta da criação:', createResponse.data);

        // PASSO 4: Verificar se foi criado
        console.log('\n4️⃣ Verificando usuário criado...');
        const verifyResponse = await axios.get(`${MIKROTIK_API_URL}/hotspot/users`, {
            headers: {
                'Authorization': `Bearer ${MIKROTIK_API_TOKEN}`,
                'X-API-Token': MIKROTIK_API_TOKEN,
                'Content-Type': 'application/json'
            },
            params: credentials,
            timeout: 15000
        });

        const newUsers = verifyResponse.data?.data || [];
        const createdUser = newUsers.find(user => 
            (user.name && user.name.toLowerCase() === cleanMac)
        );

        if (createdUser) {
            console.log('✅ Usuário verificado com sucesso:', createdUser);
        } else {
            console.log('❌ Usuário não encontrado após criação');
        }

        return {
            success: true,
            message: 'Teste completo realizado com sucesso',
            createdUser: createdUser
        };

    } catch (error) {
        console.error('\n💥 Erro no teste:', error.message);
        if (error.response) {
            console.error('📥 Detalhes do erro:', error.response.data);
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
    testLocalMikroTik()
        .then(result => {
            console.log('\n🎯 Resultado final:', result);
        })
        .catch(error => {
            console.error('\n💥 Erro geral:', error.message);
        });
}

module.exports = { testLocalMikroTik };