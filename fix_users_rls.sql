-- SQL para corrigir políticas RLS da tabela users
-- Execute no Supabase SQL Editor

-- 1. Verificar se RLS está habilitado na tabela users
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'users';

-- 2. Verificar políticas existentes
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'users';

-- 3. Remover políticas restritivas se existirem
DROP POLICY IF EXISTS "Users can only view their own profile" ON users;
DROP POLICY IF EXISTS "Users can only update their own profile" ON users;

-- 4. Criar política para admins verem todos os usuários
CREATE POLICY "Admins can view all users" ON users
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'admin'
        ) OR auth.uid() = id
    );

-- 5. Criar política para admins gerenciarem usuários
CREATE POLICY "Admins can manage all users" ON users
    FOR ALL USING (
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'admin'
        )
    );

-- 6. Criar política para usuários normais verem apenas seu próprio perfil
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = id);

-- 7. Criar política para usuários normais atualizarem apenas seu próprio perfil
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- 8. Verificar políticas criadas
SELECT schemaname, tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename = 'users';

-- 9. Testar se admin pode ver todos os usuários
-- (Execute como admin logado)
-- SELECT count(*) as total_users FROM users;