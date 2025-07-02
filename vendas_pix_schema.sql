-- ============================================================================
-- SCHEMA COMPLETO VENDAS PIX - SISTEMA MIKROTIK COM COMISSÕES CORRIGIDAS
-- Execute este SQL no Supabase para criar a nova estrutura vendas_pix
-- ============================================================================

-- Criar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TABELA PRINCIPAL VENDAS_PIX (substitui vendas antiga)
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendas_pix (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mikrotik_id UUID NOT NULL REFERENCES mikrotiks(id) ON DELETE CASCADE,
    plano_id UUID REFERENCES planos(id) ON DELETE SET NULL,
    payment_id VARCHAR(255) UNIQUE NOT NULL, -- UUID gerado internamente
    
    -- Status da venda
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired', 'cancelled', 'processing')),
    
    -- Valores financeiros (LÓGICA CORRIGIDA)
    valor_total DECIMAL(10,2) NOT NULL DEFAULT 0,
    valor_admin DECIMAL(10,2) NOT NULL DEFAULT 0,    -- Admin recebe RESTO (90%)
    valor_usuario DECIMAL(10,2) NOT NULL DEFAULT 0,  -- Usuário recebe PORCENTAGEM (10%)
    porcentagem_admin DECIMAL(5,2) NOT NULL DEFAULT 90.00, -- Porcentagem que fica para admin
    
    -- Dados MercadoPago
    mercadopago_payment_id VARCHAR(255),
    mercadopago_status VARCHAR(50),
    qr_code TEXT, -- QR Code base64
    pix_code TEXT, -- Código PIX para copia e cola
    
    -- Dados do cliente (captive portal)
    mac_address VARCHAR(17), -- Formato XX:XX:XX:XX:XX:XX (pode ser NULL para vendas diretas)
    ip_address INET,
    user_agent TEXT,
    
    -- Credenciais criadas no MikroTik
    usuario_criado VARCHAR(255),
    senha_usuario VARCHAR(255),
    mikrotik_user_id VARCHAR(255), -- ID do usuário no MikroTik (.id)
    
    -- Dados do plano (pode vir de planos ou ser extraído de comentário)
    plano_nome VARCHAR(255),
    plano_valor DECIMAL(10,2),
    plano_session_timeout VARCHAR(50),
    plano_rate_limit VARCHAR(50),
    
    -- Status de criação do usuário MikroTik
    mikrotik_user_created BOOLEAN DEFAULT FALSE,
    mikrotik_creation_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'success', 'failed', 'retrying'
    mikrotik_creation_attempts INTEGER DEFAULT 0,
    mikrotik_creation_error TEXT,
    mikrotik_created_at TIMESTAMP WITH TIME ZONE,
    mikrotik_last_attempt_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    expires_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Mensagens de erro (se houver)
    error_message TEXT
);

-- ============================================================================
-- 2. TABELA DE COMISSÕES (vendas_pix_comissoes)
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendas_pix_comissoes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    venda_pix_id UUID NOT NULL REFERENCES vendas_pix(id) ON DELETE CASCADE,
    mikrotik_id UUID NOT NULL REFERENCES mikrotiks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- ID do usuário que recebe a comissão
    
    -- Tipo da comissão
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('admin', 'usuario')),
    
    -- Valores da comissão
    valor DECIMAL(10,2) NOT NULL CHECK (valor >= 0),
    percentual DECIMAL(5,2) NOT NULL CHECK (percentual >= 0 AND percentual <= 100),
    
    -- Descrição e status
    descricao TEXT,
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
    
    -- Dados desnormalizados para relatórios
    plano_nome VARCHAR(255),
    plano_valor DECIMAL(10,2),
    mac_address VARCHAR(17),
    payment_id VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 3. ÍNDICES PARA PERFORMANCE
-- ============================================================================

