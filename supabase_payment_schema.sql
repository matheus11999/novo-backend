-- Payment System Schema for MercadoPago Integration
-- This schema extends the existing database structure

-- Create enum types for payment statuses
CREATE TYPE payment_status AS ENUM (
  'pending',
  'approved', 
  'authorized',
  'in_process',
  'in_mediation',
  'rejected',
  'cancelled',
  'refunded',
  'charged_back'
);

CREATE TYPE payment_method AS ENUM (
  'pix',
  'credit_card',
  'debit_card',
  'ticket',
  'bank_transfer'
);

CREATE TYPE webhook_event_type AS ENUM (
  'payment',
  'plan',
  'subscription',
  'invoice',
  'point_integration_wh',
  'mp-connect',
  'delivery-cancellation'
);

-- Payments table - stores all payment attempts and their status
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mikrotik_id UUID REFERENCES mikrotiks(id) ON DELETE SET NULL,
  
  -- MercadoPago specific fields
  mp_payment_id BIGINT UNIQUE, -- MercadoPago payment ID
  mp_preference_id VARCHAR(255), -- MercadoPago preference ID
  
  -- Payment details
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'BRL',
  description TEXT,
  external_reference VARCHAR(255), -- Our internal reference
  
  -- Payment method and status
  payment_method payment_method,
  payment_status payment_status DEFAULT 'pending',
  
  -- Plan details (for internet plans)
  plan_name VARCHAR(255),
  plan_minutes INTEGER,
  plan_value DECIMAL(10,2),
  mac_address VARCHAR(17), -- MAC address for hotspot
  
  -- Timestamps
  approved_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Additional MercadoPago data (JSON for flexibility)
  mp_data JSONB,
  
  -- Indexes
  CONSTRAINT payments_amount_positive CHECK (amount > 0)
);

-- Webhook events table - stores all webhook notifications from MercadoPago
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  
  -- Webhook identification
  webhook_id BIGINT, -- MercadoPago webhook ID
  event_type webhook_event_type NOT NULL,
  action VARCHAR(50), -- created, updated, etc.
  
  -- Related payment
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  mp_payment_id BIGINT, -- MercadoPago payment ID from webhook
  
  -- Webhook data
  raw_data JSONB NOT NULL, -- Complete webhook payload
  processed BOOLEAN DEFAULT FALSE,
  processing_error TEXT,
  
  -- Timestamps
  webhook_date TIMESTAMP WITH TIME ZONE,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  
  -- Ensure we don't process the same webhook twice
  UNIQUE(webhook_id, event_type, action)
);

-- Payment attempts table - tracks retry attempts and failures
CREATE TABLE payment_attempts (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  
  -- Attempt details
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status payment_status NOT NULL,
  error_code VARCHAR(100),
  error_message TEXT,
  
  -- MercadoPago response data
  mp_response JSONB,
  
  -- Timestamps
  attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(payment_id, attempt_number)
);

-- MercadoPago credentials table - stores API credentials per user/mikrotik
CREATE TABLE mp_credentials (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mikrotik_id UUID REFERENCES mikrotiks(id) ON DELETE CASCADE,
  
  -- Credentials
  access_token TEXT NOT NULL,
  public_key TEXT,
  client_id VARCHAR(255),
  client_secret TEXT,
  
  -- Configuration
  webhook_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_sandbox BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Ensure one active credential per mikrotik
  UNIQUE(mikrotik_id, is_active) WHERE is_active = TRUE
);

-- Refunds table - tracks refund operations
CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Refund details
  mp_refund_id BIGINT UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  reason VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  
  -- Admin details
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  
  -- Timestamps
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  approved_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT refunds_amount_positive CHECK (amount > 0)
);

-- Create indexes for better performance
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_mp_payment_id ON payments(mp_payment_id);
CREATE INDEX idx_payments_status ON payments(payment_status);
CREATE INDEX idx_payments_created_at ON payments(created_at);
CREATE INDEX idx_payments_mac_address ON payments(mac_address);

CREATE INDEX idx_webhook_events_mp_payment_id ON webhook_events(mp_payment_id);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX idx_webhook_events_received_at ON webhook_events(received_at);

CREATE INDEX idx_payment_attempts_payment_id ON payment_attempts(payment_id);
CREATE INDEX idx_payment_attempts_status ON payment_attempts(status);

CREATE INDEX idx_mp_credentials_user_id ON mp_credentials(user_id);
CREATE INDEX idx_mp_credentials_mikrotik_id ON mp_credentials(mikrotik_id);
CREATE INDEX idx_mp_credentials_active ON mp_credentials(is_active);

CREATE INDEX idx_refunds_payment_id ON refunds(payment_id);
CREATE INDEX idx_refunds_status ON refunds(status);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mp_credentials_updated_at BEFORE UPDATE ON mp_credentials 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to process webhook and update payment status
CREATE OR REPLACE FUNCTION process_payment_webhook(webhook_data JSONB)
RETURNS VOID AS $$
DECLARE
    payment_record payments%ROWTYPE;
    webhook_payment_id BIGINT;
    webhook_status VARCHAR(50);
