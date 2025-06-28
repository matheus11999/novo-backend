-- Tabela de vendas com suporte a pagamentos PIX via captive portal
CREATE TABLE IF NOT EXISTS vendas (
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

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_vendas_payment_id ON vendas(payment_id);
CREATE INDEX IF NOT EXISTS idx_vendas_mac_address ON vendas(mac_address);
CREATE INDEX IF NOT EXISTS idx_vendas_mikrotik_id ON vendas(mikrotik_id);
CREATE INDEX IF NOT EXISTS idx_vendas_mercadopago_id ON vendas(mercadopago_payment_id);
CREATE INDEX IF NOT EXISTS idx_vendas_status ON vendas(status);
CREATE INDEX IF NOT EXISTS idx_vendas_created_at ON vendas(created_at);

-- Histórico de transações para comissões
CREATE TABLE IF NOT EXISTS historico_vendas (
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
CREATE INDEX IF NOT EXISTS idx_historico_venda_id ON historico_vendas(venda_id);
CREATE INDEX IF NOT EXISTS idx_historico_user_id ON historico_vendas(user_id);
CREATE INDEX IF NOT EXISTS idx_historico_tipo ON historico_vendas(tipo);
CREATE INDEX IF NOT EXISTS idx_historico_status ON historico_vendas(status);

-- Trigger para atualizar updated_at automaticamente
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

-- Adicionar campo porcentagem_admin na tabela mikrotiks se não existir
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

-- Comentários nas tabelas
COMMENT ON TABLE vendas IS 'Tabela de vendas realizadas via captive portal com pagamento PIX';
COMMENT ON TABLE historico_vendas IS 'Histórico de transações para distribuição de comissões';

COMMENT ON COLUMN vendas.payment_id IS 'ID único do pagamento gerado internamente';
COMMENT ON COLUMN vendas.mac_address IS 'MAC address do dispositivo do cliente';
COMMENT ON COLUMN vendas.valor_admin IS 'Valor que fica para o admin (comissão)';
COMMENT ON COLUMN vendas.valor_usuario IS 'Valor que fica para o dono do MikroTik';
COMMENT ON COLUMN vendas.usuario_criado IS 'Username criado no MikroTik (geralmente o MAC limpo)';
COMMENT ON COLUMN vendas.senha_usuario IS 'Senha criada no MikroTik (geralmente o MAC limpo)';

-- Views úteis para relatórios
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

COMMENT ON VIEW vendas_resumo IS 'View resumida das vendas com informações dos planos e MikroTiks';

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

COMMENT ON VIEW comissoes_resumo IS 'View resumida das comissões geradas por vendas';

-- Dados de exemplo (opcional - remover em produção)
-- INSERT INTO vendas (mikrotik_id, plano_id, payment_id, status, valor_total, valor_admin, valor_usuario, mac_address) VALUES
-- ('uuid-do-mikrotik', 'uuid-do-plano', 'payment-123', 'completed', 29.90, 2.99, 26.91, '00:11:22:33:44:55');

-- Permissões (ajustar conforme necessário)
-- GRANT ALL ON vendas TO authenticated;
-- GRANT ALL ON historico_vendas TO authenticated;
-- GRANT SELECT ON vendas_resumo TO authenticated;
-- GRANT SELECT ON comissoes_resumo TO authenticated;