-- Índices vendas_pix
CREATE INDEX IF NOT EXISTS idx_vendas_pix_payment_id ON vendas_pix(payment_id);
CREATE INDEX IF NOT EXISTS idx_vendas_pix_mac_address ON vendas_pix(mac_address);
CREATE INDEX IF NOT EXISTS idx_vendas_pix_mikrotik_id ON vendas_pix(mikrotik_id);
CREATE INDEX IF NOT EXISTS idx_vendas_pix_mercadopago_id ON vendas_pix(mercadopago_payment_id);
CREATE INDEX IF NOT EXISTS idx_vendas_pix_status ON vendas_pix(status);
CREATE INDEX IF NOT EXISTS idx_vendas_pix_created_at ON vendas_pix(created_at);
CREATE INDEX IF NOT EXISTS idx_vendas_pix_paid_at ON vendas_pix(paid_at);
CREATE INDEX IF NOT EXISTS idx_vendas_pix_mikrotik_creation_status ON vendas_pix(mikrotik_creation_status);
CREATE INDEX IF NOT EXISTS idx_vendas_pix_mikrotik_user_created ON vendas_pix(mikrotik_user_created);

-- Índices vendas_pix_comissoes
CREATE INDEX IF NOT EXISTS idx_comissoes_venda_pix_id ON vendas_pix_comissoes(venda_pix_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_user_id ON vendas_pix_comissoes(user_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_mikrotik_id ON vendas_pix_comissoes(mikrotik_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_tipo ON vendas_pix_comissoes(tipo);
CREATE INDEX IF NOT EXISTS idx_comissoes_status ON vendas_pix_comissoes(status);
CREATE INDEX IF NOT EXISTS idx_comissoes_created_at ON vendas_pix_comissoes(created_at);
CREATE INDEX IF NOT EXISTS idx_comissoes_payment_id ON vendas_pix_comissoes(payment_id);

-- ============================================================================
-- 4. TRIGGERS PARA UPDATED_AT AUTOMÁTICO
-- ============================================================================

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_vendas_pix_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
DROP TRIGGER IF EXISTS update_vendas_pix_updated_at_trigger ON vendas_pix;
CREATE TRIGGER update_vendas_pix_updated_at_trigger 
    BEFORE UPDATE ON vendas_pix 
    FOR EACH ROW 
    EXECUTE FUNCTION update_vendas_pix_updated_at();

DROP TRIGGER IF EXISTS update_vendas_pix_comissoes_updated_at_trigger ON vendas_pix_comissoes;
CREATE TRIGGER update_vendas_pix_comissoes_updated_at_trigger 
    BEFORE UPDATE ON vendas_pix_comissoes 
    FOR EACH ROW 
    EXECUTE FUNCTION update_vendas_pix_updated_at();

-- ============================================================================
-- 5. VERIFICAR E ADICIONAR CAMPOS NECESSÁRIOS EM MIKROTIKS
-- ============================================================================

-- Adicionar porcentagem (usuário MikroTik recebe)
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'mikrotiks' AND column_name = 'porcentagem'
    ) THEN
        ALTER TABLE mikrotiks 
        ADD COLUMN porcentagem DECIMAL(5,2) DEFAULT 10.00 
        CHECK (porcentagem >= 0 AND porcentagem <= 100);
    END IF;
END $$;

-- Adicionar campos de conexão se não existirem
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'mikrotiks' AND column_name = 'ip'
    ) THEN
        ALTER TABLE mikrotiks ADD COLUMN ip VARCHAR(45);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'mikrotiks' AND column_name = 'username'
    ) THEN
        ALTER TABLE mikrotiks ADD COLUMN username VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'mikrotiks' AND column_name = 'password'
    ) THEN
        ALTER TABLE mikrotiks ADD COLUMN password VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'mikrotiks' AND column_name = 'port'
    ) THEN
        ALTER TABLE mikrotiks ADD COLUMN port INTEGER DEFAULT 8728;
    END IF;
END $$;

-- ============================================================================
-- 6. VIEWS PARA RELATÓRIOS
-- ============================================================================

