-- CORREÇÃO COMPLETA - Desabilitar RLS de todas as tabelas problemáticas
-- Execute no Supabase SQL Editor

-- 1. Verificar tabelas com RLS habilitado
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE rowsecurity = true 
AND schemaname = 'public';

-- 2. DESABILITAR RLS das tabelas principais para evitar erros
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE vendas DISABLE ROW LEVEL SECURITY;
ALTER TABLE mikrotiks DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;

-- 3. REMOVER todas as políticas problemáticas
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    -- Remover políticas da tabela users
    FOR policy_record IN 
        SELECT policyname FROM pg_policies WHERE tablename = 'users'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON users', policy_record.policyname);
        RAISE NOTICE 'Removida política users: %', policy_record.policyname;
    END LOOP;
    
    -- Remover políticas da tabela vendas
    FOR policy_record IN 
        SELECT policyname FROM pg_policies WHERE tablename = 'vendas'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON vendas', policy_record.policyname);
        RAISE NOTICE 'Removida política vendas: %', policy_record.policyname;
    END LOOP;
    
    -- Remover políticas da tabela mikrotiks
    FOR policy_record IN 
        SELECT policyname FROM pg_policies WHERE tablename = 'mikrotiks'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON mikrotiks', policy_record.policyname);
        RAISE NOTICE 'Removida política mikrotiks: %', policy_record.policyname;
    END LOOP;
    
    -- Remover políticas da tabela payments
    FOR policy_record IN 
        SELECT policyname FROM pg_policies WHERE tablename = 'payments'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON payments', policy_record.policyname);
        RAISE NOTICE 'Removida política payments: %', policy_record.policyname;
    END LOOP;
END $$;

-- 4. Verificar se RLS foi desabilitado
SELECT 'RLS Status:' as info, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('users', 'vendas', 'mikrotiks', 'payments')
AND schemaname = 'public';

-- 5. Verificar políticas restantes
SELECT 'Políticas restantes:' as info, tablename, count(*) as total
FROM pg_policies 
WHERE tablename IN ('users', 'vendas', 'mikrotiks', 'payments')
GROUP BY tablename;

SELECT '✅ RLS desabilitado em todas as tabelas principais!' as resultado;