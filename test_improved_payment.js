require('dotenv').config();
const { payment } = require('./src/config/mercadopago');

async function testImprovedPayment() {
    console.log('🧪 Testando PIX melhorado com documentação mais recente...\n');
    
    const mac_address = '00:11:22:33:44:55';
    const cleanMac = mac_address.replace(/[:-]/g, '');
    const payerEmail = `cliente.${cleanMac.slice(-6)}@hotspot.com`;
    
    // Estrutura baseada na documentação mais recente do MercadoPago
    const paymentData = {
        transaction_amount: 5.00, // Valor maior para evitar aprovação automática
        description: '5 Megas - 30 dias - Hotspot',
        payment_method_id: 'pix',
        external_reference: 'test-improved-' + Date.now(),
        notification_url: 'https://api.mikropix.online/api/webhook/mercadopago',
        
        // Dados do pagador melhorados
        payer: {
            email: payerEmail,
            first_name: 'Cliente',
            last_name: 'Hotspot',
            identification: {
                type: 'CPF',
                number: '11122233344' // CPF fictício válido para teste
            },
            address: {
                zip_code: '01310100',
                street_name: 'Avenida Paulista',
                street_number: 1000,
                neighborhood: 'Bela Vista',
                city: 'São Paulo',
                federal_unit: 'SP'
            }
        },
        
        // Metadados para tracking
        metadata: {
            mac_address: mac_address,
            tipo_servico: 'hotspot',
            provedor: 'MikroPix',
            sessao_id: cleanMac
        },
        
        // Configurações PIX específicas
        date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutos
        
        // Configurações adicionais recomendadas
        statement_descriptor: 'MIKROPIX HOTSPOT',
        
        // Configuração de captura automática
        capture: true,
        
        // Configurações de callback
        callback_url: 'https://api.mikropix.online/api/webhook/mercadopago'
    };
    
    try {
        console.log('📤 Criando PIX com estrutura melhorada...');
        console.log('📧 Email gerado:', payerEmail);
        console.log('💰 Valor:', paymentData.transaction_amount);
        console.log('⏰ Expira em:', new Date(paymentData.date_of_expiration).toLocaleString('pt-BR'));
        
        const result = await payment.create({ body: paymentData });
        
        console.log('\n✅ PIX criado com sucesso!');
        console.log(`📊 Payment ID: ${result.id}`);
        console.log(`📊 Status: ${result.status}`);
        console.log(`📊 Status Detail: ${result.status_detail}`);
        console.log(`🎯 Live Mode: ${result.live_mode}`);
        console.log(`💰 Valor: R$ ${result.transaction_amount}`);
        console.log(`⏰ Expira em: ${new Date(result.date_of_expiration).toLocaleString('pt-BR')}`);
        
        if (result.point_of_interaction?.transaction_data) {
            const pixData = result.point_of_interaction.transaction_data;
            console.log('\n💳 PIX Dados:');
            console.log(`📱 QR Code disponível: ${!!pixData.qr_code}`);
            console.log(`🖼️ QR Code Base64 disponível: ${!!pixData.qr_code_base64}`);
            console.log(`📋 Tamanho do código: ${pixData.qr_code?.length || 0} chars`);
            
            if (pixData.qr_code) {
                console.log('\n📋 Código PIX para teste:');
                console.log('=' .repeat(50));
                console.log(pixData.qr_code);
                console.log('=' .repeat(50));
                
                // Analisar componentes do PIX
                if (pixData.qr_code.includes('br.gov.bcb.pix')) {
                    console.log('✅ Contém chave PIX padrão do Banco Central');
                }
                if (pixData.qr_code.startsWith('00020126')) {
                    console.log('✅ Formato EMVCo válido');
                }
            }
        }
        
        // Verificar se ainda está sendo aprovado automaticamente
        if (result.status === 'approved') {
            console.log('\n⚠️ ATENÇÃO: Pagamento aprovado automaticamente');
            console.log('💡 Isso pode indicar ambiente de teste');
            console.log('🔧 Em produção real, deve ficar "pending" até o pagamento');
        } else if (result.status === 'pending') {
            console.log('\n✅ Status "pending" - Comportamento correto');
            console.log('💳 PIX aguardando pagamento real');
        }
        
        // Testar consulta imediata
        console.log('\n🔍 Consultando pagamento criado...');
        const consulta = await payment.get({ id: result.id });
        console.log(`📊 Status na consulta: ${consulta.status}`);
        console.log(`📊 Processamento: ${consulta.processing_mode}`);
        
        return result;
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        
        if (error.cause) {
            console.log('\n📝 Detalhes do erro:');
            error.cause.forEach((cause, index) => {
                console.log(`${index + 1}. ${cause.description} (Code: ${cause.code})`);
            });
        }
        
        if (error.status) {
            console.log(`📊 Status HTTP: ${error.status}`);
        }
    }
}

testImprovedPayment();