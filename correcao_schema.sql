-- =============================================
-- CORREÇÃO E ATUALIZAÇÃO DO SCHEMA SUPABASE
-- Execute este SQL no seu Supabase para alinhar com o sistema implementado
-- =============================================

-- 1. Primeiro, vamos criar a tabela `vendas` com a estrutura correta
-- (Deletar a existente se necessário e recriar)
DROP TABLE IF EXISTS public.vendas CASCADE;

CREATE TABLE public.vendas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mikrotik_id UUID NOT NULL REFERENCES mikrotiks(id) ON DELETE CASCADE,
    plano_id UUID NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    payment_id VARCHAR(255) UNIQUE NOT NULL, -- UUID gerado internamente
    
    -- Status da venda
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired', 'cancelled')),
    
    -- Valores financeiros
    valor_total DECIMAL(10,2) NOT NULL,
    valor_admin DECIMAL(10,2) NOT NULL DEFAULT 0,
    valor_usuario DECIMAL(10,2) NOT NULL DEFAULT 0,
    
    -- Dados MercadoPago
    mercadopago_payment_id VARCHAR(255),
    mercadopago_status VARCHAR(50),
    qr_code TEXT, -- QR Code base64
    pix_code TEXT, -- Código PIX para copia e cola
    
    -- Dados do cliente (captive portal)
    mac_address VARCHAR(17) NOT NULL, -- Formato XX:XX:XX:XX:XX:XX
    ip_address INET,
    user_agent TEXT,
    
    -- Credenciais criadas no MikroTik
    usuario_criado VARCHAR(255),
    senha_usuario VARCHAR(255),
    mikrotik_user_id VARCHAR(255), -- ID do usuário no MikroTik
    
    -- Timestamps
    expires_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Mensagens de erro (se houver)
    error_message TEXT
);

-- 2. Criar índices para performance
CREATE INDEX idx_vendas_payment_id ON vendas(payment_id);
CREATE INDEX idx_vendas_mac_address ON vendas(mac_address);
CREATE INDEX idx_vendas_mikrotik_id ON vendas(mikrotik_id);
CREATE INDEX idx_vendas_mercadopago_id ON vendas(mercadopago_payment_id);
CREATE INDEX idx_vendas_status ON vendas(status);
CREATE INDEX idx_vendas_created_at ON vendas(created_at);

-- 3. Criar tabela historico_vendas para comissões
CREATE TABLE IF NOT EXISTS public.historico_vendas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    venda_id UUID NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
    mikrotik_id UUID NOT NULL REFERENCES mikrotiks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- ID do usuário que vai receber o valor
    
    -- Tipo da transação
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('admin', 'usuario')),
    
    -- Valor da transação
    valor DECIMAL(10,2) NOT NULL,
    
    -- Descrição
    descricao TEXT,
    
    -- Status da transação
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para histórico
CREATE INDEX idx_historico_venda_id ON historico_vendas(venda_id);
CREATE INDEX idx_historico_user_id ON historico_vendas(user_id);
CREATE INDEX idx_historico_tipo ON historico_vendas(tipo);
CREATE INDEX idx_historico_status ON historico_vendas(status);

-- 4. Atualizar tabela mikrotiks para incluir porcentagem_admin
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'mikrotiks' AND column_name = 'porcentagem_admin'
    ) THEN
        ALTER TABLE mikrotiks 
        ADD COLUMN porcentagem_admin DECIMAL(5,2) DEFAULT 10.00 
        CHECK (porcentagem_admin >= 0 AND porcentagem_admin <= 100);
    END IF;
END $$;

-- 5. Atualizar tabela mikrotiks para incluir campos necessários
DO $$ 
BEGIN 
    -- Adicionar campo ip se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'mikrotiks' AND column_name = 'ip'
    ) THEN
        ALTER TABLE mikrotiks ADD COLUMN ip VARCHAR(45);
    END IF;
    
    -- Adicionar campo usuario se não existir  
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'mikrotiks' AND column_name = 'usuario'
    ) THEN
        ALTER TABLE mikrotiks ADD COLUMN usuario VARCHAR(255);
    END IF;
    
    -- Adicionar campo senha se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'mikrotiks' AND column_name = 'senha'
    ) THEN
        ALTER TABLE mikrotiks ADD COLUMN senha VARCHAR(255);
    END IF;
    
    -- Adicionar campo porta se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'mikrotiks' AND column_name = 'porta'
    ) THEN
        ALTER TABLE mikrotiks ADD COLUMN porta INTEGER DEFAULT 8728;
    END IF;
END $$;

