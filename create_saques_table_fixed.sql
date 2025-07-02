-- ============================================================================
-- SQL COMPLETO PARA CRIAR TABELA DE SAQUES - VERSÃO CORRIGIDA
-- Execute este comando no Supabase SQL Editor ou diretamente no PostgreSQL
-- ============================================================================

-- 1. Limpar dados anteriores (se necessário)
-- DROP TABLE IF EXISTS saques CASCADE;
-- DROP TYPE IF EXISTS saque_status CASCADE;
-- DROP TYPE IF EXISTS saque_metodo CASCADE;

-- 2. Criar enums para status de saques
DO $$ BEGIN
    CREATE TYPE saque_status AS ENUM ('pendente', 'aprovado', 'rejeitado');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Criar enum para métodos de pagamento
DO $$ BEGIN
    CREATE TYPE saque_metodo AS ENUM ('pix', 'ted', 'doc');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 4. Criar tabela de saques
CREATE TABLE IF NOT EXISTS saques (
    -- Chaves primárias e estrangeiras
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Dados do saque
    valor NUMERIC(10,2) NOT NULL CHECK (valor >= 50.00),
    status saque_status NOT NULL DEFAULT 'pendente',
    metodo_pagamento saque_metodo NOT NULL DEFAULT 'pix',
    
    -- Dados de pagamento
    chave_pix TEXT, -- Para PIX: email, CPF, telefone ou chave aleatória
    dados_bancarios JSONB, -- Para TED/DOC: {"banco": "...", "agencia": "...", "conta": "...", "titular": "..."}
    
    -- Observações
    observacoes TEXT, -- Observações do usuário
    observacoes_admin TEXT, -- Observações do admin (motivo de rejeição, etc)
    
    -- Auditoria
    processed_by UUID REFERENCES users(id), -- Admin que processou
    processed_at TIMESTAMP WITH TIME ZONE, -- Quando foi processado
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_saques_user_id ON saques(user_id);
CREATE INDEX IF NOT EXISTS idx_saques_status ON saques(status);
CREATE INDEX IF NOT EXISTS idx_saques_created_at ON saques(created_at);
CREATE INDEX IF NOT EXISTS idx_saques_processed_by ON saques(processed_by);
CREATE INDEX IF NOT EXISTS idx_saques_metodo_pagamento ON saques(metodo_pagamento);

-- 6. Criar função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 7. Aplicar trigger na tabela saques
DROP TRIGGER IF EXISTS update_saques_updated_at ON saques;
CREATE TRIGGER update_saques_updated_at
    BEFORE UPDATE ON saques
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 8. Adicionar check constraints
-- Garantir que PIX tenha chave_pix e TED/DOC tenham dados_bancarios
ALTER TABLE saques DROP CONSTRAINT IF EXISTS check_pix_key;
ALTER TABLE saques ADD CONSTRAINT check_pix_key 
CHECK (
    (metodo_pagamento = 'pix' AND chave_pix IS NOT NULL AND TRIM(chave_pix) != '') OR 
    (metodo_pagamento IN ('ted', 'doc') AND dados_bancarios IS NOT NULL)
);

-- 9. Verificar se processed_by é preenchido quando status não é pendente
ALTER TABLE saques DROP CONSTRAINT IF EXISTS check_processed_fields;
ALTER TABLE saques ADD CONSTRAINT check_processed_fields
CHECK (
    (status = 'pendente') OR 
    (status IN ('aprovado', 'rejeitado') AND processed_by IS NOT NULL AND processed_at IS NOT NULL)
);

-- 10. Habilitar Row Level Security (RLS)
ALTER TABLE saques ENABLE ROW LEVEL SECURITY;

-- 11. Remover políticas existentes (se houver)
DROP POLICY IF EXISTS "Users can view own saques" ON saques;
DROP POLICY IF EXISTS "Users can insert own saques" ON saques;
DROP POLICY IF EXISTS "Users can update own pending saques" ON saques;
DROP POLICY IF EXISTS "Admins can view all saques" ON saques;
DROP POLICY IF EXISTS "Admins can update saque status" ON saques;

-- 12. Criar políticas de segurança

-- Política: Usuários podem ver seus próprios saques
CREATE POLICY "Users can view own saques"
    ON saques FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.id = saques.user_id
        )
    );

