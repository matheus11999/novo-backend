-- SQL FINAL PARA CRIAR TABELA DE SAQUES - SUPABASE
-- Execute apenas este comando no Supabase SQL Editor

-- 1. Dropar tabela se existir (para recomeçar limpo)
DROP TABLE IF EXISTS saques CASCADE;

-- 2. Dropar tipos se existirem e recriar
DROP TYPE IF EXISTS saque_status CASCADE;
DROP TYPE IF EXISTS saque_metodo CASCADE;

CREATE TYPE saque_status AS ENUM ('pendente', 'aprovado', 'rejeitado');
CREATE TYPE saque_metodo AS ENUM ('pix', 'ted', 'doc');

-- 3. Criar tabela de saques
CREATE TABLE saques (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    status saque_status DEFAULT 'pendente',
    metodo_pagamento saque_metodo DEFAULT 'pix',
    chave_pix TEXT,
    dados_bancarios JSONB,
    observacoes TEXT,
    observacoes_admin TEXT,
    processed_by UUID,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Criar índices para performance
CREATE INDEX idx_saques_user_id ON saques(user_id);
CREATE INDEX idx_saques_status ON saques(status);
CREATE INDEX idx_saques_created_at ON saques(created_at);

-- 5. Adicionar constraints
ALTER TABLE saques ADD CONSTRAINT valor_minimo CHECK (valor >= 50.00);
ALTER TABLE saques ADD CONSTRAINT pix_key_required CHECK (
    (metodo_pagamento = 'pix' AND chave_pix IS NOT NULL AND trim(chave_pix) != '') OR 
    (metodo_pagamento != 'pix' AND dados_bancarios IS NOT NULL)
);

-- 6. Habilitar RLS
ALTER TABLE saques ENABLE ROW LEVEL SECURITY;

-- 7. Criar políticas de segurança
CREATE POLICY "Users can view own saques" ON saques
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saques" ON saques
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pending saques" ON saques
    FOR UPDATE USING (auth.uid() = user_id AND status = 'pendente');

CREATE POLICY "Admins can manage all saques" ON saques
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- 8. Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_saques_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Trigger para updated_at
CREATE TRIGGER update_saques_updated_at_trigger
    BEFORE UPDATE ON saques
    FOR EACH ROW
    EXECUTE FUNCTION update_saques_updated_at();

-- 10. Função para validar saldo antes de inserir saque
CREATE OR REPLACE FUNCTION validate_saque_balance()
RETURNS TRIGGER AS $$
DECLARE
    user_balance DECIMAL;
    user_role TEXT;
BEGIN
    -- Buscar saldo e role do usuário
    SELECT saldo, role INTO user_balance, user_role
    FROM users 
    WHERE id = NEW.user_id;
    
    -- Verificar se é admin
    IF user_role = 'admin' THEN
        RAISE EXCEPTION 'Administradores não podem solicitar saques';
    END IF;
    
    -- Verificar saldo
    IF user_balance IS NULL OR user_balance < NEW.valor THEN
        RAISE EXCEPTION 'Saldo insuficiente. Saldo atual: R$ %, Valor solicitado: R$ %', 
            COALESCE(user_balance, 0), NEW.valor;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11. Trigger para validar saldo
CREATE TRIGGER validate_saque_balance_trigger
    BEFORE INSERT ON saques
    FOR EACH ROW
    EXECUTE FUNCTION validate_saque_balance();

-- 12. Verificar se foi criado com sucesso
SELECT 'Tabela saques criada com sucesso!' as resultado;