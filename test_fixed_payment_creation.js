require('dotenv').config();
const { payment } = require('./src/config/mercadopago');

async function testFixedPaymentCreation() {
    console.log('🧪 Testando criação de pagamento APÓS correção do idempotencyKey...\n');
    
    const tests = [
        { amount: 2.50, desc: 'Primeiro teste pós-correção' },
        { amount: 7.75, desc: 'Segundo teste pós-correção' },
        { amount: 12.00, desc: 'Terceiro teste pós-correção' }
    ];
    
    for (let i = 0; i < tests.length; i++) {
        const test = tests[i];
        
        try {
            console.log(`📤 Teste ${i + 1}: ${test.desc}`);
            console.log(`💰 Valor: R$ ${test.amount}`);
            
            const uniqueRef = `fixed-test-${i + 1}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            const paymentData = {
                transaction_amount: test.amount,
                description: test.desc,
                payment_method_id: 'pix',
                external_reference: uniqueRef,
                payer: {
                    email: `teste${i + 1}@corrected.com`,
                    first_name: `Teste${i + 1}`,
                    last_name: 'Corrigido',
                    identification: {
                        type: 'CPF',
                        number: `1112223334${i}`
                    }
                }
            };
            
            const result = await payment.create({ body: paymentData });
            
            console.log(`📊 Payment ID: ${result.id}`);
            console.log(`💰 Valor retornado: R$ ${result.transaction_amount}`);
            console.log(`🔗 External Reference: ${result.external_reference}`);
            console.log(`📊 Status: ${result.status}`);
            
            // Verificar se agora os dados estão corretos
            if (result.external_reference === uniqueRef) {
                console.log('✅ External Reference CORRETO!');
            } else {
                console.log('❌ External Reference ainda incorreto');
            }
            
            if (Math.abs(result.transaction_amount - test.amount) < 0.01) {
                console.log('✅ Valor CORRETO!');
            } else {
                console.log('❌ Valor ainda incorreto');
            }
            
            // Verificar se Payment ID é único
            if (i === 0) {
                console.log(`📝 Primeiro Payment ID: ${result.id}`);
            } else {
                console.log(`📝 Payment ID é diferente dos anteriores: ${result.id !== '116690916126' ? 'SIM ✅' : 'NÃO ❌'}`);
            }
            
            console.log('\n' + '-'.repeat(50) + '\n');
            
            // Aguardar entre testes
            await new Promise(resolve => setTimeout(resolve, 3000));
            
        } catch (error) {
            console.error(`❌ Erro no teste ${i + 1}:`, error.message);
            
            if (error.cause) {
                console.log('📝 Detalhes:');
                error.cause.forEach(cause => {
                    console.log(`  - ${cause.description}`);
                });
            }
        }
    }
    
    console.log('🎯 RESULTADO:');
    console.log('Se agora Payment IDs, valores e references estão únicos:');
    console.log('✅ PROBLEMA CORRIGIDO - idempotencyKey era a causa');
    console.log('✅ Pagamentos agora são criados corretamente');
    console.log('✅ PIX pode funcionar normalmente');
    console.log('\nSe ainda há problemas:');
    console.log('❌ Pode haver outras configurações problemáticas');
    console.log('❌ Verificar outras partes do SDK');
}

testFixedPaymentCreation();