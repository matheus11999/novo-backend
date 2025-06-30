-- SQL SIMPLES PARA CRIAR TABELA DE SAQUES - SUPABASE COMPATÍVEL
-- Execute este comando no Supabase SQL Editor

-- 1. Criar enums
CREATE TYPE saque_status AS ENUM ('pendente', 'aprovado', 'rejeitado');
CREATE TYPE saque_metodo AS ENUM ('pix', 'ted', 'doc');

-- 2. Criar tabela principal
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

-- 3. Habilitar RLS
ALTER TABLE saques ENABLE ROW LEVEL SECURITY;

-- 4. Políticas básicas
CREATE POLICY "Users can view own saques" ON saques
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saques" ON saques
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pending saques" ON saques
    FOR UPDATE USING (auth.uid() = user_id AND status = 'pendente');

-- 5. Política para admins (assumindo que você tem uma coluna role na tabela users)
CREATE POLICY "Admins can manage all saques" ON saques
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- 6. Adicionar constraints
ALTER TABLE saques ADD CONSTRAINT valor_minimo CHECK (valor >= 50.00);
ALTER TABLE saques ADD CONSTRAINT pix_key_required CHECK (
    (metodo_pagamento = 'pix' AND chave_pix IS NOT NULL) OR 
    (metodo_pagamento != 'pix' AND dados_bancarios IS NOT NULL)
);

-- 7. Criar índices
CREATE INDEX idx_saques_user_id ON saques(user_id);
CREATE INDEX idx_saques_status ON saques(status);
CREATE INDEX idx_saques_created_at ON saques(created_at);