require('dotenv').config();

console.log('🔍 Verificando configuração de Webhook URL...\n');

// Simular como o paymentController constrói a URL
function buildWebhookUrl(useProduction = false) {
    if (useProduction) {
        // Usar BASE_URL do .env para produção
        const baseUrl = process.env.BASE_URL;
        return `${baseUrl}/api/webhook/mercadopago`;
    } else {
        // Desenvolvimento (localhost)
        return 'http://localhost:3000/api/webhook/mercadopago';
    }
}

const devWebhook = buildWebhookUrl(false);
const prodWebhook = buildWebhookUrl(true);

console.log('🏠 Webhook Desenvolvimento:', devWebhook);
console.log('🌐 Webhook Produção:', prodWebhook);
console.log('');

if (devWebhook.includes('localhost')) {
    console.log('⚠️  PROBLEMA IDENTIFICADO:');
    console.log('❌ URL localhost não é acessível pelo MercadoPago');
    console.log('💡 MercadoPago precisa de URL pública para enviar notificações');
    console.log('');
    console.log('🔧 SOLUÇÕES:');
    console.log('1. 🚀 Deploy em servidor com domínio público');
    console.log('2. 🔗 Use ngrok para expor localhost publicamente');
    console.log('3. ⚙️  Configure webhook fixo com BASE_URL');
    console.log('');
    console.log('📝 Para usar BASE_URL do .env:');
    console.log(`   const webhookUrl = '${prodWebhook}';`);
} else {
    console.log('✅ Webhook URL parece estar configurado corretamente');
}

console.log('\n📊 Status Atual:');
console.log(`BASE_URL: ${process.env.BASE_URL || 'Não configurado'}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'Não configurado'}`);