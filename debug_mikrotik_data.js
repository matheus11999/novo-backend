require('dotenv').config();
const { supabase } = require('./src/config/database');

async function debugMikrotikData() {
    console.log('🔍 Investigando estrutura de dados do MikroTik...\n');
    
    try {
        // 1. Verificar estrutura da tabela mikrotiks
        console.log('📊 Buscando dados de MikroTiks...');
        const { data: mikrotiks, error: mikrotikError } = await supabase
            .from('mikrotiks')
            .select('*')
            .limit(1);

        if (mikrotikError) {
            console.error('❌ Erro ao buscar MikroTiks:', mikrotikError.message);
            return;
        }

        if (mikrotiks && mikrotiks.length > 0) {
            console.log('📋 Estrutura da tabela mikrotiks:');
            console.log(JSON.stringify(mikrotiks[0], null, 2));
            
            console.log('\n🔍 Campos disponíveis:');
            Object.keys(mikrotiks[0]).forEach(key => {
                console.log(`- ${key}: ${mikrotiks[0][key]}`);
            });
        }

        // 2. Verificar como os dados estão sendo obtidos numa venda
        console.log('\n📊 Buscando venda com dados de MikroTik...');
        const { data: vendas, error: vendaError } = await supabase
            .from('vendas')
            .select(`
                id,
                payment_id,
                mac_address,
                status,
                planos (nome, session_timeout),
                mikrotiks (*)
            `)
            .limit(1);

        if (vendaError) {
            console.error('❌ Erro ao buscar vendas:', vendaError.message);
            return;
        }

        if (vendas && vendas.length > 0) {
            console.log('\n📋 Estrutura da venda com mikrotik:');
            console.log(JSON.stringify(vendas[0], null, 2));
            
            if (vendas[0].mikrotiks) {
                console.log('\n🔍 Dados do MikroTik na venda:');
                Object.keys(vendas[0].mikrotiks).forEach(key => {
                    console.log(`- mikrotiks.${key}: ${vendas[0].mikrotiks[key]}`);
                });
                
                // Verificar especificamente os campos necessários
                const mikrotikData = vendas[0].mikrotiks;
                console.log('\n🎯 Verificação de campos obrigatórios:');
                console.log(`✅ IP: ${mikrotikData.ip || mikrotikData.host || mikrotikData.endereco || 'NÃO ENCONTRADO'}`);
                console.log(`✅ Username: ${mikrotikData.usuario || mikrotikData.username || mikrotikData.user || 'NÃO ENCONTRADO'}`);
                console.log(`✅ Password: ${mikrotikData.senha || mikrotikData.password || mikrotikData.pass || 'NÃO ENCONTRADO'}`);
                console.log(`✅ Port: ${mikrotikData.porta || mikrotikData.port || '8728 (padrão)'}`);
            } else {
                console.log('❌ Dados do MikroTik não encontrados na venda');
            }
        }

        // 3. Simular o que o service está fazendo
        if (vendas && vendas.length > 0 && vendas[0].mikrotiks) {
            console.log('\n🧪 Simulando criação de credentials...');
            const vendaData = vendas[0];
            
            const credentials = {
                ip: vendaData.mikrotiks.ip,
                username: vendaData.mikrotiks.usuario,
                password: vendaData.mikrotiks.senha,
                port: vendaData.mikrotiks.porta || 8728
            };
            
            console.log('📊 Credentials que seriam enviados:');
            console.log(JSON.stringify(credentials, null, 2));
            
            // Verificar se algum está undefined
            console.log('\n❓ Verificação de undefined:');
            console.log(`IP undefined: ${credentials.ip === undefined ? 'SIM ❌' : 'NÃO ✅'}`);
            console.log(`Username undefined: ${credentials.username === undefined ? 'SIM ❌' : 'NÃO ✅'}`);
            console.log(`Password undefined: ${credentials.password === undefined ? 'SIM ❌' : 'NÃO ✅'}`);
        }

    } catch (error) {
        console.error('❌ Erro geral:', error.message);
    }
}

debugMikrotikData();