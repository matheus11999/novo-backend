require('dotenv').config();
const { supabase } = require('./src/config/database');
const MikroTikUserService = require('./src/services/mikrotikUserService');

async function fixApprovedPayment() {
    console.log('🔧 Corrigindo pagamento aprovado...\n');
    
    const paymentId = '404d7569-ddaf-405c-9c3a-c0f5a5e6b528';
    const mikrotikUserService = new MikroTikUserService();
    
    try {
        // Buscar dados completos da venda
        const { data: venda, error } = await supabase
            .from('vendas')
            .select(`
                *,
                planos (
                    nome,
                    session_timeout,
                    rate_limit,
                    valor
                ),
                mikrotiks (
                    nome,
                    ip,
                    porta,
                    usuario,
                    senha,
                    ativo
                )
            `)
            .eq('payment_id', paymentId)
            .single();

        if (error) {
            console.error('❌ Erro ao buscar venda:', error.message);
            return;
        }

        console.log(`📊 Processando venda: ${venda.payment_id}`);
        console.log(`💰 Valor: R$ ${venda.valor_total}`);
        console.log(`📱 MAC: ${venda.mac_address}`);
        console.log(`📦 Plano: ${venda.planos?.nome}`);
        
        // Atualizar status para approved primeiro
        const { error: updateError } = await supabase
            .from('vendas')
            .update({
                status: 'completed',
                mercadopago_status: 'approved',
                paid_at: new Date().toISOString()
            })
            .eq('payment_id', paymentId);
            
        if (updateError) {
            console.error('❌ Erro ao atualizar status:', updateError.message);
            return;
        }
        
        console.log('✅ Status atualizado para completed/approved');
        
        // Criar usuário no MikroTik
        if (!venda.mikrotik_user_created) {
            console.log('\n👤 Criando usuário no MikroTik...');
            
            const userResult = await mikrotikUserService.createUserWithRetry(venda);
            
            if (userResult.success) {
                console.log('✅ Usuário criado com sucesso!');
                console.log(`👤 Username: ${userResult.username}`);
                console.log(`🔑 Password: ${userResult.password}`);
                console.log(`⏱️ Duração: ${venda.planos?.session_timeout || 'Ilimitado'}`);
            } else {
                console.error('❌ Erro ao criar usuário:', userResult.error);
            }
        } else {
            console.log('ℹ️ Usuário já foi criado anteriormente');
        }
        
        console.log('\n🎯 Pagamento processado com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro geral:', error.message);
    }
}

fixApprovedPayment();