const { supabase } = require('./src/config/database');

async function fixExistingPayments() {
    console.log('🔧 [FIX-PAYMENTS] Iniciando correção de pagamentos existentes...');

    try {
        // 1. Buscar admin user
        const { data: adminUser, error: adminError } = await supabase
            .from('users')
            .select('id, nome, saldo')
            .eq('role', 'admin')
            .limit(1)
            .single();

        if (adminError || !adminUser) {
            console.error('❌ Admin user não encontrado:', adminError);
            return;
        }

        console.log(`👑 Admin encontrado: ${adminUser.nome} (Saldo atual: R$ ${adminUser.saldo})`);

        // 2. Buscar vendas completadas sem transações processadas
        const { data: vendasCompletas, error: vendasError } = await supabase
            .from('vendas')
            .select(`
                *,
                planos (*),
                mikrotiks (*, users!mikrotiks_user_id_fkey (id, nome, saldo))
            `)
            .eq('status', 'completed')
            .order('paid_at', { ascending: true });

        if (vendasError) {
            console.error('❌ Erro ao buscar vendas:', vendasError);
            return;
        }

        if (!vendasCompletas || vendasCompletas.length === 0) {
            console.log('ℹ️ Nenhuma venda completada encontrada');
            return;
        }

        console.log(`📊 Encontradas ${vendasCompletas.length} vendas completadas para processar`);

        // 3. Verificar quais já têm transações
        for (const venda of vendasCompletas) {
            console.log(`\n🔍 Processando venda: ${venda.payment_id}`);

            // Verificar se já existem transações para esta venda
            const { data: transacoesExistentes, error: transError } = await supabase
                .from('transacoes')
                .select('id')
                .eq('referencia_id', venda.id)
                .eq('referencia_tipo', 'venda');

            if (transError) {
                console.error('❌ Erro ao verificar transações existentes:', transError);
                continue;
            }

            if (transacoesExistentes && transacoesExistentes.length > 0) {
                console.log(`⏭️ Venda ${venda.payment_id} já possui transações, pulando...`);
                continue;
            }

            // 4. Processar a venda
            await processVendaForBalance(venda, adminUser.id);
        }

        console.log('\n✅ [FIX-PAYMENTS] Correção concluída!');

        // 5. Mostrar relatório final
        await showFinalReport();

    } catch (error) {
        console.error('❌ [FIX-PAYMENTS] Erro na correção:', error);
    }
}

