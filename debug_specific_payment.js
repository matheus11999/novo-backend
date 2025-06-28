require('dotenv').config();
const { supabase } = require('./src/config/database');
const { payment } = require('./src/config/mercadopago');

async function debugSpecificPayment() {
    console.log('🔍 Investigando pagamento específico...\n');
    
    const paymentId = '404d7569-ddaf-405c-9c3a-c0f5a5e6b528';
    
    try {
        // Buscar dados do pagamento no banco
        const { data: venda, error } = await supabase
            .from('vendas')
            .select('*')
            .eq('payment_id', paymentId)
            .single();

        if (error) {
            console.error('❌ Erro ao buscar venda:', error.message);
            return;
        }

        console.log('📊 Dados da venda:');
        console.log(`- Payment ID: ${venda.payment_id}`);
        console.log(`- MercadoPago ID: ${venda.mercadopago_payment_id}`);
        console.log(`- Status: ${venda.status}`);
        console.log(`- MercadoPago Status: ${venda.mercadopago_status}`);
        console.log(`- Criado em: ${venda.created_at}`);
        console.log(`- MAC: ${venda.mac_address}`);
        
        if (venda.mercadopago_payment_id) {
            console.log('\n🔍 Consultando MercadoPago...');
            
            try {
                const mpResponse = await payment.get({ id: venda.mercadopago_payment_id });
                console.log('✅ Resposta MercadoPago:');
                console.log(`- ID: ${mpResponse.id}`);
                console.log(`- Status: ${mpResponse.status}`);
                console.log(`- Status Detail: ${mpResponse.status_detail}`);
                console.log(`- External Reference: ${mpResponse.external_reference}`);
                
                if (mpResponse.status !== venda.mercadopago_status) {
                    console.log(`⚠️ Status divergente: DB=${venda.mercadopago_status}, MP=${mpResponse.status}`);
                }
            } catch (mpError) {
                console.error('❌ Erro ao consultar MercadoPago:', mpError.message);
                
                if (mpError.message.includes('not found') || mpError.status === 404) {
                    console.log('💡 Pagamento não encontrado no MercadoPago - pode ter expirado');
                    console.log('🧹 Recomendação: Marcar como "not_found" no polling');
                } else {
                    console.log('📝 Erro detalhado:', mpError);
                }
            }
        } else {
            console.log('⚠️ Sem MercadoPago Payment ID');
        }
        
    } catch (error) {
        console.error('❌ Erro geral:', error.message);
    }
}

debugSpecificPayment();