BEGIN
    -- Extract payment ID and status from webhook data
    webhook_payment_id := (webhook_data->>'id')::BIGINT;
    webhook_status := webhook_data->>'status';
    
    -- Find the payment record
    SELECT * INTO payment_record FROM payments 
    WHERE mp_payment_id = webhook_payment_id;
    
    IF FOUND THEN
        -- Update payment status
        UPDATE payments 
        SET 
            payment_status = webhook_status::payment_status,
            approved_at = CASE 
                WHEN webhook_status = 'approved' THEN NOW() 
                ELSE approved_at 
            END,
            mp_data = webhook_data,
            updated_at = NOW()
        WHERE id = payment_record.id;
        
        -- If payment is approved, create a credit transaction
        IF webhook_status = 'approved' THEN
            INSERT INTO transacoes (
                user_id, 
                tipo, 
                motivo, 
                valor, 
                referencia_id, 
                referencia_tipo,
                saldo_anterior,
                saldo_atual
            ) VALUES (
                payment_record.user_id,
                'credito',
                'Pagamento aprovado - ' || payment_record.description,
                payment_record.amount,
                payment_record.id,
                'payment',
                (SELECT saldo FROM users WHERE id = payment_record.user_id),
                (SELECT saldo FROM users WHERE id = payment_record.user_id) + payment_record.amount
            );
            
            -- Update user balance
            UPDATE users 
            SET saldo = saldo + payment_record.amount 
            WHERE id = payment_record.user_id;
            
            -- If it's a plan purchase, create a sale record
            IF payment_record.plan_name IS NOT NULL THEN
                INSERT INTO vendas (
                    user_id,
                    mikrotik_id,
                    valor,
                    plano_nome,
                    plano_valor,
                    plano_minutos,
                    mac_address,
                    comissao_valor
                ) VALUES (
                    payment_record.user_id,
                    payment_record.mikrotik_id,
                    payment_record.amount,
                    payment_record.plan_name,
                    payment_record.plan_value,
                    payment_record.plan_minutes,
                    payment_record.mac_address,
                    payment_record.amount * (
                        SELECT porcentagem / 100.0 
                        FROM mikrotiks 
                        WHERE id = payment_record.mikrotik_id
                    )
                );
            END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate payment link
CREATE OR REPLACE FUNCTION create_payment_preference(
    p_user_id UUID,
    p_mikrotik_id UUID,
    p_amount DECIMAL,
    p_description TEXT,
    p_plan_name VARCHAR DEFAULT NULL,
    p_plan_minutes INTEGER DEFAULT NULL,
    p_mac_address VARCHAR DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    payment_id UUID;
    external_ref VARCHAR(255);
BEGIN
    -- Generate external reference
    external_ref := 'payment_' || extract(epoch from now())::bigint || '_' || substr(gen_random_uuid()::text, 1, 8);
    
    -- Create payment record
    INSERT INTO payments (
        user_id,
        mikrotik_id,
        amount,
        description,
        external_reference,
        plan_name,
        plan_minutes,
        plan_value,
        mac_address
    ) VALUES (
        p_user_id,
        p_mikrotik_id,
        p_amount,
        p_description,
        external_ref,
        p_plan_name,
        p_plan_minutes,
        p_amount,
        p_mac_address
    ) RETURNING id INTO payment_id;
    
    RETURN payment_id;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security (RLS) policies
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

-- Users can only see their own payments
CREATE POLICY "Users can view their own payments" ON payments
    FOR SELECT USING (auth.uid()::uuid = user_id);

-- Users can create payments for themselves
CREATE POLICY "Users can create their own payments" ON payments
    FOR INSERT WITH CHECK (auth.uid()::uuid = user_id);

-- Admins can see all payments
CREATE POLICY "Admins can view all payments" ON payments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid()::uuid AND role = 'admin'
        )
    );

-- Similar policies for other tables
CREATE POLICY "Users can view their own credentials" ON mp_credentials
    FOR SELECT USING (auth.uid()::uuid = user_id);

CREATE POLICY "Admins can manage all credentials" ON mp_credentials
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid()::uuid AND role = 'admin'
        )
    );

-- Webhook events can be inserted by service role only
CREATE POLICY "Service role can manage webhooks" ON webhook_events
    FOR ALL USING (auth.role() = 'service_role');

-- Service role can manage payment attempts
CREATE POLICY "Service role can manage payment attempts" ON payment_attempts
    FOR ALL USING (auth.role() = 'service_role');

-- Users can view their own refunds
CREATE POLICY "Users can view their own refunds" ON refunds
    FOR SELECT USING (auth.uid()::uuid = user_id);

-- Admins can manage all refunds
CREATE POLICY "Admins can manage all refunds" ON refunds
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid()::uuid AND role = 'admin'
        )
    );

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON payments TO authenticated;
GRANT SELECT ON webhook_events TO authenticated;
GRANT SELECT ON payment_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON mp_credentials TO authenticated;
GRANT SELECT, INSERT ON refunds TO authenticated;

-- Service role needs full access for webhook processing
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Comments for documentation
COMMENT ON TABLE payments IS 'Stores all payment transactions with MercadoPago integration';
COMMENT ON TABLE webhook_events IS 'Stores webhook notifications from MercadoPago for payment status updates';
COMMENT ON TABLE payment_attempts IS 'Tracks payment retry attempts and failures for debugging';
COMMENT ON TABLE mp_credentials IS 'Stores MercadoPago API credentials per user/mikrotik';
COMMENT ON TABLE refunds IS 'Tracks refund operations and their status';

COMMENT ON FUNCTION process_payment_webhook(JSONB) IS 'Processes MercadoPago webhook notifications and updates payment status';
COMMENT ON FUNCTION create_payment_preference(UUID, UUID, DECIMAL, TEXT, VARCHAR, INTEGER, VARCHAR) IS 'Creates a new payment record and returns the payment ID for MercadoPago preference creation';