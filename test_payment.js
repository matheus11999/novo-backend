const { MercadoPagoConfig, Payment } = require('mercadopago');
const qrcode = require('qrcode-terminal');

// Configuração do MercadoPago com seu access token
const client = new MercadoPagoConfig({
    accessToken: 'APP_USR-2026232472056959-021718-2bb63f293c82d5b446e5ce4989018ce7-2069764248',
    options: {
        timeout: 5000
    }
});

const payment = new Payment(client);

async function testPixPayment() {
    try {
        console.log('🚀 Iniciando teste de pagamento PIX...\n');

        // Dados do pagamento
        const paymentData = {
            transaction_amount: 0.10, // R$ 0,10
            description: 'Teste PIX - R$ 0,10',
            payment_method_id: 'pix',
            external_reference: `test_${Date.now()}`,
            payer: {
                email: 'teste@exemplo.com',
                first_name: 'Cliente',
                last_name: 'Teste'
            }
        };

        console.log('📄 Dados do pagamento:');
        console.log(JSON.stringify(paymentData, null, 2));
        console.log('\n⏳ Criando pagamento...\n');

        // Criar pagamento
        const mpPayment = await payment.create({ body: paymentData });

        if (!mpPayment || !mpPayment.id) {
            throw new Error('Falha ao criar pagamento no MercadoPago');
        }

        console.log('✅ Pagamento criado com sucesso!');
        console.log(`💳 ID do Pagamento: ${mpPayment.id}`);
        console.log(`📊 Status: ${mpPayment.status}`);
        console.log(`💰 Valor: R$ ${mpPayment.transaction_amount}`);
        console.log(`📅 Criado em: ${mpPayment.date_created}`);
        
        // Verificar se temos os dados PIX
        const pixData = mpPayment.point_of_interaction?.transaction_data;
        
        if (pixData?.qr_code) {
            console.log('\n🔗 Código PIX (copia e cola):');
            console.log(pixData.qr_code);
            
            console.log('\n📱 QR Code:');
            // Gerar QR Code no terminal
            qrcode.generate(pixData.qr_code, { small: true });
            
            console.log('\n📋 Instruções:');
            console.log('1. Abra seu app do banco');
            console.log('2. Escaneie o QR Code acima OU');
            console.log('3. Copie o código PIX e cole no seu app');
            console.log('4. Confirme o pagamento de R$ 0,10');
            
            // Monitorar status do pagamento
            console.log('\n🔄 Monitorando status do pagamento...');
            console.log('Pressione Ctrl+C para parar\n');
            
            const checkInterval = setInterval(async () => {
                try {
                    const updatedPayment = await payment.get({ id: mpPayment.id });
                    console.log(`[${new Date().toLocaleTimeString()}] Status: ${updatedPayment.status}`);
                    
                    if (updatedPayment.status === 'approved') {
                        console.log('\n🎉 PAGAMENTO APROVADO!');
                        console.log(`💸 Pago em: ${updatedPayment.date_approved}`);
                        console.log(`🏦 Método: ${updatedPayment.payment_method_id}`);
                        clearInterval(checkInterval);
                        process.exit(0);
                    } else if (updatedPayment.status === 'cancelled' || updatedPayment.status === 'rejected') {
                        console.log(`\n❌ Pagamento ${updatedPayment.status.toUpperCase()}`);
                        clearInterval(checkInterval);
                        process.exit(1);
                    }
                } catch (error) {
                    console.error('Erro ao verificar status:', error.message);
                }
            }, 5000); // Verifica a cada 5 segundos
            
        } else {
            console.log('\n❌ Erro: Dados PIX não foram gerados');
            console.log('Resposta completa:');
            console.log(JSON.stringify(mpPayment, null, 2));
        }

    } catch (error) {
        console.error('\n❌ Erro no teste:', error.message);
        
        if (error.cause) {
            console.error('Detalhes:', error.cause);
        }
        
        if (error.body) {
            console.error('Resposta da API:', JSON.stringify(error.body, null, 2));
        }
        
        process.exit(1);
    }
}

// Executar teste
testPixPayment();