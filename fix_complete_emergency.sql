-- SOLUÇÃO COMPLETA - Remove TUDO e corrige
-- Execute este SQL completo no Supabase

-- 1. DESABILITAR RLS primeiro
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- 2. REMOVER TODAS as políticas possíveis (sem erro se não existir)
DO $$ 
DECLARE
    policy_name TEXT;
BEGIN
    -- Loop para remover todas as políticas da tabela users
    FOR policy_name IN 
        SELECT policyname FROM pg_policies WHERE tablename = 'users'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON users', policy_name);
        RAISE NOTICE 'Removida política: %', policy_name;
    END LOOP;
END $$;

-- 3. Verificar se todas foram removidas
SELECT 'Políticas restantes:' as status, count(*) as total 
FROM pg_policies WHERE tablename = 'users';

-- 4. MANTER RLS DESABILITADO por enquanto para funcionar
SELECT 'RLS desabilitado - login deve funcionar agora!' as resultado;

-- 5. (OPCIONAL) Se quiser reabilitar RLS mais tarde com política simples:
/*
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "simple_user_policy" ON users
    FOR ALL USING (auth.uid() = id);
*/