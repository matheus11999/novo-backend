-- SQL para criar a tabela de saques
-- Execute este comando no Supabase SQL Editor ou diretamente no PostgreSQL

-- Criar enum para status de saques
DO $$ BEGIN
    CREATE TYPE saque_status AS ENUM ('pendente', 'aprovado', 'rejeitado');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Criar enum para métodos de pagamento
DO $$ BEGIN
    CREATE TYPE saque_metodo AS ENUM ('pix', 'ted', 'doc');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Criar tabela de saques
CREATE TABLE IF NOT EXISTS saques (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    valor NUMERIC(10,2) NOT NULL CHECK (valor >= 50.00),
    status saque_status NOT NULL DEFAULT 'pendente',
    metodo_pagamento saque_metodo NOT NULL DEFAULT 'pix',
    chave_pix TEXT, -- Para PIX
    dados_bancarios JSONB, -- Para TED/DOC: banco, agencia, conta, titular
    observacoes TEXT,
    observacoes_admin TEXT, -- Campo para admin adicionar motivo de rejeição
    processed_by UUID REFERENCES users(id), -- ID do admin que processou
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_saques_user_id ON saques(user_id);
CREATE INDEX IF NOT EXISTS idx_saques_status ON saques(status);
CREATE INDEX IF NOT EXISTS idx_saques_created_at ON saques(created_at);
CREATE INDEX IF NOT EXISTS idx_saques_processed_by ON saques(processed_by);

-- Criar trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Aplicar trigger na tabela saques
DROP TRIGGER IF EXISTS update_saques_updated_at ON saques;
CREATE TRIGGER update_saques_updated_at
    BEFORE UPDATE ON saques
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Adicionar políticas de segurança RLS (Row Level Security)
ALTER TABLE saques ENABLE ROW LEVEL SECURITY;

-- Política para usuários normais: só podem ver seus próprios saques
CREATE POLICY "Users can view own saques"
    ON saques FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.id = saques.user_id
        )
    );

-- Política para usuários normais: só podem inserir seus próprios saques
CREATE POLICY "Users can insert own saques"
    ON saques FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.id = user_id
        )
    );

-- Política para usuários normais: podem atualizar apenas observações dos próprios saques pendentes
CREATE POLICY "Users can update own pending saques"
    ON saques FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.id = saques.user_id
            AND saques.status = 'pendente'
        )
    );

-- Política para admins: podem ver todos os saques
CREATE POLICY "Admins can view all saques"
    ON saques FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Política para admins: podem atualizar status e observações admin
CREATE POLICY "Admins can update saque status"
    ON saques FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Adicionar check constraint para PIX
ALTER TABLE saques ADD CONSTRAINT check_pix_key 
CHECK (
    (metodo_pagamento = 'pix' AND chave_pix IS NOT NULL) OR 
    (metodo_pagamento != 'pix' AND dados_bancarios IS NOT NULL)
);

-- Adicionar comentários para documentação
COMMENT ON TABLE saques IS 'Tabela para gerenciar solicitações de saque dos usuários';
COMMENT ON COLUMN saques.valor IS 'Valor do saque em reais (mínimo 50.00)';
COMMENT ON COLUMN saques.chave_pix IS 'Chave PIX (email, telefone, CPF ou chave aleatória)';
COMMENT ON COLUMN saques.dados_bancarios IS 'Dados bancários para TED/DOC em formato JSON';
COMMENT ON COLUMN saques.observacoes_admin IS 'Observações do administrador (ex: motivo da rejeição)';
COMMENT ON COLUMN saques.processed_by IS 'ID do administrador que processou o saque';

-- Criar função para validar saldo do usuário antes de inserir saque
CREATE OR REPLACE FUNCTION validate_user_balance()
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
        RAISE EXCEPTION 'Saldo insuficiente. Saldo atual: %, Valor solicitado: %', 
            COALESCE(user_balance, 0), NEW.valor;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger de validação de saldo
CREATE TRIGGER validate_balance_before_saque
    BEFORE INSERT ON saques
    FOR EACH ROW
    EXECUTE FUNCTION validate_user_balance();

-- Inserir dados de exemplo (opcional - remover em produção)
-- INSERT INTO saques (user_id, valor, metodo_pagamento, chave_pix) 
-- VALUES ('user-id-exemplo', 100.00, 'pix', 'exemplo@email.com');