require('dotenv').config();
const { supabase } = require('./src/config/database');
const MikroTikUserService = require('./src/services/mikrotikUserService');

async function testMikroTikUserCreation() {
    console.log('🧪 Testando criação de usuário MikroTik com correção...\n');
    
    try {
        // 1. Buscar uma venda completed sem usuário criado
        const { data: vendas, error } = await supabase
            .from('vendas')
            .select(`
                *,
                planos (nome, session_timeout, rate_limit),
                mikrotiks (*)
            `)
            .eq('status', 'completed')
            .eq('mikrotik_user_created', false)
            .limit(1);

        if (error) {
            console.error('❌ Erro ao buscar vendas:', error.message);
            return;
        }

        if (!vendas || vendas.length === 0) {
            console.log('ℹ️ Nenhuma venda para testar - criando dados de teste');
            
            // Simular dados de venda para teste
            const testVenda = {
                id: 'test-' + Date.now(),
                payment_id: 'test-payment-' + Date.now(),
                mac_address: '00:11:22:33:44:66', // MAC diferente para teste
                mikrotiks: {
                    ip: '10.66.66.7',
                    username: 'admin',
                    password: '2605',
                    port: 8728
                },
                planos: {
                    nome: '5 Megas',
                    session_timeout: '3600',
                    rate_limit: '5M/5M'
                }
            };
            
            console.log('📊 Dados de teste:');
            console.log(`MAC: ${testVenda.mac_address}`);
            console.log(`Plano: ${testVenda.planos.nome}`);
            console.log(`MikroTik: ${testVenda.mikrotiks.ip}:${testVenda.mikrotiks.port}`);
            
            // Testar criação com dados simulados
            const mikrotikUserService = new MikroTikUserService();
            const result = await mikrotikUserService.createUserWithRetry(testVenda);
            
            console.log('\n📊 Resultado do teste:');
            if (result.success) {
                console.log('✅ SUCESSO!');
                console.log(`👤 Username: ${result.username}`);
                console.log(`🔑 Password: ${result.password}`);
                console.log(`🎯 Tentativas: ${result.attempt}`);
                console.log(`⏱️ Tempo: ${result.duration}ms`);
            } else {
                console.log('❌ FALHA!');
                console.log(`📝 Erro: ${result.error}`);
                console.log(`🎯 Tentativas: ${result.attempt || 0}`);
            }
            
            return;
        }

        const venda = vendas[0];
        console.log(`📊 Testando com venda real: ${venda.payment_id}`);
        console.log(`MAC: ${venda.mac_address}`);
        console.log(`Plano: ${venda.planos?.nome}`);
        
        // Verificar credenciais antes do teste
        console.log('\n🔍 Verificando credenciais:');
        console.log(`IP: ${venda.mikrotiks?.ip || 'MISSING'}`);
        console.log(`Username: ${venda.mikrotiks?.username || venda.mikrotiks?.usuario || 'MISSING'}`);
        console.log(`Password: ${venda.mikrotiks?.password || venda.mikrotiks?.senha ? '[PRESENT]' : 'MISSING'}`);
        console.log(`Port: ${venda.mikrotiks?.port || venda.mikrotiks?.porta || 'MISSING'}`);

        // Testar criação
        const mikrotikUserService = new MikroTikUserService();
        console.log('\n🚀 Iniciando criação de usuário...');
        
        const result = await mikrotikUserService.createUserWithRetry(venda);
        
        console.log('\n📊 Resultado:');
        if (result.success) {
            console.log('✅ USUÁRIO CRIADO COM SUCESSO!');
            console.log(`👤 Username: ${result.username}`);
            console.log(`🔑 Password: ${result.password}`);
            console.log(`🎯 Tentativas: ${result.attempt}`);
            console.log(`⏱️ Tempo: ${result.duration}ms`);
            console.log(`🆔 MikroTik User ID: ${result.mikrotikUserId}`);
        } else {
            console.log('❌ FALHA NA CRIAÇÃO');
            console.log(`📝 Erro: ${result.error}`);
            console.log(`🎯 Tentativas: ${result.attempt || 0}`);
            
            // Analisar o tipo de erro
            if (result.error?.includes('Dados MikroTik incompletos')) {
                console.log('🔍 Problema nas credenciais - verificar banco de dados');
            } else if (result.error?.includes('Rota não encontrada')) {
                console.log('🔍 API MikroTik não está rodando');
            } else if (result.error?.includes('timeout')) {
                console.log('🔍 Timeout na conexão com MikroTik');
            }
        }

    } catch (error) {
        console.error('❌ Erro no teste:', error.message);
    }
}

testMikroTikUserCreation();