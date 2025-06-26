-- Migration to add required fields for MikroTik API integration
-- Execute this in your database

-- Add new columns if they don't exist
ALTER TABLE mikrotiks 
ADD COLUMN IF NOT EXISTS ip TEXT,
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS password TEXT,
ADD COLUMN IF NOT EXISTS port INTEGER DEFAULT 8728,
ADD COLUMN IF NOT EXISTS token TEXT;

-- Update existing records to use proper field names if migrating from old schema
-- UPDATE mikrotiks SET ip = ip_address WHERE ip IS NULL AND ip_address IS NOT NULL;
-- UPDATE mikrotiks SET username = usuario WHERE username IS NULL AND usuario IS NOT NULL;
-- UPDATE mikrotiks SET password = senha WHERE password IS NULL AND senha IS NOT NULL;
-- UPDATE mikrotiks SET port = porta WHERE port IS NULL AND porta IS NOT NULL;

-- Add constraints
ALTER TABLE mikrotiks 
ADD CONSTRAINT mikrotiks_port_check CHECK (port > 0 AND port <= 65535);

-- Generate tokens for existing records that don't have them
UPDATE mikrotiks SET token = gen_random_uuid()::text WHERE token IS NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_mikrotiks_user_id ON mikrotiks(user_id);
CREATE INDEX IF NOT EXISTS idx_mikrotiks_token ON mikrotiks(token);
CREATE INDEX IF NOT EXISTS idx_mikrotiks_ativo ON mikrotiks(ativo);