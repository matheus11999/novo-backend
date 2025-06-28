require('dotenv').config();
const { payment } = require('./src/config/mercadopago');

async function testFixedWebhook() {
    console.log('🧪 Testando PIX com webhook fixo de produção...\n');
    
    const webhookUrl = 'https://api.mikropix.online/api/webhook/mercadopago';
    console.log('🔗 Webhook URL fixo:', webhookUrl);
    
    const paymentData = {
        transaction_amount: 2.50,
        description: 'Teste webhook fixo produção',
        payment_method_id: 'pix',
        external_reference: 'test-fixed-' + Date.now(),
        notification_url: webhookUrl,
        payer: {
            email: 'teste@producao.com',
            first_name: 'Teste',
            last_name: 'Producao'
        }
    };
    
    try {
        console.log('📤 Criando PIX com webhook fixo...');
        const result = await payment.create({ body: paymentData });
        
        if (result && result.id) {
            console.log('✅ PIX criado com sucesso!');
            console.log(`📊 Payment ID: ${result.id}`);
            console.log(`📊 External Reference: ${result.external_reference}`);
            console.log(`📊 Status: ${result.status}`);
            console.log(`🔗 Webhook configurado: ${webhookUrl}`);
            
            if (result.point_of_interaction?.transaction_data?.qr_code) {
                console.log('✅ QR Code PIX disponível');
                console.log('\n🎯 SUCESSO:');
                console.log('✅ PIX criado sem erros de webhook');
                console.log('✅ URL de produção configurada corretamente');
                console.log('✅ Sistema pronto para receber pagamentos reais');
            }
        }
    } catch (error) {
        console.error('❌ Erro na criação:', error.message);
        if (error.cause) {
            console.log('📝 Detalhes do erro:', JSON.stringify(error.cause, null, 2));
        }
    }
}

testFixedWebhook();