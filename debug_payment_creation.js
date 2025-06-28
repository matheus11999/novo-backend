require('dotenv').config();
const { payment } = require('./src/config/mercadopago');

async function debugPaymentCreation() {
    console.log('🔍 Investigando problema de Payment ID duplicado...\n');
    
    // Criar múltiplos pagamentos com dados únicos
    const tests = [
        {
            amount: 5.00,
            ref: 'unique-test-1-' + Date.now(),
            email: 'test1@unique.com'
        },
        {
            amount: 10.00,
            ref: 'unique-test-2-' + Date.now() + Math.random().toString(36).substr(2, 9),
            email: 'test2@unique.com'
        },
        {
            amount: 15.00,
            ref: 'unique-test-3-' + Date.now() + Math.random().toString(36).substr(2, 9),
            email: 'test3@unique.com'
        }
    ];
    
    console.log('🧪 Criando múltiplos pagamentos para testar unicidade...\n');
    
    for (let i = 0; i < tests.length; i++) {
        const test = tests[i];
        
        try {
            console.log(`📤 Teste ${i + 1}/3:`);
            console.log(`💰 Valor: R$ ${test.amount}`);
            console.log(`🔗 External Reference: ${test.ref}`);
            console.log(`📧 Email: ${test.email}`);
            
            const paymentData = {
                transaction_amount: test.amount,
                description: `Teste unicidade ${i + 1} - ${test.amount}`,
                payment_method_id: 'pix',
                external_reference: test.ref,
                payer: {
                    email: test.email,
                    first_name: `Teste${i + 1}`,
                    last_name: 'Unicidade',
                    identification: {
                        type: 'CPF',
                        number: `1112223334${i}`
                    }
                }
            };
            
            console.log('📊 Dados enviados:');
            console.log(JSON.stringify(paymentData, null, 2));
            
            const result = await payment.create({ body: paymentData });
            
            console.log('\n📥 Resposta recebida:');
            console.log(`📊 Payment ID: ${result.id}`);
            console.log(`💰 Valor retornado: R$ ${result.transaction_amount}`);
            console.log(`🔗 External Reference retornado: ${result.external_reference}`);
            console.log(`📊 Status: ${result.status}`);
            console.log(`🎯 Live Mode: ${result.live_mode}`);
            
            // Verificar se dados batem
            if (result.external_reference === test.ref) {
                console.log('✅ External Reference correto');
            } else {
                console.log('❌ External Reference diferente!');
                console.log(`   Enviado: ${test.ref}`);
                console.log(`   Recebido: ${result.external_reference}`);
            }
            
            if (Math.abs(result.transaction_amount - test.amount) < 0.01) {
                console.log('✅ Valor correto');
            } else {
                console.log('❌ Valor diferente!');
                console.log(`   Enviado: ${test.amount}`);
                console.log(`   Recebido: ${result.transaction_amount}`);
            }
            
            console.log('\n' + '='.repeat(60) + '\n');
            
            // Aguardar entre requests
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            console.error(`❌ Erro no teste ${i + 1}:`, error.message);
            
            if (error.cause) {
                console.log('📝 Detalhes do erro:');
                error.cause.forEach(cause => {
                    console.log(`  - ${cause.description} (Code: ${cause.code})`);
                });
            }
            
            console.log('\n' + '='.repeat(60) + '\n');
        }
    }
    
    console.log('📊 Análise:');
    console.log('Se todos os Payment IDs são iguais:');
    console.log('🔹 Problema na configuração do MercadoPago');
    console.log('🔹 Possível cache ou reutilização');
    console.log('🔹 Conta pode estar limitada');
    
    console.log('\nSe Payment IDs são diferentes:');
    console.log('🔹 Criação funcionando corretamente');
    console.log('🔹 Problema pode estar no frontend/cache');
    
    console.log('\nSe valores estão errados:');
    console.log('🔹 Problema na API ou configuração');
    console.log('🔹 Verificar se está usando endpoint correto');
}

debugPaymentCreation();