-- Add automatic withdrawal support to the saques table
ALTER TABLE saques ADD COLUMN IF NOT EXISTS automatico BOOLEAN DEFAULT FALSE;

-- Create function to automatically create withdrawal requests when balance reaches R$ 50
CREATE OR REPLACE FUNCTION process_automatic_withdrawal()
RETURNS TRIGGER AS $$
DECLARE
    user_pix_key VARCHAR(255);
    withdrawal_amount DECIMAL(10,2);
BEGIN
    -- Only process if user has automatic withdrawal enabled and balance >= 50
    IF NEW.saque_automatico = true AND NEW.saldo >= 50.00 AND (OLD.saldo IS NULL OR OLD.saldo < 50.00) THEN
        
        -- Get user's PIX key from chave_pix field
        SELECT chave_pix INTO user_pix_key FROM users WHERE id = NEW.id;
        
        -- Only proceed if user has a PIX key configured
        IF user_pix_key IS NOT NULL AND user_pix_key != '' THEN
            
            -- Set withdrawal amount to fixed R$ 50.00
            withdrawal_amount := 50.00;
            
            -- Create automatic withdrawal request
            INSERT INTO saques (
                id,
                user_id,
                valor,
                metodo_pagamento,
                chave_pix,
                status,
                automatico,
                observacoes,
                created_at
            ) VALUES (
                gen_random_uuid(),
                NEW.id,
                withdrawal_amount,
                'pix',
                user_pix_key,
                'pendente',
                true,
                CONCAT('Saque automático de R$ 50,00 - Saldo disponível: R$ ', NEW.saldo::text),
                NOW()
            );
            
            -- Log the automatic withdrawal creation
            RAISE NOTICE 'Automatic withdrawal created for user % with amount %', NEW.id, withdrawal_amount;
            
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to execute automatic withdrawal function when user balance changes
DROP TRIGGER IF EXISTS automatic_withdrawal_trigger ON users;
CREATE TRIGGER automatic_withdrawal_trigger
    AFTER UPDATE OF saldo ON users
    FOR EACH ROW
    EXECUTE FUNCTION process_automatic_withdrawal();

-- Add index for better performance on automatic withdrawal queries
CREATE INDEX IF NOT EXISTS idx_users_saque_automatico_saldo ON users(saque_automatico, saldo) WHERE saque_automatico = true;
CREATE INDEX IF NOT EXISTS idx_saques_automatico ON saques(automatico) WHERE automatico = true;

-- Update existing saques to mark manual withdrawals (optional - for data consistency)
UPDATE saques SET automatico = false WHERE automatico IS NULL;

COMMENT ON COLUMN saques.automatico IS 'Indicates if the withdrawal was automatically generated when user balance reached R$ 50.00';
COMMENT ON FUNCTION process_automatic_withdrawal() IS 'Automatically creates withdrawal requests when user balance reaches R$ 50 and automatic withdrawal is enabled';
COMMENT ON TRIGGER automatic_withdrawal_trigger ON users IS 'Triggers automatic withdrawal creation when user balance is updated and conditions are met';