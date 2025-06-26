-- Database Schema for MikroTik Payment System

-- Table: mikrotiks
CREATE TABLE IF NOT EXISTS "public"."mikrotiks" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "nome" VARCHAR(255) NOT NULL,
    "user_id" UUID NOT NULL,
    "porcentagem" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    "ativo" BOOLEAN DEFAULT true,
    "ip" VARCHAR(15),
    "usuario" VARCHAR(100),
    "senha" VARCHAR(255),
    "token" UUID DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: planos
CREATE TABLE IF NOT EXISTS "public"."planos" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "mikrotik_id" UUID NOT NULL REFERENCES mikrotiks(id) ON DELETE CASCADE,
    "name" VARCHAR(255) NOT NULL,
    "idle_timeout" VARCHAR(50) DEFAULT 'none',
    "keepalive_timeout" VARCHAR(50) DEFAULT '2m',
    "status_autorefresh" VARCHAR(50) DEFAULT '1m',
    "shared_users" INTEGER DEFAULT 1,
    "add_mac_cookie" BOOLEAN DEFAULT true,
    "mac_cookie_timeout" VARCHAR(50) DEFAULT '1d',
    "session_timeout" VARCHAR(50) NOT NULL,
    "rate_limit" VARCHAR(50) NOT NULL,
    "preco" DECIMAL(10,2) NOT NULL,
    "ativo" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: vendas
CREATE TABLE IF NOT EXISTS "public"."vendas" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "mikrotik_id" UUID NOT NULL REFERENCES mikrotiks(id),
    "plano_id" UUID NOT NULL REFERENCES planos(id),
    "payment_id" VARCHAR(255) UNIQUE NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "valor_total" DECIMAL(10,2) NOT NULL,
    "valor_admin" DECIMAL(10,2) NOT NULL,
    "valor_usuario" DECIMAL(10,2) NOT NULL,
    "usuario_criado" VARCHAR(255),
    "senha_usuario" VARCHAR(255),
    "mercadopago_payment_id" VARCHAR(255),
    "mercadopago_status" VARCHAR(50),
    "qr_code" TEXT,
    "pix_code" TEXT,
    "expires_at" TIMESTAMP WITH TIME ZONE,
    "paid_at" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: historico_vendas
CREATE TABLE IF NOT EXISTS "public"."historico_vendas" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "venda_id" UUID NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
    "mikrotik_id" UUID NOT NULL REFERENCES mikrotiks(id),
    "user_id" UUID NOT NULL,
    "tipo" VARCHAR(50) NOT NULL, -- 'admin' ou 'usuario'
    "valor" DECIMAL(10,2) NOT NULL,
    "descricao" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_mikrotiks_user_id ON mikrotiks(user_id);
CREATE INDEX IF NOT EXISTS idx_mikrotiks_token ON mikrotiks(token);
CREATE INDEX IF NOT EXISTS idx_planos_mikrotik_id ON planos(mikrotik_id);
CREATE INDEX IF NOT EXISTS idx_vendas_mikrotik_id ON vendas(mikrotik_id);
CREATE INDEX IF NOT EXISTS idx_vendas_payment_id ON vendas(payment_id);
CREATE INDEX IF NOT EXISTS idx_vendas_mercadopago_payment_id ON vendas(mercadopago_payment_id);
CREATE INDEX IF NOT EXISTS idx_historico_vendas_venda_id ON historico_vendas(venda_id);
CREATE INDEX IF NOT EXISTS idx_historico_vendas_user_id ON historico_vendas(user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_mikrotiks_updated_at BEFORE UPDATE ON mikrotiks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_planos_updated_at BEFORE UPDATE ON planos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vendas_updated_at BEFORE UPDATE ON vendas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data for planos (1 hora plan)
-- Note: This will need to be updated with actual mikrotik_id after mikrotiks are created