-- Adicionar campos para rastrear criação de usuários no MikroTik
-- Execute no Supabase SQL Editor

-- 1. Adicionar campos na tabela vendas para rastrear criação no MikroTik
ALTER TABLE vendas 
ADD COLUMN IF NOT EXISTS mikrotik_user_created BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS mikrotik_user_id TEXT,
ADD COLUMN IF NOT EXISTS mikrotik_creation_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS mikrotik_creation_status TEXT DEFAULT 'pending', -- pending, success, failed, retrying
ADD COLUMN IF NOT EXISTS mikrotik_creation_error TEXT,
ADD COLUMN IF NOT EXISTS mikrotik_created_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS mikrotik_last_attempt_at TIMESTAMP WITH TIME ZONE;

-- 2. Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_vendas_mikrotik_creation_status ON vendas(mikrotik_creation_status);
CREATE INDEX IF NOT EXISTS idx_vendas_mikrotik_user_created ON vendas(mikrotik_user_created);
CREATE INDEX IF NOT EXISTS idx_vendas_mikrotik_created_at ON vendas(mikrotik_created_at);

-- 3. Adicionar campos na tabela payments para compatibilidade
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS mikrotik_user_created BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS mikrotik_user_id TEXT,
ADD COLUMN IF NOT EXISTS mikrotik_creation_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS mikrotik_creation_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS mikrotik_creation_error TEXT,
ADD COLUMN IF NOT EXISTS mikrotik_created_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS mikrotik_last_attempt_at TIMESTAMP WITH TIME ZONE;

-- 4. Criar tabela específica para logs de criação de usuários MikroTik
CREATE TABLE IF NOT EXISTS mikrotik_user_creation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venda_id UUID REFERENCES vendas(id),
    payment_id UUID REFERENCES payments(id),
    mikrotik_id UUID REFERENCES mikrotiks(id),
    mac_address TEXT NOT NULL,
    username TEXT NOT NULL,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL, -- pending, success, failed, retrying
    mikrotik_user_id TEXT,
    error_message TEXT,
    request_data JSONB,
    response_data JSONB,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Criar índices para a tabela de logs
CREATE INDEX IF NOT EXISTS idx_mikrotik_logs_venda_id ON mikrotik_user_creation_logs(venda_id);
CREATE INDEX IF NOT EXISTS idx_mikrotik_logs_payment_id ON mikrotik_user_creation_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_mikrotik_logs_mikrotik_id ON mikrotik_user_creation_logs(mikrotik_id);
CREATE INDEX IF NOT EXISTS idx_mikrotik_logs_status ON mikrotik_user_creation_logs(status);
CREATE INDEX IF NOT EXISTS idx_mikrotik_logs_mac_address ON mikrotik_user_creation_logs(mac_address);
CREATE INDEX IF NOT EXISTS idx_mikrotik_logs_created_at ON mikrotik_user_creation_logs(created_at);

-- 6. Criar função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_mikrotik_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Criar trigger para updated_at
DROP TRIGGER IF EXISTS trigger_mikrotik_logs_updated_at ON mikrotik_user_creation_logs;
CREATE TRIGGER trigger_mikrotik_logs_updated_at
    BEFORE UPDATE ON mikrotik_user_creation_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_mikrotik_logs_updated_at();

-- 8. Adicionar comentários nas tabelas
COMMENT ON TABLE mikrotik_user_creation_logs IS 'Log detalhado de tentativas de criação de usuários no MikroTik';
COMMENT ON COLUMN mikrotik_user_creation_logs.venda_id IS 'ID da venda relacionada';
COMMENT ON COLUMN mikrotik_user_creation_logs.payment_id IS 'ID do pagamento relacionado';
COMMENT ON COLUMN mikrotik_user_creation_logs.mikrotik_id IS 'ID do MikroTik onde o usuário foi criado';
COMMENT ON COLUMN mikrotik_user_creation_logs.mac_address IS 'MAC address do usuário';
COMMENT ON COLUMN mikrotik_user_creation_logs.username IS 'Username criado no MikroTik';
COMMENT ON COLUMN mikrotik_user_creation_logs.attempt_number IS 'Número da tentativa (1, 2, 3...)';
COMMENT ON COLUMN mikrotik_user_creation_logs.status IS 'Status da tentativa: pending, success, failed, retrying';
COMMENT ON COLUMN mikrotik_user_creation_logs.mikrotik_user_id IS 'ID retornado pelo MikroTik após criação';
COMMENT ON COLUMN mikrotik_user_creation_logs.error_message IS 'Mensagem de erro se houver falha';
COMMENT ON COLUMN mikrotik_user_creation_logs.request_data IS 'Dados enviados para o MikroTik';
COMMENT ON COLUMN mikrotik_user_creation_logs.response_data IS 'Resposta completa do MikroTik';
COMMENT ON COLUMN mikrotik_user_creation_logs.duration_ms IS 'Duração da requisição em milissegundos';

-- 9. Verificar se as tabelas foram criadas corretamente
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('vendas', 'payments', 'mikrotik_user_creation_logs')
AND column_name LIKE '%mikrotik%'
ORDER BY table_name, ordinal_position;

-- 10. Verificar índices criados
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('vendas', 'payments', 'mikrotik_user_creation_logs')
AND indexname LIKE '%mikrotik%'
ORDER BY tablename, indexname;