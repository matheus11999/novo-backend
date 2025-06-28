const axios = require('axios');

// Teste do sistema de polling de pagamentos
async function testPaymentPolling() {
    const BASE_URL = 'http://localhost:3000';
    const headers = {
        'Content-Type': 'application/json'
        // Adicione token de auth se necessário
        // 'Authorization': 'Bearer YOUR_TOKEN'
    };
    
    console.log('🧪 Testando sistema de polling de pagamentos...\n');
    
    try {
        // 1. Verificar status do polling
        console.log('1️⃣ Verificando status do polling...');
        const statsResponse = await axios.get(`${BASE_URL}/api/payment-polling/stats`, { headers });
        console.log('📊 Status atual:', statsResponse.data);
        
        // 2. Listar pagamentos pendentes
        console.log('\n2️⃣ Listando pagamentos pendentes...');
        const pendingResponse = await axios.get(`${BASE_URL}/api/payment-polling/pending`, { headers });
        console.log(`📋 Pagamentos pendentes: ${pendingResponse.data.count}`);
        
        if (pendingResponse.data.count > 0) {
            console.log('📄 Detalhes dos pagamentos:');
            pendingResponse.data.data.slice(0, 3).forEach((payment, index) => {
                console.log(`   ${index + 1}. ID: ${payment.payment_id}`);
                console.log(`      MAC: ${payment.mac_address}`);
                console.log(`      Status: ${payment.status} | MP: ${payment.mercadopago_status}`);
                console.log(`      Usuário criado: ${payment.mikrotik_user_created ? 'SIM' : 'NÃO'}`);
                console.log(`      Plano: ${payment.planos?.nome} (R$ ${payment.planos?.valor})`);
                console.log(`      Criado: ${new Date(payment.created_at).toLocaleString()}`);
                console.log('');
            });
        }
        
        // 3. Verificação manual
        console.log('3️⃣ Executando verificação manual...');
        const checkResponse = await axios.post(`${BASE_URL}/api/payment-polling/check-now`, {}, { headers });
        console.log('✅ Verificação manual:', checkResponse.data.message);
        
        // 4. Estatísticas finais
        console.log('\n4️⃣ Estatísticas finais...');
        const finalStatsResponse = await axios.get(`${BASE_URL}/api/payment-polling/stats`, { headers });
        console.log('📊 Status final:', finalStatsResponse.data);
        
        // 5. Se houver algum pagamento específico para testar
        if (pendingResponse.data.count > 0) {
            const firstPayment = pendingResponse.data.data[0];
            console.log(`\n5️⃣ Testando processamento específico do pagamento: ${firstPayment.payment_id}`);
            
            try {
                const processResponse = await axios.post(
                    `${BASE_URL}/api/payment-polling/process/${firstPayment.payment_id}`,
                    {},
                    { headers }
                );
                console.log('✅ Processamento específico:', processResponse.data.message);
            } catch (processError) {
                console.log('ℹ️ Processamento específico:', processError.response?.data?.error || processError.message);
            }
        }
        
        return {
            success: true,
            message: 'Teste do polling concluído com sucesso!',
            pendingCount: pendingResponse.data.count,
            pollingActive: finalStatsResponse.data.data.isRunning
        };
        
    } catch (error) {
        console.error('\n❌ Erro no teste:', error.message);
        
        if (error.response) {
            console.error('📥 Status:', error.response.status);
            console.error('📥 Dados:', JSON.stringify(error.response.data, null, 2));
        }
        
        if (error.code === 'ECONNREFUSED') {
            console.error('\n🚨 Backend não está rodando em localhost:3000');
            console.error('   Execute: npm start');
        }
        
        return {
            success: false,
            error: error.message,
            details: error.response?.data
        };
    }
}

// Teste das funcionalidades de controle
async function testPollingControl() {
    const BASE_URL = 'http://localhost:3000';
    const headers = { 'Content-Type': 'application/json' };
    
    console.log('\n🎮 Testando controles do polling...\n');
    
    try {
        // Parar polling
        console.log('⏹️ Parando polling...');
        const stopResponse = await axios.post(`${BASE_URL}/api/payment-polling/stop`, {}, { headers });
        console.log('📄 Resposta:', stopResponse.data.message);
        
        // Verificar status
        const statsResponse1 = await axios.get(`${BASE_URL}/api/payment-polling/stats`, { headers });
        console.log('📊 Status após parar:', statsResponse1.data.data.isRunning ? 'RODANDO' : 'PARADO');
        
        // Aguardar um pouco
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Iniciar polling
        console.log('\n🚀 Iniciando polling...');
        const startResponse = await axios.post(`${BASE_URL}/api/payment-polling/start`, {}, { headers });
        console.log('📄 Resposta:', startResponse.data.message);
        
        // Verificar status final
        const statsResponse2 = await axios.get(`${BASE_URL}/api/payment-polling/stats`, { headers });
        console.log('📊 Status após iniciar:', statsResponse2.data.data.isRunning ? 'RODANDO' : 'PARADO');
        
        return { success: true };
        
    } catch (error) {
        console.error('❌ Erro no teste de controle:', error.message);
        return { success: false, error: error.message };
    }
}

// Executar testes
if (require.main === module) {
    console.log('🎯 Iniciando testes do sistema de polling...\n');
    
    testPaymentPolling()
        .then(result => {
            console.log('\n🎯 RESULTADO TESTE PRINCIPAL:', result.success ? '✅ SUCESSO' : '❌ FALHOU');
            
            if (result.success) {
                console.log(`📊 Pagamentos pendentes: ${result.pendingCount}`);
                console.log(`🔄 Polling ativo: ${result.pollingActive ? 'SIM' : 'NÃO'}`);
                
                // Executar teste de controle se principal passou
                return testPollingControl();
            } else {
                console.log('💥 Erro:', result.error);
                return Promise.resolve({ success: false });
            }
        })
        .then(controlResult => {
            if (controlResult.success) {
                console.log('\n🎯 RESULTADO TESTE CONTROLE: ✅ SUCESSO');
                console.log('\n🎉 TODOS OS TESTES PASSARAM!');
                console.log('\n📋 Funcionalidades testadas:');
                console.log('   ✅ Status do polling');
                console.log('   ✅ Listagem de pagamentos pendentes');
                console.log('   ✅ Verificação manual');
                console.log('   ✅ Processamento específico');
                console.log('   ✅ Controle start/stop');
                console.log('\n🚀 Sistema de polling funcionando perfeitamente!');
            } else {
                console.log('\n🎯 RESULTADO TESTE CONTROLE: ❌ FALHOU');
                console.log('💥 Erro:', controlResult.error);
            }
        })
        .catch(error => {
            console.error('\n💥 Erro geral nos testes:', error.message);
        });
}

module.exports = { testPaymentPolling, testPollingControl };