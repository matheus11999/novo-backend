-- Adicionar coluna para template personalizado de senhas na tabela mikrotiks
-- Execute este SQL no Supabase SQL Editor

ALTER TABLE mikrotiks 
ADD COLUMN IF NOT EXISTS custom_password_template TEXT DEFAULT NULL;

-- Adicionar comentário explicativo
COMMENT ON COLUMN mikrotiks.custom_password_template IS 'Template HTML personalizado para impressão de senhas de usuários hotspot';

-- Verificar se a coluna foi adicionada
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default 
FROM information_schema.columns 
WHERE table_name = 'mikrotiks' 
AND column_name = 'custom_password_template';