-- Política: Usuários podem inserir seus próprios saques
CREATE POLICY "Users can insert own saques"
    ON saques FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.id = user_id
            AND users.role != 'admin' -- Admins não podem criar saques
        )
    );

-- Política: Usuários podem atualizar apenas seus próprios saques pendentes
CREATE POLICY "Users can update own pending saques"
    ON saques FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.id = saques.user_id
            AND saques.status = 'pendente'
            AND users.role != 'admin'
        )
    );

-- Política: Admins podem ver todos os saques
CREATE POLICY "Admins can view all saques"
    ON saques FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Política: Admins podem atualizar status de saques
CREATE POLICY "Admins can update saque status"
    ON saques FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- 13. Criar função para validar saldo do usuário antes de inserir saque
CREATE OR REPLACE FUNCTION validate_user_balance_before_saque()
RETURNS TRIGGER AS $$
DECLARE
    user_balance NUMERIC;
BEGIN
    -- Buscar saldo atual do usuário
    SELECT saldo INTO user_balance 
    FROM users 
    WHERE id = NEW.user_id;
    
    -- Verificar se tem saldo suficiente
    IF user_balance IS NULL OR user_balance < NEW.valor THEN
        RAISE EXCEPTION 'Saldo insuficiente. Saldo atual: R$ %, Valor solicitado: R$ %', 
            COALESCE(user_balance, 0), NEW.valor;
    END IF;
    
    -- Verificar se é admin tentando criar saque
    IF EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Administradores não podem solicitar saques';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 14. Aplicar trigger de validação de saldo
DROP TRIGGER IF EXISTS validate_balance_before_saque ON saques;
CREATE TRIGGER validate_balance_before_saque
    BEFORE INSERT ON saques
    FOR EACH ROW
    EXECUTE FUNCTION validate_user_balance_before_saque();

-- 15. Criar função para auditoria de mudanças de status
CREATE OR REPLACE FUNCTION audit_saque_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Log da mudança de status (você pode implementar uma tabela de auditoria se necessário)
    IF OLD.status != NEW.status THEN
        -- Aqui você pode inserir em uma tabela de auditoria
        RAISE NOTICE 'Saque % mudou status de % para % por usuário %', 
            NEW.id, OLD.status, NEW.status, NEW.processed_by;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 16. Aplicar trigger de auditoria
DROP TRIGGER IF EXISTS audit_saque_status ON saques;
CREATE TRIGGER audit_saque_status
    AFTER UPDATE ON saques
    FOR EACH ROW
    EXECUTE FUNCTION audit_saque_status_change();

-- 17. Adicionar comentários para documentação
COMMENT ON TABLE saques IS 'Tabela para gerenciar solicitações de saque dos usuários';
COMMENT ON COLUMN saques.id IS 'ID único do saque';
COMMENT ON COLUMN saques.user_id IS 'ID do usuário que solicitou o saque';
COMMENT ON COLUMN saques.valor IS 'Valor do saque em reais (mínimo R$ 50,00)';
COMMENT ON COLUMN saques.status IS 'Status do saque: pendente, aprovado ou rejeitado';
COMMENT ON COLUMN saques.metodo_pagamento IS 'Método de pagamento: pix, ted ou doc';
COMMENT ON COLUMN saques.chave_pix IS 'Chave PIX para saques via PIX (email, CPF, telefone ou chave aleatória)';
COMMENT ON COLUMN saques.dados_bancarios IS 'Dados bancários para TED/DOC em formato JSON';
COMMENT ON COLUMN saques.observacoes IS 'Observações adicionais do usuário';
COMMENT ON COLUMN saques.observacoes_admin IS 'Observações do administrador (ex: motivo da rejeição)';
COMMENT ON COLUMN saques.processed_by IS 'ID do administrador que processou o saque';
COMMENT ON COLUMN saques.processed_at IS 'Data e hora do processamento do saque';
COMMENT ON COLUMN saques.created_at IS 'Data e hora de criação do saque';
COMMENT ON COLUMN saques.updated_at IS 'Data e hora da última atualização';

