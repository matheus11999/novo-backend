require('dotenv').config();
const { payment } = require('./src/config/mercadopago');

async function testRealPaymentValues() {
    console.log('🧪 Testando diferentes valores para pagamento real...\n');
    
    const testValues = [
        { value: 0.01, description: '1 centavo - teste mínimo' },
        { value: 1.00, description: '1 real - valor baixo' },
        { value: 5.00, description: '5 reais - valor médio' },
        { value: 10.00, description: '10 reais - valor normal' },
        { value: 25.00, description: '25 reais - valor alto' }
    ];
    
    for (const test of testValues) {
        try {
            console.log(`\n💰 ${test.description} (R$ ${test.value})`);
            
            const paymentData = {
                transaction_amount: test.value,
                description: `Teste ${test.description}`,
                payment_method_id: 'pix',
                external_reference: `test-${test.value.toString().replace('.', '_')}-${Date.now()}`,
                payer: {
                    email: `teste${test.value.toString().replace('.', '_')}@hotspot.com`,
                    first_name: 'Teste',
                    last_name: 'Valor',
                    identification: {
                        type: 'CPF',
                        number: '11122233344'
                    }
                }
            };
            
            const result = await payment.create({ body: paymentData });
            
            console.log(`📊 Payment ID: ${result.id}`);
            console.log(`📊 Status: ${result.status}`);
            console.log(`📊 Status Detail: ${result.status_detail}`);
            console.log(`🎯 Live Mode: ${result.live_mode}`);
            console.log(`💰 Valor processado: R$ ${result.transaction_amount}`);
            
            if (result.status === 'approved') {
                console.log('⚠️ APROVADO AUTOMATICAMENTE');
                
                // Tentar entender por que foi aprovado
                if (result.status_detail === 'accredited') {
                    console.log('💡 Creditado automaticamente - pode ser comportamento de teste');
                }
            } else if (result.status === 'pending') {
                console.log('✅ PENDENTE - Comportamento esperado');
                console.log(`⏱️ Aguardando pagamento via PIX`);
            } else {
                console.log(`ℹ️ Status diferente: ${result.status}`);
            }
            
            // Verificar dados PIX
            if (result.point_of_interaction?.transaction_data?.qr_code) {
                const qrCode = result.point_of_interaction.transaction_data.qr_code;
                console.log(`📱 QR Code gerado (${qrCode.length} chars)`);
                
                // Verificar se QR code contém valor correto
                if (qrCode.includes(test.value.toFixed(2).replace('.', ''))) {
                    console.log('✅ Valor correto no QR Code');
                } else {
                    console.log('⚠️ Valor pode estar diferente no QR Code');
                }
            }
            
            // Aguardar entre testes
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            console.error(`❌ Erro para R$ ${test.value}:`, error.message);
            
            if (error.cause) {
                error.cause.forEach(cause => {
                    console.log(`  - ${cause.description} (${cause.code})`);
                });
            }
        }
    }
    
    console.log('\n📊 Resumo:');
    console.log('Se TODOS os valores são aprovados automaticamente:');
    console.log('🔹 Conta pode estar em modo de teste/desenvolvimento');
    console.log('🔹 Configuração específica da conta MercadoPago');
    console.log('🔹 Aplicação pode ter configuração especial');
    
    console.log('\nSe apenas valores BAIXOS são aprovados:');
    console.log('🔹 Limite de aprovação automática para facilitar testes');
    console.log('🔹 Comportamento normal em desenvolvimento');
    
    console.log('\nSe NENHUM é aprovado automaticamente:');
    console.log('🔹 Configuração correta para produção');
    console.log('🔹 PIX deve ser pago via app bancário');
}

testRealPaymentValues();