-- View resumida das vendas PIX
CREATE OR REPLACE VIEW vendas_pix_resumo AS
SELECT 
    v.id,
    v.payment_id,
    v.status,
    v.valor_total,
    v.valor_admin,
    v.valor_usuario,
    v.porcentagem_admin,
    100 - v.porcentagem_admin as porcentagem_usuario,
    v.mac_address,
    v.usuario_criado,
    v.senha_usuario,
    v.plano_nome,
    v.plano_valor,
    v.mikrotik_user_created,
    v.mikrotik_creation_status,
    v.created_at,
    v.paid_at,
    v.expires_at,
    COALESCE(m.nome, 'MikroTik') as mikrotik_nome,
    COALESCE(p.nome, v.plano_nome) as plano_nome_final,
    COALESCE(p.preco, v.plano_valor) as plano_valor_final,
    m.ip as mikrotik_ip,
    m.porcentagem as mikrotik_porcentagem_configurada
FROM vendas_pix v
LEFT JOIN mikrotiks m ON v.mikrotik_id = m.id
LEFT JOIN planos p ON v.plano_id = p.id
ORDER BY v.created_at DESC;

-- View para comissões PIX
CREATE OR REPLACE VIEW vendas_pix_comissoes_resumo AS
SELECT 
    c.id,
    c.tipo,
    c.valor,
    c.percentual,
    c.status,
    c.descricao,
    c.plano_nome,
    c.plano_valor,
    c.mac_address,
    c.payment_id,
    c.created_at,
    v.status as venda_status,
    v.valor_total as venda_valor_total,
    COALESCE(m.nome, 'MikroTik') as mikrotik_nome,
    u.nome as usuario_nome,
    u.email as usuario_email
FROM vendas_pix_comissoes c
JOIN vendas_pix v ON c.venda_pix_id = v.id
LEFT JOIN mikrotiks m ON c.mikrotik_id = m.id
LEFT JOIN users u ON c.user_id = u.id
ORDER BY c.created_at DESC;

-- View para análise de performance de vendas
CREATE OR REPLACE VIEW vendas_pix_analytics AS
SELECT 
    DATE(v.created_at) as data,
    m.nome as mikrotik_nome,
    m.id as mikrotik_id,
    COUNT(*) as total_vendas,
    COUNT(CASE WHEN v.status = 'completed' THEN 1 END) as vendas_completadas,
    COUNT(CASE WHEN v.status = 'pending' THEN 1 END) as vendas_pendentes,
    COUNT(CASE WHEN v.status = 'failed' THEN 1 END) as vendas_falhadas,
    SUM(v.valor_total) as receita_total,
    SUM(v.valor_admin) as receita_admin,
    SUM(v.valor_usuario) as receita_usuario,
    AVG(v.valor_total) as ticket_medio,
    COUNT(CASE WHEN v.mikrotik_user_created = true THEN 1 END) as usuarios_criados_sucesso
FROM vendas_pix v
LEFT JOIN mikrotiks m ON v.mikrotik_id = m.id
GROUP BY DATE(v.created_at), m.nome, m.id
ORDER BY data DESC, total_vendas DESC;

-- ============================================================================
-- 7. FUNÇÕES ÚTEIS
-- ============================================================================

