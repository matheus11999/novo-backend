-- Enhanced Planos Table Schema for MikroTik Hotspot Management
-- Execute this in Supabase SQL Editor to add/update the planos table

-- Create or update the planos table
CREATE TABLE IF NOT EXISTS public.planos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    mikrotik_id UUID NOT NULL REFERENCES public.mikrotiks(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    descricao TEXT,
    valor DECIMAL(10,2) NOT NULL CHECK (valor >= 0),
    
    -- Time settings
    minutos INTEGER, -- Duration in minutes (nullable for unlimited)
    session_timeout TEXT, -- MikroTik format (e.g., "3600", "1h")
    idle_timeout TEXT, -- MikroTik format (e.g., "300", "5m")
    
    -- Speed settings
    velocidade_download TEXT, -- e.g., "1M", "10M"
    velocidade_upload TEXT, -- e.g., "512k", "1M"
    rate_limit TEXT, -- MikroTik format "upload/download" (e.g., "1M/1M")
    
    -- Data limits
    limite_dados TEXT, -- e.g., "1G", "unlimited"
    
    -- Status and visibility
    ativo BOOLEAN DEFAULT true NOT NULL,
    visivel BOOLEAN DEFAULT true NOT NULL, -- Whether to show in public plans
    
    -- Ordering and organization
    ordem INTEGER DEFAULT 0 NOT NULL, -- For sorting plans
    
    -- MikroTik integration
    mikrotik_profile_id TEXT, -- Reference to MikroTik profile ID
    
    -- Advanced hotspot settings
    shared_users INTEGER DEFAULT 1 CHECK (shared_users > 0),
    add_mac_cookie BOOLEAN DEFAULT true,
    mac_cookie_timeout TEXT DEFAULT '1d',
    keepalive_timeout TEXT DEFAULT '2m',
    status_autorefresh TEXT DEFAULT '1m',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_planos_mikrotik_id ON public.planos(mikrotik_id);
CREATE INDEX IF NOT EXISTS idx_planos_ativo ON public.planos(ativo);
CREATE INDEX IF NOT EXISTS idx_planos_visivel ON public.planos(visivel);
CREATE INDEX IF NOT EXISTS idx_planos_ordem ON public.planos(ordem);
CREATE INDEX IF NOT EXISTS idx_planos_mikrotik_profile_id ON public.planos(mikrotik_profile_id);
CREATE INDEX IF NOT EXISTS idx_planos_created_at ON public.planos(created_at);

-- Create trigger for updated_at
CREATE TRIGGER update_planos_updated_at BEFORE UPDATE ON public.planos 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only manage plans from their own mikrotiks
CREATE POLICY "Users can manage plans from own mikrotiks" ON public.planos
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.mikrotiks 
            WHERE id = planos.mikrotik_id AND user_id = auth.uid()
        )
    );

-- Function to sync plan with MikroTik profile
CREATE OR REPLACE FUNCTION sync_plan_with_mikrotik()
RETURNS TRIGGER AS $$
BEGIN
    -- This function can be extended to call MikroTik API
    -- For now, it just logs the sync requirement
    
    -- If mikrotik_profile_id is provided, it means the plan is synced
    IF NEW.mikrotik_profile_id IS NOT NULL THEN
        -- Update rate_limit based on upload/download speeds
        IF NEW.velocidade_upload IS NOT NULL AND NEW.velocidade_download IS NOT NULL THEN
            NEW.rate_limit = NEW.velocidade_upload || '/' || NEW.velocidade_download;
        END IF;
        
        -- Convert minutes to session_timeout if not provided
        IF NEW.session_timeout IS NULL AND NEW.minutos IS NOT NULL THEN
            NEW.session_timeout = (NEW.minutos * 60)::text;
        END IF;
        
        -- Set default idle_timeout if not provided
        IF NEW.idle_timeout IS NULL THEN
            NEW.idle_timeout = '300';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to sync plan data
CREATE TRIGGER sync_plan_with_mikrotik_trigger 
    BEFORE INSERT OR UPDATE ON public.planos 
    FOR EACH ROW EXECUTE FUNCTION sync_plan_with_mikrotik();

-- Comments for documentation
COMMENT ON TABLE public.planos IS 'Hotspot plans with MikroTik integration and enhanced features';
COMMENT ON COLUMN public.planos.mikrotik_id IS 'Reference to the MikroTik router';
COMMENT ON COLUMN public.planos.valor IS 'Plan price in currency';
COMMENT ON COLUMN public.planos.minutos IS 'Plan duration in minutes (null for unlimited)';
COMMENT ON COLUMN public.planos.mikrotik_profile_id IS 'MikroTik profile ID for synchronization';
COMMENT ON COLUMN public.planos.rate_limit IS 'MikroTik format rate limit (upload/download)';
COMMENT ON COLUMN public.planos.ordem IS 'Display order for plan sorting';
COMMENT ON COLUMN public.planos.visivel IS 'Whether plan is visible to customers';

-- Insert sample plans (optional - remove if not needed)
/*
INSERT INTO public.planos (
    mikrotik_id, 
    nome, 
    descricao, 
    valor, 
    minutos, 
    velocidade_upload, 
    velocidade_download,
    ativo, 
    visivel, 
    ordem
) VALUES 
-- These will need actual mikrotik_id values
(
    '00000000-0000-0000-0000-000000000000', -- Replace with actual mikrotik_id
    '1 Hora - 1MB',
    'Plano de 1 hora com velocidade de 1MB',
    5.00,
    60,
    '1M',
    '1M',
    true,
    true,
    1
),
(
    '00000000-0000-0000-0000-000000000000', -- Replace with actual mikrotik_id
    '24 Horas - 5MB',
    'Plano de 24 horas com velocidade de 5MB',
    15.00,
    1440,
    '5M',
    '5M',
    true,
    true,
    2
);
*/