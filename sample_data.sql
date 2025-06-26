-- Sample data for testing the MikroTik Payment System
-- Run this after creating the main schema

-- Insert sample mikrotik (using the data you provided)
INSERT INTO "public"."mikrotiks" (
    "id", 
    "nome", 
    "user_id", 
    "porcentagem", 
    "ativo", 
    "ip",
    "usuario",
    "senha",
    "token", 
    "created_at", 
    "updated_at"
) VALUES (
    '0c6f2d19-202b-470d-87c1-c0caee460e65',
    'MikroTik Principal',
    '5441fa11-b66e-4c53-b30c-01ebbe14e58a',
    10.00,
    true,
    '192.168.1.1',
    'admin',
    'password123',
    'b56334f7-cd50-4e70-bd8b-d30acdb821a5',
    '2025-06-25 19:00:53.563+00',
    '2025-06-25 19:04:40.188872+00'
);

-- Insert sample plans for the mikrotik
INSERT INTO "public"."planos" (
    "mikrotik_id",
    "name",
    "idle_timeout",
    "keepalive_timeout", 
    "status_autorefresh",
    "shared_users",
    "add_mac_cookie",
    "mac_cookie_timeout",
    "session_timeout",
    "rate_limit",
    "preco",
    "ativo"
) VALUES 
(
    '0c6f2d19-202b-470d-87c1-c0caee460e65',
    '1hora',
    'none',
    '2m',
    '1m',
    1,
    true,
    '1d',
    '1h',
    '5M/5M',
    5.00,
    true
),
(
    '0c6f2d19-202b-470d-87c1-c0caee460e65',
    '3horas',
    'none',
    '2m',
    '1m',
    1,
    true,
    '1d',
    '3h',
    '10M/10M',
    12.00,
    true
),
(
    '0c6f2d19-202b-470d-87c1-c0caee460e65',
    '24horas',
    'none',
    '2m',
    '1m',
    1,
    true,
    '1d',
    '24h',
    '20M/20M',
    25.00,
    true
),
(
    '0c6f2d19-202b-470d-87c1-c0caee460e65',
    '7dias',
    'none',
    '2m',
    '1m',
    1,
    true,
    '7d',
    '7d',
    '50M/50M',
    50.00,
    true
);

-- Note: After inserting this sample data, you can test the API using:
-- X-API-Token: b56334f7-cd50-4e70-bd8b-d30acdb821a5