-- 18. Criar view para relatórios (opcional)
CREATE OR REPLACE VIEW vw_saques_relatorio AS
SELECT 
    s.id,
    s.valor,
    s.status,
    s.metodo_pagamento,
    s.created_at,
    s.processed_at,
    u.nome as usuario_nome,
    u.email as usuario_email,
    admin_u.nome as admin_nome,
    CASE 
        WHEN s.metodo_pagamento = 'pix' THEN s.chave_pix
        ELSE CONCAT(
            s.dados_bancarios->>'banco', ' - ',
            'Ag: ', s.dados_bancarios->>'agencia', ' - ',
            'Conta: ', s.dados_bancarios->>'conta'
        )
    END as dados_pagamento
FROM saques s
JOIN users u ON s.user_id = u.id
LEFT JOIN users admin_u ON s.processed_by = admin_u.id
ORDER BY s.created_at DESC;

-- 19. Inserir dados de exemplo (REMOVER EM PRODUÇÃO)
/*
-- Exemplo de saque via PIX
INSERT INTO saques (user_id, valor, metodo_pagamento, chave_pix, observacoes) 
VALUES (
    (SELECT id FROM users WHERE role != 'admin' LIMIT 1), 
    100.00, 
    'pix', 
    'usuario@exemplo.com',
    'Primeiro saque de teste'
);

-- Exemplo de saque via TED
INSERT INTO saques (user_id, valor, metodo_pagamento, dados_bancarios, observacoes) 
VALUES (
    (SELECT id FROM users WHERE role != 'admin' LIMIT 1), 
    200.00, 
    'ted', 
    '{"banco": "Banco do Brasil", "agencia": "1234-5", "conta": "12345-6", "titular": "João da Silva"}',
    'Saque para conta corrente'
);
*/

-- ============================================================================
-- VERIFICAÇÕES FINAIS
-- ============================================================================

-- Verificar se a tabela foi criada corretamente
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'saques') THEN
        RAISE NOTICE '✅ Tabela saques criada com sucesso!';
    ELSE
        RAISE EXCEPTION '❌ Erro: Tabela saques não foi criada!';
    END IF;
END $$;

-- Verificar se os enums foram criados
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_type WHERE typname = 'saque_status') THEN
        RAISE NOTICE '✅ Enum saque_status criado com sucesso!';
    END IF;
    
    IF EXISTS (SELECT FROM pg_type WHERE typname = 'saque_metodo') THEN
        RAISE NOTICE '✅ Enum saque_metodo criado com sucesso!';
    END IF;
END $$;

-- Verificar se as políticas RLS foram criadas
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'saques' 
        AND policyname = 'Users can view own saques'
    ) THEN
        RAISE NOTICE '✅ Políticas RLS criadas com sucesso!';
    END IF;
END $$;

-- Mostrar estrutura final da tabela
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'saques' 
ORDER BY ordinal_position;

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================

RAISE NOTICE '🎉 Sistema de saques implementado com sucesso!';
RAISE NOTICE '📋 Próximos passos:';
RAISE NOTICE '   1. Verifique se todas as colunas foram criadas corretamente';
RAISE NOTICE '   2. Teste as políticas RLS com diferentes usuários';
RAISE NOTICE '   3. Configure as variáveis de ambiente no backend';
RAISE NOTICE '   4. Teste a API de saques via Postman ou similar';
RAISE NOTICE '   5. Teste a interface frontend';