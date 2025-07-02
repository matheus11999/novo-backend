-- CORREÇÃO URGENTE - Recursão Infinita nas Políticas RLS
-- Execute IMEDIATAMENTE no Supabase SQL Editor

-- 1. REMOVER TODAS as políticas problemáticas da tabela users
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can manage all users" ON users;
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can only view their own profile" ON users;
DROP POLICY IF EXISTS "Users can only update their own profile" ON users;

-- 2. DESABILITAR RLS temporariamente para corrigir
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- 3. Verificar se consegue acessar agora
SELECT 'RLS desabilitado - teste o login agora' as status;

-- 4. RECRIAR políticas simples SEM recursão
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 5. Política simples para usuários verem próprio perfil
CREATE POLICY "users_select_own" ON users
    FOR SELECT USING (auth.uid() = id);

-- 6. Política simples para usuários atualizarem próprio perfil  
CREATE POLICY "users_update_own" ON users
    FOR UPDATE USING (auth.uid() = id);

-- 7. Política para admins - SEM subquery que causa recursão
CREATE POLICY "admins_all_access" ON users
    FOR ALL USING (
        -- Usar auth.jwt() para verificar role sem causar recursão
        (auth.jwt() ->> 'user_metadata' ->> 'role' = 'admin') OR
        (auth.uid() = id)
    );

-- 8. Verificar políticas criadas
SELECT schemaname, tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename = 'users';

SELECT 'Políticas RLS corrigidas!' as resultado;