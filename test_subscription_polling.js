// Teste do serviço de subscription polling
require('dotenv').config();
const subscriptionPaymentService = require('./src/services/subscriptionPaymentService');
const { supabase } = require('./src/config/database');

async function testSubscriptionPolling() {
    console.log('🧪 Testando serviço de subscription polling...\n');
    
    try {
        // 1. Verificar status inicial
        console.log('1. Status inicial do serviço:');
        console.log(subscriptionPaymentService.getStatus());
        console.log('');
        
        // 2. Verificar pagamentos pendentes
        console.log('2. Verificando pagamentos pendentes no banco...');
        const { data: pendingPayments, error } = await supabase
            .from('subscription_payments')
            .select(`
                *,
                subscription_plans (name, price)
            `)
            .eq('status', 'pending')
            .gt('expires_at', new Date().toISOString());
            
        if (error) {
            console.error('Erro ao buscar pagamentos:', error);
        } else {
            console.log(`Encontrados ${pendingPayments?.length || 0} pagamentos pendentes:`);
            pendingPayments?.forEach(payment => {
                console.log(`- ${payment.payment_id}: ${payment.subscription_plans?.name} (R$ ${payment.amount})`);
            });
        }
        console.log('');
        
        // 3. Iniciar serviço
        console.log('3. Iniciando serviço de polling...');
        subscriptionPaymentService.start();
        
        // 4. Aguardar um pouco para ver o polling em ação
        console.log('4. Aguardando 10 segundos para verificar o polling...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // 5. Verificar status após iniciar
        console.log('5. Status após iniciar:');
        console.log(subscriptionPaymentService.getStatus());
        console.log('');
        
        // 6. Parar serviço
        console.log('6. Parando serviço...');
        subscriptionPaymentService.stop();
        
        // 7. Verificar status final
        console.log('7. Status final:');
        console.log(subscriptionPaymentService.getStatus());
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
    }
}

async function runTests() {
    console.log('🚀 Iniciando testes do serviço de subscription polling...\n');
    
    await testSubscriptionPolling();
    
    console.log('\n🏁 Todos os testes concluídos!');
    process.exit(0);
}

// Executar se chamado diretamente
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = { testSubscriptionPolling }; 