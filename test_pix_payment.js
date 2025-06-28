require('dotenv').config();
const { payment } = require('./src/config/mercadopago');

async function testPixPayment() {
    console.log('🧪 Testando PIX real para pagamento...\n');
    
    try {
        // Criar um PIX com valor baixo para teste real
        const testPayment = {
            transaction_amount: 0.01, // 1 centavo para teste
            description: 'Teste PIX Real - ' + new Date().toISOString(),
            payment_method_id: 'pix',
            external_reference: 'test-real-' + Date.now(),
            notification_url: 'https://api.mikropix.online/api/webhook/mercadopago',
            payer: {
                email: 'teste.real@mikropix.com',
                first_name: 'Teste',
                last_name: 'Real'
            }
        };

        console.log('📤 Criando PIX para teste de pagamento...');
        const result = await payment.create({ body: testPayment });
        
        console.log('✅ PIX criado com sucesso!');
        console.log(`📊 Payment ID: ${result.id}`);
        console.log(`📊 Status: ${result.status}`);
        console.log(`📊 Live Mode: ${result.live_mode}`);
        console.log(`💰 Valor: R$ ${result.transaction_amount}`);
        
        if (result.point_of_interaction?.transaction_data) {
            const pixData = result.point_of_interaction.transaction_data;
            
            console.log('\n💳 Dados PIX:');
            console.log(`📱 QR Code Text Length: ${pixData.qr_code?.length || 0}`);
            console.log(`🖼️ QR Code Base64 Length: ${pixData.qr_code_base64?.length || 0}`);
            
            if (pixData.qr_code) {
                console.log('\n📋 QR Code para copiar e colar:');
                console.log('=' .repeat(50));
                console.log(pixData.qr_code);
                console.log('=' .repeat(50));
                
                // Analisar o conteúdo do QR Code
                if (pixData.qr_code.includes('pix.bcb.gov.br')) {
                    console.log('🏦 ✅ QR Code contém referência ao Banco Central');
                    console.log('💡 Este PIX deve funcionar em apps bancários reais');
                } else if (pixData.qr_code.includes('mercadopago')) {
                    console.log('🏢 ⚠️ QR Code aponta para MercadoPago');
                    console.log('💡 Pode funcionar, mas verifique se não é sandbox');
                } else {
                    console.log('❓ QR Code com formato desconhecido');
                }
                
                // Verificar formato PIX
                if (pixData.qr_code.startsWith('00020126')) {
                    console.log('✅ Formato PIX válido (EMVCo QR Code)');
                } else {
                    console.log('⚠️ Formato pode não ser PIX padrão');
                }
            }
        }
        
        // Tentar consultar o pagamento
        console.log('\n🔍 Consultando pagamento criado...');
        const consulta = await payment.get({ id: result.id });
        
        console.log(`📊 Status na consulta: ${consulta.status}`);
        console.log(`📊 Status Detail: ${consulta.status_detail}`);
        console.log(`📊 Live Mode: ${consulta.live_mode}`);
        
        if (consulta.live_mode === false) {
            console.log('\n🚨 PROBLEMA IDENTIFICADO:');
            console.log('❌ live_mode: false indica ambiente SANDBOX');
            console.log('💡 PIX gerado em sandbox não pode ser pago com dinheiro real');
            console.log('🔧 Verifique configuração da conta MercadoPago');
        } else {
            console.log('\n✅ live_mode: true - ambiente de PRODUÇÃO');
            console.log('💰 PIX deve aceitar pagamentos reais');
        }
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        if (error.cause) {
            console.log('📝 Detalhes:', JSON.stringify(error.cause, null, 2));
        }
    }
}

testPixPayment();