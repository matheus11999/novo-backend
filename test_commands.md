# 🧪 Comandos de Teste para MikroTik

## 1. Testar Criação de Usuário MikroTik

```bash
curl -X POST http://localhost:3000/api/test/create-mikrotik-user \
  -H "Content-Type: application/json" \
  -d '{
    "mikrotik_id": "b5cf26c0-8581-49ec-80b1-d765aacff841",
    "mac_address": "00:11:22:33:44:55",
    "plano_nome": "Plano 5MB"
  }'
```

## 2. Testar Deleção de Usuário MikroTik

```bash
curl -X POST http://localhost:3000/api/test/delete-mikrotik-user \
  -H "Content-Type: application/json" \
  -d '{
    "mikrotik_id": "b5cf26c0-8581-49ec-80b1-d765aacff841",
    "mac_address": "00:11:22:33:44:55"
  }'
```

## 3. Testar Health Check

```bash
curl http://localhost:3000/health
```

## 4. Testar Endpoint de Planos

```bash
curl -X POST http://localhost:3000/api/payment/plans-by-mikrotik \
  -H "Content-Type: application/json" \
  -d '{
    "mikrotik_id": "b5cf26c0-8581-49ec-80b1-d765aacff841"
  }'
```

## 5. Executar Script de Teste

```bash
# Certifique-se que o servidor está rodando primeiro
npm start

# Em outro terminal
node test_mikrotik_user.js
```

## 6. Configurar Variáveis de Ambiente

Certifique-se que seu .env tem:

```bash
MIKROTIK_API_URL=http://ip-do-seu-vps2:3000
MIKROTIK_API_TOKEN=seu_token_aqui
SUPABASE_URL=sua_url_supabase
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
```

## 7. Verificar Logs do Servidor

Os logs mostrarão:
- 🧪 [TEST] para operações de teste
- 🗑️ Para deleções de usuário
- 👤 Para criação de usuário
- ✅ Para sucessos
- ❌ Para erros

## 8. Endpoints Disponíveis

- `GET /health` - Health check
- `POST /api/test/create-mikrotik-user` - Criar usuário teste
- `POST /api/test/delete-mikrotik-user` - Deletar usuário teste
- `POST /api/payment/plans-by-mikrotik` - Listar planos
- `POST /api/payment/create-captive` - Criar pagamento PIX
- `POST /api/payment/status-captive` - Status pagamento
- `POST /api/webhook/mercadopago` - Webhook MercadoPago