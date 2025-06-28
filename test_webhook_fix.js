require('dotenv').config();
const { payment } = require('./src/config/mercadopago');

async function testWebhookFix() {
    console.log('🧪 Testando webhook fix...\n');
    
    // Simular como o paymentController agora constrói a URL
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const webhookUrl = `${baseUrl}/api/webhook/mercadopago`;
    
    console.log('🔗 Webhook URL que será usado:', webhookUrl);
    
    if (webhookUrl.includes('localhost')) {
        console.log('⚠️  Ainda usando localhost - MercadoPago não conseguirá acessar');
        console.log('💡 Para resolver: configure BASE_URL no .env com domínio público');
        return;
    }
    
    console.log('✅ Usando URL pública - MercadoPago conseguirá acessar');
    
    try {
        // Criar pagamento de teste com webhook URL corrigido
        const testPayment = {
            transaction_amount: 1.00,
            description: 'Teste Webhook Fix',
            payment_method_id: 'pix',
            external_reference: 'webhook-test-' + Date.now(),
            notification_url: webhookUrl,
            payer: {
                email: 'teste@webhook.com',
                first_name: 'Teste',
                last_name: 'Webhook'
            }
        };

        const result = await payment.create({ body: testPayment });
        
        if (result && result.id) {
            console.log('\n✅ Pagamento criado com sucesso!');
            console.log(`📊 Payment ID: ${result.id}`);
            console.log(`📊 Status: ${result.status}`);
            console.log(`🔗 Webhook URL configurado: ${webhookUrl}`);
            
            if (result.point_of_interaction?.transaction_data?.qr_code) {
                console.log('✅ QR Code PIX gerado');
                console.log('\n🎯 TESTE CONCLUÍDO:');
                console.log('1. ✅ PIX gerado com URL pública de webhook');
                console.log('2. ✅ MercadoPago poderá notificar pagamentos');
                console.log('3. ✅ Sistema deve funcionar em produção');
            }
        }
    } catch (error) {
        console.error('❌ Erro no teste:', error.message);
    }
}

testWebhookFix();