-- Função para obter estatísticas de comissões
CREATE OR REPLACE FUNCTION get_comissoes_stats(
    p_user_id UUID DEFAULT NULL,
    p_mikrotik_id UUID DEFAULT NULL,
    p_start_date TIMESTAMP DEFAULT NULL,
    p_end_date TIMESTAMP DEFAULT NULL
)
RETURNS TABLE (
    total_comissoes BIGINT,
    valor_total_admin DECIMAL(10,2),
    valor_total_usuario DECIMAL(10,2),
    valor_total_geral DECIMAL(10,2),
    periodo_inicio TIMESTAMP,
    periodo_fim TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_comissoes,
        SUM(CASE WHEN c.tipo = 'admin' THEN c.valor ELSE 0 END) as valor_total_admin,
        SUM(CASE WHEN c.tipo = 'usuario' THEN c.valor ELSE 0 END) as valor_total_usuario,
        SUM(c.valor) as valor_total_geral,
        COALESCE(p_start_date, MIN(c.created_at)) as periodo_inicio,
        COALESCE(p_end_date, MAX(c.created_at)) as periodo_fim
    FROM vendas_pix_comissoes c
    WHERE (p_user_id IS NULL OR c.user_id = p_user_id)
      AND (p_mikrotik_id IS NULL OR c.mikrotik_id = p_mikrotik_id)
      AND (p_start_date IS NULL OR c.created_at >= p_start_date)
      AND (p_end_date IS NULL OR c.created_at <= p_end_date)
      AND c.status = 'completed';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. COMENTÁRIOS E DOCUMENTAÇÃO
-- ============================================================================

COMMENT ON TABLE vendas_pix IS 'Tabela principal de vendas PIX com comissões corrigidas - usuário MikroTik recebe porcentagem, admin recebe resto';
COMMENT ON TABLE vendas_pix_comissoes IS 'Histórico detalhado de comissões para cada venda PIX';

COMMENT ON COLUMN vendas_pix.payment_id IS 'ID único do pagamento gerado internamente';
COMMENT ON COLUMN vendas_pix.valor_admin IS 'Valor que fica para o admin (RESTO = 100% - porcentagem_usuario)';
COMMENT ON COLUMN vendas_pix.valor_usuario IS 'Valor que fica para o dono do MikroTik (PORCENTAGEM configurada)';
COMMENT ON COLUMN vendas_pix.porcentagem_admin IS 'Porcentagem calculada que fica para admin (100 - porcentagem_usuario)';
COMMENT ON COLUMN vendas_pix.mac_address IS 'MAC address do dispositivo do cliente (pode ser NULL para vendas diretas)';
COMMENT ON COLUMN vendas_pix.plano_nome IS 'Nome do plano - pode vir da tabela planos ou ser extraído de comentário';
COMMENT ON COLUMN vendas_pix.plano_valor IS 'Valor do plano - pode vir da tabela planos ou ser extraído de comentário';

COMMENT ON VIEW vendas_pix_resumo IS 'View resumida das vendas PIX com informações completas';
COMMENT ON VIEW vendas_pix_comissoes_resumo IS 'View detalhada das comissões por venda PIX';
COMMENT ON VIEW vendas_pix_analytics IS 'View para análise de performance de vendas PIX';

-- ============================================================================
-- 9. RLS (ROW LEVEL SECURITY) - Opcional
-- ============================================================================

-- Habilitar RLS se necessário
-- ALTER TABLE vendas_pix ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE vendas_pix_comissoes ENABLE ROW LEVEL SECURITY;

-- Políticas de exemplo (ajustar conforme necessário)
-- CREATE POLICY "Users can view own mikrotik sales" ON vendas_pix
--     FOR SELECT USING (
--         mikrotik_id IN (
--             SELECT id FROM mikrotiks WHERE user_id = auth.uid()
--         )
--     );

-- ============================================================================
-- 10. VERIFICAÇÃO FINAL
-- ============================================================================

-- Verificar se tudo foi criado corretamente
DO $$
DECLARE
    vendas_count INTEGER;
    comissoes_count INTEGER;
    views_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO vendas_count FROM information_schema.tables 
    WHERE table_name = 'vendas_pix' AND table_schema = 'public';
    
    SELECT COUNT(*) INTO comissoes_count FROM information_schema.tables 
    WHERE table_name = 'vendas_pix_comissoes' AND table_schema = 'public';
    
    SELECT COUNT(*) INTO views_count FROM information_schema.views 
    WHERE table_name IN ('vendas_pix_resumo', 'vendas_pix_comissoes_resumo', 'vendas_pix_analytics');
    
    RAISE NOTICE 'Criação concluída:';
    RAISE NOTICE '✅ Tabela vendas_pix: %', CASE WHEN vendas_count > 0 THEN 'OK' ELSE 'ERRO' END;
    RAISE NOTICE '✅ Tabela vendas_pix_comissoes: %', CASE WHEN comissoes_count > 0 THEN 'OK' ELSE 'ERRO' END;
    RAISE NOTICE '✅ Views de relatório: % de 3', views_count;
    RAISE NOTICE '✅ Lógica de comissão: Usuário MikroTik recebe PORCENTAGEM, Admin recebe RESTO';
END $$;

SELECT '🎉 Schema vendas_pix criado com sucesso! A lógica de comissão foi corrigida.' as resultado; 