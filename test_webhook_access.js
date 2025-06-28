require('dotenv').config();
const axios = require('axios');

async function testWebhookAccess() {
    console.log('🔍 Testando acessibilidade do webhook...\n');
    
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const webhookUrl = `${baseUrl}/api/webhook/mercadopago`;
    
    console.log('🌐 Testando URL:', webhookUrl);
    console.log('🏷️  NODE_ENV:', process.env.NODE_ENV);
    
    try {
        // Testar se o endpoint existe
        const response = await axios.get(webhookUrl, {
            timeout: 5000,
            validateStatus: () => true // Aceitar qualquer status
        });
        
        console.log(`📊 Status: ${response.status}`);
        console.log(`📝 Response: ${response.data || 'Sem dados'}`);
        
        if (response.status === 200 || response.status === 405) {
            console.log('✅ Webhook está acessível');
            return true;
        } else {
            console.log(`⚠️  Webhook retornou status ${response.status}`);
            return false;
        }
    } catch (error) {
        console.error('❌ Erro ao acessar webhook:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('🚨 Servidor não está rodando ou não acessível');
        } else if (error.code === 'ENOTFOUND') {
            console.log('🚨 Domínio não encontrado');
        } else {
            console.log('🚨 Erro de conectividade');
        }
        return false;
    }
}

testWebhookAccess().then(accessible => {
    console.log(`\n🎯 Resultado: Webhook ${accessible ? 'ACESSÍVEL' : 'NÃO ACESSÍVEL'}`);
    
    if (accessible) {
        console.log('✅ MercadoPago deve conseguir enviar notificações');
    } else {
        console.log('❌ MercadoPago não conseguirá enviar notificações');
        console.log('💡 Considere usar sistema de polling como backup');
    }
});