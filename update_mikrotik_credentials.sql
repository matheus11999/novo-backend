-- Atualizar credenciais do MikroTik com as informações corretas
UPDATE mikrotiks 
SET 
    ip = '10.66.66.7',
    usuario = 'admin',
    senha = '2605',
    porta = 8728,
    updated_at = NOW()
WHERE id = 'b5cf26c0-8581-49ec-80b1-d765aacff841';

-- Verificar se a atualização foi realizada
SELECT 
    id,
    nome,
    ip,
    usuario,
    senha,
    porta,
    ativo,
    porcentagem_admin
FROM mikrotiks 
WHERE id = 'b5cf26c0-8581-49ec-80b1-d765aacff841';