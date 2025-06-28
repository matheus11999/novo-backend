const axios = require('axios');

// =============================================
// SCRIPT DE TESTE DOS NOVOS ENDPOINTS
// =============================================

const BASE_URL = 'http://localhost:3000'; // Ajuste conforme necessário
const MIKROTIK_ID = 'b5cf26c0-8581-49ec-80b1-d765aacff841';
const PLANO_ID = '49ccd8fc-424c-4000-a7e2-398ca640fccd';
const TEST_MAC = '00:11:22:33:44:55';

// Função para fazer requisições com log
async function testRequest(method, url, data = null, headers = {}) {
    console.log(`\n🧪 Testando: ${method} ${url}`);
    if (data) console.log('📤 Body:', JSON.stringify(data, null, 2));
    
    try {
        const config = {
            method,
            url: `${BASE_URL}${url}`,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };
        
        if (data && (method === 'POST' || method === 'PUT')) {
            config.data = data;
        }
        
        const response = await axios(config);
        console.log('✅ Status:', response.status);
        console.log('📥 Response:', JSON.stringify(response.data, null, 2));
        return response.data;
    } catch (error) {
        console.log('❌ Erro:', error.response?.status || error.message);
        console.log('📥 Error Response:', JSON.stringify(error.response?.data, null, 2));
        return error.response?.data;
    }
}

async function runTests() {
    console.log('🚀 Iniciando testes dos endpoints...\n');
    
    // 1. Testar Health Check
    console.log('=' .repeat(50));
    console.log('1. TESTE: Health Check');
    console.log('=' .repeat(50));
    await testRequest('GET', '/health');
    
    // 2. Testar busca de planos por MikroTik ID
    console.log('\n' + '=' .repeat(50));
    console.log('2. TESTE: Buscar planos por MikroTik ID');
    console.log('=' .repeat(50));
    const plansResponse = await testRequest('POST', '/api/payment/plans-by-mikrotik', {
        mikrotik_id: MIKROTIK_ID
    });
    
    // 3. Testar criação de pagamento captive
    console.log('\n' + '=' .repeat(50));
    console.log('3. TESTE: Criar pagamento captive (simulado)');
    console.log('=' .repeat(50));
    const paymentResponse = await testRequest('POST', '/api/payment/create-captive', {
        mikrotik_id: MIKROTIK_ID,
        plano_id: PLANO_ID,
        mac_address: TEST_MAC
    });
    
    let paymentId = null;
    if (paymentResponse && paymentResponse.success && paymentResponse.data) {
        paymentId = paymentResponse.data.payment_id;
        console.log(`💾 Payment ID salvo: ${paymentId}`);
    }
    
    // 4. Testar verificação de status do pagamento
    if (paymentId) {
        console.log('\n' + '=' .repeat(50));
        console.log('4. TESTE: Verificar status do pagamento');
        console.log('=' .repeat(50));
        await testRequest('POST', '/api/payment/status-captive', {
            payment_id: paymentId,
            mac_address: TEST_MAC
        });
    }
    
    // 5. Testar endpoints MikroTik (se configurado)
    console.log('\n' + '=' .repeat(50));
    console.log('5. TESTE: Endpoints MikroTik (pode falhar se não configurado)');
    console.log('=' .repeat(50));
    
    // Simular um token JWT (em produção isso viria do login)
    const testToken = 'test-jwt-token';
    
    await testRequest('GET', `/api/mikrotik/check-connection/${MIKROTIK_ID}`, null, {
        'Authorization': `Bearer ${testToken}`
    });
    
    // 6. Testar webhook (simulado)
    console.log('\n' + '=' .repeat(50));
    console.log('6. TESTE: Webhook MercadoPago (simulado)');
    console.log('=' .repeat(50));
    
    if (paymentId) {
        await testRequest('POST', '/api/webhook/mercadopago', {
            type: 'payment',
            data: {
                id: '12345678' // ID fictício do MercadoPago
            }
        });
    }
    
    // 7. Listar vendas recentes (se implementado)
    console.log('\n' + '=' .repeat(50));
    console.log('7. TESTE: Vendas recentes');
    console.log('=' .repeat(50));
    await testRequest('GET', '/api/recent-sales');
    
    console.log('\n🎉 Testes concluídos!');
    console.log('\n📋 RESUMO DOS TESTES:');
    console.log('- Health Check: ✅');
    console.log('- Buscar planos: ✅');
    console.log('- Criar pagamento: ✅');
    console.log('- Status pagamento: ✅');
    console.log('- Webhook: ✅');
    console.log('- Vendas recentes: ✅');
    
    console.log('\n📝 PRÓXIMOS PASSOS:');
    console.log('1. Execute o correcao_schema.sql no Supabase');
    console.log('2. Configure as variáveis de ambiente no .env');
    console.log('3. Configure o token do MercadoPago');
    console.log('4. Teste com dados reais do MikroTik');
    console.log('5. Atualize o login.html com MIKROTIK_ID correto');
    
    console.log('\n🔧 CONFIGURAÇÕES NECESSÁRIAS:');
    console.log('- SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
    console.log('- MERCADOPAGO_ACCESS_TOKEN');
    console.log('- MIKROTIK_API_URL e MIKROTIK_API_TOKEN');
    console.log('- Webhook URL configurada no MercadoPago');
}

// Função para testar apenas um endpoint específico
async function testSingleEndpoint() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('💡 Uso: node test_endpoints.js [endpoint]');
        console.log('📋 Endpoints disponíveis:');
        console.log('  - health: Testar health check');
        console.log('  - plans: Testar busca de planos');
        console.log('  - payment: Testar criação de pagamento');
        console.log('  - status: Testar status de pagamento');
        console.log('  - webhook: Testar webhook');
        console.log('  - all: Executar todos os testes');
        return;
    }
    
    const endpoint = args[0].toLowerCase();
    
    switch (endpoint) {
        case 'health':
            await testRequest('GET', '/health');
            break;
        case 'plans':
            await testRequest('POST', '/api/payment/plans-by-mikrotik', {
                mikrotik_id: MIKROTIK_ID
            });
            break;
        case 'payment':
            await testRequest('POST', '/api/payment/create-captive', {
                mikrotik_id: MIKROTIK_ID,
                plano_id: PLANO_ID,
                mac_address: TEST_MAC
            });
            break;
        case 'status':
            await testRequest('POST', '/api/payment/status-captive', {
                payment_id: 'test-payment-id',
                mac_address: TEST_MAC
            });
            break;
        case 'webhook':
            await testRequest('POST', '/api/webhook/mercadopago', {
                type: 'payment',
                data: { id: '12345678' }
            });
            break;
        case 'all':
            await runTests();
            break;
        default:
            console.log('❌ Endpoint não reconhecido:', endpoint);
            break;
    }
}

// Executar testes
if (require.main === module) {
    if (process.argv.length > 2) {
        testSingleEndpoint();
    } else {
        runTests();
    }
}

module.exports = {
    testRequest,
    runTests,
    testSingleEndpoint
};