-- 6. Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Aplicar trigger nas tabelas
DROP TRIGGER IF EXISTS update_vendas_updated_at ON vendas;
CREATE TRIGGER update_vendas_updated_at 
    BEFORE UPDATE ON vendas 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_historico_vendas_updated_at ON historico_vendas;
CREATE TRIGGER update_historico_vendas_updated_at 
    BEFORE UPDATE ON historico_vendas 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 7. Views úteis para relatórios
CREATE OR REPLACE VIEW vendas_resumo AS
SELECT 
    v.id,
    v.payment_id,
    v.status,
    v.valor_total,
    v.mac_address,
    v.usuario_criado,
    v.created_at,
    v.paid_at,
    m.nome as mikrotik_nome,
    p.nome as plano_nome,
    p.valor as plano_valor,
    p.session_timeout as plano_duracao
FROM vendas v
JOIN mikrotiks m ON v.mikrotik_id = m.id
JOIN planos p ON v.plano_id = p.id
ORDER BY v.created_at DESC;

-- View para comissões
CREATE OR REPLACE VIEW comissoes_resumo AS
SELECT 
    h.id,
    h.tipo,
    h.valor,
    h.status,
    h.created_at,
    v.payment_id,
    v.mac_address,
    m.nome as mikrotik_nome,
    p.nome as plano_nome
FROM historico_vendas h
JOIN vendas v ON h.venda_id = v.id
JOIN mikrotiks m ON h.mikrotik_id = m.id
JOIN planos p ON v.plano_id = p.id
ORDER BY h.created_at DESC;

-- 8. Comentários nas tabelas
COMMENT ON TABLE vendas IS 'Tabela de vendas realizadas via captive portal com pagamento PIX';
COMMENT ON TABLE historico_vendas IS 'Histórico de transações para distribuição de comissões';

-- 9. Inserir dados de exemplo no MikroTik para teste (ajustar conforme necessário)
INSERT INTO mikrotiks (
    id, 
    user_id, 
    nome, 
    ip, 
    usuario, 
    senha, 
    porta, 
    ativo, 
    porcentagem_admin
) VALUES (
    'b5cf26c0-8581-49ec-80b1-d765aacff841',
    (SELECT id FROM auth.users LIMIT 1), -- Pegar o primeiro usuário
    'MikroTik Teste',
    '192.168.1.1',
    'admin',
    'password123',
    8728,
    true,
    15.00
) ON CONFLICT (id) DO UPDATE SET
    ip = EXCLUDED.ip,
    usuario = EXCLUDED.usuario,
    senha = EXCLUDED.senha,
    porta = EXCLUDED.porta,
    porcentagem_admin = EXCLUDED.porcentagem_admin;

-- 10. Atualizar o plano existente para garantir compatibilidade
UPDATE planos 
SET 
    valor = 5.00,
    session_timeout = '3600', -- 1 hora em segundos
    ativo = true,
    visivel = true
WHERE id = '49ccd8fc-424c-4000-a7e2-398ca640fccd';

-- 11. Criar função para limpar pagamentos expirados (executar periodicamente)
CREATE OR REPLACE FUNCTION limpar_pagamentos_expirados()
RETURNS INTEGER AS $$
DECLARE
    registros_afetados INTEGER;
BEGIN
    UPDATE vendas 
    SET status = 'expired'
    WHERE status = 'pending' 
    AND expires_at < NOW();
    
    GET DIAGNOSTICS registros_afetados = ROW_COUNT;
    
    RETURN registros_afetados;
END;
$$ LANGUAGE plpgsql;

-- 12. Habilitar RLS (Row Level Security) se necessário
ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_vendas ENABLE ROW LEVEL SECURITY;

-- Políticas básicas de RLS (ajustar conforme necessário)
CREATE POLICY "Usuários podem ver suas próprias vendas" ON vendas
    FOR SELECT USING (
        mikrotik_id IN (
            SELECT id FROM mikrotiks WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Usuários podem ver seu próprio histórico" ON historico_vendas
    FOR SELECT USING (user_id = auth.uid());

-- 13. Conceder permissões necessárias
GRANT ALL ON vendas TO authenticated;
GRANT ALL ON historico_vendas TO authenticated;
GRANT SELECT ON vendas_resumo TO authenticated;
GRANT SELECT ON comissoes_resumo TO authenticated;

-- =============================================
-- SCRIPT CONCLUÍDO
-- =============================================

-- Para verificar se tudo foi criado corretamente, execute:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('vendas', 'historico_vendas');
-- SELECT * FROM vendas_resumo LIMIT 5;
-- SELECT * FROM comissoes_resumo LIMIT 5;