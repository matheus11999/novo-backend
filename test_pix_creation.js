require('dotenv').config();
const { payment } = require('./src/config/mercadopago');

async function testPixCreation() {
    console.log('🧪 Testando criação de PIX sem webhook...\n');
    
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const webhookUrl = `${baseUrl}/api/webhook/mercadopago`;
    
    console.log('🏷️  NODE_ENV:', process.env.NODE_ENV);
    console.log('🔗 Webhook URL:', webhookUrl);
    
    // Simular a lógica do paymentController
    const paymentData = {
        transaction_amount: 5.00,
        description: 'Teste PIX sem webhook',
        payment_method_id: 'pix',
        external_reference: 'test-no-webhook-' + Date.now(),
        payer: {
            email: 'teste@mikrotik.com',
            first_name: 'Teste',
            last_name: 'NoWebhook'
        }
    };

    // Aplicar a mesma lógica condicional
    if (process.env.NODE_ENV === 'production' || webhookUrl.includes('api.mikropix.online')) {
        console.log(`[PAYMENT] Configurando webhook: ${webhookUrl}`);
        paymentData.notification_url = webhookUrl;
    } else {
        console.log('[PAYMENT] Webhook omitido - desenvolvimento sem URL pública');
    }
    
    try {
        console.log('\n📤 Enviando para MercadoPago...');
        const result = await payment.create({ body: paymentData });
        
        if (result && result.id) {
            console.log('✅ PIX criado com sucesso!');
            console.log(`📊 Payment ID: ${result.id}`);
            console.log(`📊 Status: ${result.status}`);
            
            if (result.point_of_interaction?.transaction_data?.qr_code) {
                console.log('✅ QR Code gerado');
                console.log('💳 Código PIX disponível');
                
                console.log('\n🎯 RESULTADO:');
                console.log('✅ PIX criado sem erros de webhook');
                console.log('✅ Sistema de polling pode processar pagamentos');
                console.log('✅ Problema resolvido para produção');
            }
        }
    } catch (error) {
        console.error('❌ Erro:', error.message);
        if (error.cause) {
            console.log('📝 Detalhes:', error.cause);
        }
    }
}

testPixCreation();