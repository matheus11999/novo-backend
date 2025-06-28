require('dotenv').config();
const { supabase } = require('./src/config/database');
const { payment } = require('./src/config/mercadopago');

async function debugPollingError() {
    console.log('🔍 Investigando erros no polling...\n');
    
    try {
        // Buscar vendas pendentes
        const { data: vendas, error } = await supabase
            .from('vendas')
            .select('payment_id, mercadopago_payment_id, status, mercadopago_status, created_at')
            .or('status.eq.pending,and(status.eq.completed,mikrotik_user_created.eq.false)')
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Erro ao buscar vendas:', error.message);
            return;
        }

        console.log(`📊 Encontradas ${vendas.length} vendas para verificar:`);
        
        for (const venda of vendas) {
            console.log(`\n🔍 Venda: ${venda.payment_id}`);
            console.log(`- MercadoPago ID: ${venda.mercadopago_payment_id}`);
            console.log(`- Status DB: ${venda.status}`);
            console.log(`- Status MP: ${venda.mercadopago_status}`);
            
            if (venda.mercadopago_payment_id) {
                try {
                    console.log('🔍 Consultando MercadoPago...');
                    const mpResponse = await payment.get({ id: venda.mercadopago_payment_id });
                    
                    console.log(`✅ MP Response: ${mpResponse.status} (${mpResponse.status_detail})`);
                    
                    if (mpResponse.status !== venda.mercadopago_status) {
                        console.log(`⚠️ Status divergente! DB: ${venda.mercadopago_status} vs MP: ${mpResponse.status}`);
                    }
                    
                } catch (mpError) {
                    console.error(`❌ Erro MP: ${mpError.message}`);
                    
                    // Analisar tipos de erro específicos
                    if (mpError.status === 404) {
                        console.log('💡 Pagamento não encontrado (404) - pode ter expirado');
                    } else if (mpError.status === 401) {
                        console.log('🚨 Erro de autenticação (401) - problema com token');
                    } else if (mpError.status === 403) {
                        console.log('🚨 Acesso negado (403) - sem permissão');
                    } else if (mpError.message.includes('recursos de la API')) {
                        console.log('🚨 Erro genérico da API - possível rate limit ou token inválido');
                    }
                    
                    console.log('📝 Status HTTP:', mpError.status);
                    console.log('📝 Headers:', mpError.headers || 'N/A');
                }
            }
        }
        
        // Testar se conseguimos fazer uma consulta simples
        console.log('\n🧪 Testando consulta simples ao MercadoPago...');
        try {
            const testPayment = {
                transaction_amount: 0.01,
                description: 'Teste consulta API',
                payment_method_id: 'pix',
                external_reference: 'test-api-' + Date.now(),
                payer: {
                    email: 'test@api.com',
                    first_name: 'Test',
                    last_name: 'API'
                }
            };

            const testResult = await payment.create({ body: testPayment });
            console.log(`✅ Criação OK: ${testResult.id}`);
            
            // Tentar consultar imediatamente
            const consultaResult = await payment.get({ id: testResult.id });
            console.log(`✅ Consulta OK: ${consultaResult.status}`);
            
        } catch (testError) {
            console.error('❌ Erro no teste:', testError.message);
            console.log('📝 Detalhes:', testError.cause || testError.response?.data);
        }
        
    } catch (error) {
        console.error('❌ Erro geral:', error.message);
    }
}

debugPollingError();