async function processVendaForBalance(venda, adminUserId) {
    try {
        console.log(`💰 Processando saldos para venda: ${venda.payment_id}`);
        console.log(`  📄 Valor total: R$ ${venda.valor_total}`);
        console.log(`  👑 Valor admin: R$ ${venda.valor_admin}`);
        console.log(`  👤 Valor usuário: R$ ${venda.valor_usuario}`);

        // 1. Buscar saldo atual do admin
        const { data: adminData, error: adminError } = await supabase
            .from('users')
            .select('saldo')
            .eq('id', adminUserId)
            .single();

        if (adminError) {
            console.error('❌ Erro ao buscar saldo do admin:', adminError);
            return;
        }

        const adminSaldoAnterior = parseFloat(adminData.saldo) || 0;
        const adminSaldoNovo = adminSaldoAnterior + parseFloat(venda.valor_admin);

        // 2. Buscar saldo atual do usuário do MikroTik
        const mikrotikUser = venda.mikrotiks?.users;
        const mikrotikUserId = mikrotikUser?.id || adminUserId;
        
        console.log(`  🏢 MikroTik: ${venda.mikrotiks?.nome}`);
        console.log(`  👤 Usuário: ${mikrotikUser?.nome || 'Admin'}`);

        let userSaldoAnterior = 0;
        let userSaldoNovo = 0;

        if (mikrotikUserId !== adminUserId) {
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('saldo')
                .eq('id', mikrotikUserId)
                .single();

            if (userError) {
                console.error('❌ Erro ao buscar saldo do usuário:', userError);
                return;
            }

            userSaldoAnterior = parseFloat(userData.saldo) || 0;
            userSaldoNovo = userSaldoAnterior + parseFloat(venda.valor_usuario);
        }

        // 3. Criar as transações
        const transacoes = [
            {
                user_id: adminUserId,
                tipo: 'credito',
                motivo: `Comissão admin - Venda ${venda.payment_id}`,
                valor: parseFloat(venda.valor_admin),
                referencia_id: venda.id,
                referencia_tipo: 'venda',
                saldo_anterior: adminSaldoAnterior,
                saldo_atual: adminSaldoNovo
            }
        ];

        // Adicionar transação do usuário apenas se for diferente do admin
        if (mikrotikUserId !== adminUserId) {
            transacoes.push({
                user_id: mikrotikUserId,
                tipo: 'credito',
                motivo: `Receita de venda - Venda ${venda.payment_id}`,
                valor: parseFloat(venda.valor_usuario),
                referencia_id: venda.id,
                referencia_tipo: 'venda',
                saldo_anterior: userSaldoAnterior,
                saldo_atual: userSaldoNovo
            });
        } else {
            // Se o usuário é o mesmo que admin, somar tudo no admin
            transacoes[0].valor = parseFloat(venda.valor_admin) + parseFloat(venda.valor_usuario);
            transacoes[0].saldo_atual = adminSaldoAnterior + parseFloat(venda.valor_admin) + parseFloat(venda.valor_usuario);
            transacoes[0].motivo = `Comissão total - Venda ${venda.payment_id}`;
        }

        const { error: transacaoError } = await supabase
            .from('transacoes')
            .insert(transacoes);

        if (transacaoError) {
            console.error('❌ Erro ao criar transações:', transacaoError);
            return;
        }

        // 4. Atualizar saldos dos usuários
        const { error: adminUpdateError } = await supabase
            .from('users')
            .update({ saldo: mikrotikUserId === adminUserId ? transacoes[0].saldo_atual : adminSaldoNovo })
            .eq('id', adminUserId);

        if (adminUpdateError) {
            console.error('❌ Erro ao atualizar saldo do admin:', adminUpdateError);
            return;
        }

        // Se o usuário do MikroTik for diferente do admin
        if (mikrotikUserId !== adminUserId) {
            const { error: userUpdateError } = await supabase
                .from('users')
                .update({ saldo: userSaldoNovo })
                .eq('id', mikrotikUserId);

            if (userUpdateError) {
                console.error('❌ Erro ao atualizar saldo do usuário:', userUpdateError);
                return;
            }
        }

        console.log(`✅ Venda processada com sucesso!`);
        if (mikrotikUserId === adminUserId) {
            console.log(`  📊 Admin: R$ ${adminSaldoAnterior.toFixed(2)} → R$ ${transacoes[0].saldo_atual.toFixed(2)} (+R$ ${transacoes[0].valor.toFixed(2)})`);
        } else {
            console.log(`  📊 Admin: R$ ${adminSaldoAnterior.toFixed(2)} → R$ ${adminSaldoNovo.toFixed(2)} (+R$ ${venda.valor_admin})`);
            console.log(`  📊 User: R$ ${userSaldoAnterior.toFixed(2)} → R$ ${userSaldoNovo.toFixed(2)} (+R$ ${venda.valor_usuario})`);
        }

    } catch (error) {
        console.error('❌ Erro ao processar venda:', error);
    }
}

async function showFinalReport() {
    try {
        console.log('\n📊 [RELATÓRIO FINAL]');
        console.log('================================');

        // Total de transações
        const { data: totalTransacoes, error: transError } = await supabase
            .from('transacoes')
            .select('id', { count: 'exact' });

        if (!transError) {
            console.log(`💳 Total de transações: ${totalTransacoes.length}`);
        }

        // Saldos atualizados
        const { data: usuarios, error: userError } = await supabase
            .from('users')
            .select('nome, role, saldo')
            .gt('saldo', 0)
            .order('saldo', { ascending: false });

        if (!userError && usuarios) {
            console.log('\n👥 Usuários com saldo:');
            usuarios.forEach(user => {
                console.log(`  ${user.role === 'admin' ? '👑' : '👤'} ${user.nome}: R$ ${parseFloat(user.saldo).toFixed(2)}`);
            });
        }

        // Total de vendas
        const { data: vendas, error: vendaError } = await supabase
            .from('vendas')
            .select('status', { count: 'exact' })
            .eq('status', 'completed');

        if (!vendaError) {
            console.log(`\n🛒 Vendas completadas: ${vendas.length}`);
        }

    } catch (error) {
        console.error('❌ Erro ao gerar relatório:', error);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    fixExistingPayments()
        .then(() => {
            console.log('🎉 Script executado com sucesso!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Erro na execução:', error);
            process.exit(1);
        });
}

module.exports = { fixExistingPayments }; 