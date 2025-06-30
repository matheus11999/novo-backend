-- EMERGÊNCIA - Se ainda não conseguir fazer login
-- Execute este SQL para DESABILITAR completamente RLS

-- DESABILITAR RLS da tabela users
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- REMOVER TODAS as políticas
DROP POLICY IF EXISTS "users_select_own" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users; 
DROP POLICY IF EXISTS "admins_all_access" ON users;

SELECT 'RLS completamente desabilitado - login deve funcionar agora' as status;

-- IMPORTANTE: Após conseguir fazer login, você pode reabilitar RLS com políticas simples