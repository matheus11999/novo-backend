// Verificar configuração do MercadoPago
require('dotenv').config();
const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

console.log('🔍 Verificando configuração do MercadoPago...\n');

if (!accessToken) {
    console.log('❌ MERCADOPAGO_ACCESS_TOKEN não encontrado!');
    process.exit(1);
}

console.log('✅ Token encontrado:');
console.log(`📝 Tamanho: ${accessToken.length} caracteres`);
console.log(`🔧 Prefixo: ${accessToken.substring(0, 20)}...`);

// Verificar tipo de token
if (accessToken.startsWith('APP_USR-')) {
    console.log('✅ Tipo: Access Token de Produção');
    console.log('🎯 Status: PRODUÇÃO - Pagamentos reais');
} else if (accessToken.startsWith('TEST-')) {
    console.log('⚠️ Tipo: Access Token de Teste');
    console.log('🧪 Status: SANDBOX - Apenas para testes');
    console.log('\n❗ ATENÇÃO: Para aceitar pagamentos reais, use o token de PRODUÇÃO!');
} else {
    console.log('❓ Tipo: Formato não reconhecido');
}

console.log('\n📊 Para verificar se está funcionando:');
console.log('1. 💳 Teste fazer um pagamento PIX');
console.log('2. 📱 Use um app bancário real');
console.log('3. 👀 Observe os logs para ver se webhook chegou');

console.log('\n🔧 Se não funcionar:');
console.log('1. ✅ Verifique se token é de PRODUÇÃO (APP_USR-)');
console.log('2. ✅ Confirme que aplicação MercadoPago está ativa');
console.log('3. ✅ Verifique se webhook URL está acessível');
console.log('4. ✅ Teste em ambiente real (não localhost)');

// Tentar fazer uma verificação básica
console.log('\n🧪 Testando conexão com MercadoPago...');

const { payment } = require('./src/config/mercadopago');

async function testConnection() {
    try {
        // Tentar criar um pagamento de teste muito baixo
        const testPayment = {
            transaction_amount: 0.01,
            description: 'Teste de conexão',
            payment_method_id: 'pix',
            external_reference: 'test-' + Date.now(),
            payer: {
                email: 'teste@exemplo.com',
                first_name: 'Teste',
                last_name: 'Conexao'
            }
        };

        const result = await payment.create({ body: testPayment });
        
        if (result && result.id) {
            console.log('✅ Conexão com MercadoPago funcionando!');
            console.log(`📊 Payment ID: ${result.id}`);
            console.log(`📊 Status: ${result.status}`);
            
            if (result.point_of_interaction?.transaction_data?.qr_code) {
                console.log('✅ QR Code PIX gerado com sucesso!');
                console.log('🎯 O sistema está configurado corretamente');
            } else {
                console.log('❌ QR Code PIX não foi gerado');
                console.log('⚠️ Pode ser problema com token ou configuração');
            }
        } else {
            console.log('❌ Falha na criação do pagamento teste');
        }
    } catch (error) {
        console.error('❌ Erro na conexão:', error.message);
        
        if (error.message.includes('unauthorized')) {
            console.log('🚨 Token de acesso inválido ou expirado');
        } else if (error.message.includes('forbidden')) {
            console.log('🚨 Token não tem permissões necessárias');
        } else if (error.message.includes('not found')) {
            console.log('🚨 Endpoint não encontrado - verifique configuração');
        }
    }
}

testConnection();