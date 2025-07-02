-- Fix: Add missing porcentagem_usuario column to vendas_pix table
-- This fixes the error: "Could not find the 'porcentagem_usuario' column of 'vendas_pix' in the schema cache"

-- Add the missing column
ALTER TABLE vendas_pix 
ADD COLUMN IF NOT EXISTS porcentagem_usuario NUMERIC(5,2) DEFAULT 90.00;

-- Update existing records to have the correct percentage
UPDATE vendas_pix 
SET porcentagem_usuario = 90.00 
WHERE porcentagem_usuario IS NULL;

-- Add comment to document the column
COMMENT ON COLUMN vendas_pix.porcentagem_usuario IS 'Percentage that goes to the user (default 90%)';

-- Update porcentagem_admin for existing records if not set
UPDATE vendas_pix 
SET porcentagem_admin = 10.00 
WHERE porcentagem_admin IS NULL OR porcentagem_admin = 0;

-- Add comment to document the admin column
COMMENT ON COLUMN vendas_pix.porcentagem_admin IS 'Percentage that goes to admin (default 10%)';

-- Verify the changes
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'vendas_pix' 
    AND column_name IN ('porcentagem_admin', 'porcentagem_usuario')
ORDER BY column_name;

-- Show sample data to verify
SELECT 
    id,
    valor_total,
    valor_admin,
    valor_usuario,
    porcentagem_admin,
    porcentagem_usuario,
    created_at
FROM vendas_pix 
ORDER BY created_at DESC 
LIMIT 5;