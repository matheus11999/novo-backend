require('dotenv').config();
const axios = require('axios');

async function investigateAutoApproval() {
    console.log('🔍 Investigando aprovação automática...\n');
    
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    console.log('🔑 Token Info:');
    console.log(`📝 Prefixo: ${accessToken.substring(0, 20)}...`);
    console.log(`📊 Tipo: ${accessToken.startsWith('APP_USR-') ? 'PRODUÇÃO' : 'TESTE'}`);
    
    try {
        // 1. Consultar dados da conta
        console.log('\n🏢 Consultando dados da conta...');
        const accountResponse = await axios.get('https://api.mercadopago.com/users/me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        const account = accountResponse.data;
        console.log('📊 Conta Info:');
        console.log(`- ID: ${account.id}`);
        console.log(`- Site ID: ${account.site_id}`);
        console.log(`- País: ${account.country_id}`);
        console.log(`- Status: ${account.status}`);
        console.log(`- Verificado: ${account.secure_email}`);
        
        // 2. Verificar configurações de teste
        if (account.tags && account.tags.length > 0) {
            console.log('🏷️ Tags da conta:', account.tags);
        }
        
        // 3. Consultar payment methods para PIX
        console.log('\n💳 Consultando métodos de pagamento...');
        const paymentMethodsResponse = await axios.get(`https://api.mercadopago.com/v1/payment_methods/search?public_key=${accessToken.replace('APP_USR-', 'APP_USR-')}`);
        
        const pixMethod = paymentMethodsResponse.data.results?.find(method => method.id === 'pix');
        if (pixMethod) {
            console.log('📱 PIX Configuration:');
            console.log(`- Status: ${pixMethod.status}`);
            console.log(`- Settings: ${JSON.stringify(pixMethod.settings, null, 2)}`);
        }
        
        // 4. Testar valor diferente para ver se comportamento muda
        console.log('\n🧪 Testando diferentes valores...');
        
        const testValues = [0.01, 1.00, 10.00, 50.00];
        
        for (const value of testValues) {
            try {
                console.log(`\n💰 Testando valor: R$ ${value}`);
                
                const testPayment = {
                    transaction_amount: value,
                    description: `Teste valor ${value}`,
                    payment_method_id: 'pix',
                    external_reference: `test-value-${value}-${Date.now()}`,
                    payer: {
                        email: `test${value}@teste.com`,
                        first_name: 'Teste',
                        last_name: 'Valor'
                    }
                };
                
                const response = await axios.post('https://api.mercadopago.com/v1/payments', testPayment, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                console.log(`  📊 Status: ${response.data.status}`);
                console.log(`  📊 Live Mode: ${response.data.live_mode}`);
                console.log(`  📊 Processing Mode: ${response.data.processing_mode}`);
                
                if (response.data.status === 'approved') {
                    console.log(`  ⚠️ APROVADO AUTOMATICAMENTE para R$ ${value}`);
                } else {
                    console.log(`  ✅ Comportamento normal: ${response.data.status}`);
                }
                
                // Aguardar um pouco entre requests
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.log(`  ❌ Erro para R$ ${value}: ${error.message}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Erro na investigação:', error.message);
        if (error.response) {
            console.log('📝 Response data:', error.response.data);
        }
    }
}

investigateAutoApproval();