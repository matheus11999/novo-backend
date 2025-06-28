require('dotenv').config();
const { payment } = require('./src/config/mercadopago');

async function analyzeMercadoPagoMode() {
    console.log('🔍 Analisando modo do MercadoPago...\n');
    
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    
    console.log('🔑 Access Token Info:');
    console.log(`📝 Tamanho: ${accessToken.length} caracteres`);
    console.log(`🔧 Prefixo: ${accessToken.substring(0, 20)}...`);
    
    if (accessToken.startsWith('APP_USR-')) {
        console.log('✅ Tipo: PRODUÇÃO (APP_USR-)');
        console.log('💰 Aceita pagamentos reais');
    } else if (accessToken.startsWith('TEST-')) {
        console.log('⚠️ Tipo: SANDBOX (TEST-)');
        console.log('🧪 Apenas para testes - não aceita pagamentos reais');
        console.log('❌ PROBLEMA: PIX gerado mas não pode ser pago');
    }
    
    try {
        // Criar pagamento de teste para verificar ambiente
        console.log('\n🧪 Testando criação de PIX...');
        
        const testPayment = {
            transaction_amount: 1.00,
            description: 'Teste de ambiente - ' + new Date().toISOString(),
            payment_method_id: 'pix',
            external_reference: 'env-test-' + Date.now(),
            payer: {
                email: 'test@ambiente.com',
                first_name: 'Teste',
                last_name: 'Ambiente'
            }
        };

        const result = await payment.create({ body: testPayment });
        
        console.log('✅ PIX criado:');
        console.log(`📊 Payment ID: ${result.id}`);
        console.log(`📊 Status: ${result.status}`);
        console.log(`📊 Status Detail: ${result.status_detail}`);
        
        // Analisar o ambiente pelo response
        if (result.live_mode === true) {
            console.log('🎯 AMBIENTE: PRODUÇÃO (live_mode: true)');
            console.log('💳 PIX pode ser pago com dinheiro real');
        } else if (result.live_mode === false) {
            console.log('🧪 AMBIENTE: SANDBOX (live_mode: false)');
            console.log('⚠️ PIX NÃO pode ser pago com dinheiro real');
            console.log('💡 Necessário token de PRODUÇÃO para pagamentos reais');
        }
        
        // Verificar QR Code
        if (result.point_of_interaction?.transaction_data?.qr_code) {
            console.log('✅ QR Code gerado');
            
            const qrCode = result.point_of_interaction.transaction_data.qr_code;
            console.log(`📱 QR Code length: ${qrCode.length}`);
            
            // QR codes de produção vs sandbox têm características diferentes
            if (qrCode.includes('pix.bcb.gov.br') || qrCode.includes('bacen')) {
                console.log('🏦 QR Code aponta para Banco Central (PRODUÇÃO)');
            } else {
                console.log('🧪 QR Code pode ser de teste (SANDBOX)');
            }
        }
        
        // Consultar o pagamento para ver mais detalhes
        console.log('\n🔍 Consultando pagamento criado...');
        const consulta = await payment.get({ id: result.id });
        
        console.log('📊 Dados da consulta:');
        console.log(`- Live Mode: ${consulta.live_mode}`);
        console.log(`- Sandbox: ${consulta.sandbox}`);
        console.log(`- Processing Mode: ${consulta.processing_mode}`);
        console.log(`- API Version: ${consulta.api_version || 'N/A'}`);
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        
        if (error.cause) {
            console.log('📝 Detalhes:', JSON.stringify(error.cause, null, 2));
        }
    }
}

analyzeMercadoPagoMode();