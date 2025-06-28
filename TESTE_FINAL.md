# 🧪 Teste Final do Sistema MikroTik

## 📋 Pré-requisitos

1. **MikroTik API VPS2 rodando** em `http://localhost:3000`
2. **Credenciais atualizadas** no Supabase
3. **Backend VPS1** rodando em porta diferente (ex: 3001)

## 🔧 Configuração

### 1. Atualizar credenciais no Supabase
Execute o SQL:
```sql
-- Copie e execute no Supabase SQL Editor
UPDATE mikrotiks 
SET 
    ip = '10.66.66.7',
    usuario = 'admin',
    senha = '2605',
    porta = 8728,
    updated_at = NOW()
WHERE id = 'b5cf26c0-8581-49ec-80b1-d765aacff841';
```

### 2. Configurar porta do backend
Edite o `.env` para usar porta 3001:
```bash
PORT=3001
```

### 3. Verificar configuração da API MikroTik
```bash
# .env deve ter:
MIKROTIK_API_URL=http://localhost:3000
MIKROTIK_API_TOKEN=a7f8e9d2c1b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0
```

## 🚀 Executar Testes

### 1. Iniciar serviços
```bash
# Terminal 1: MikroTik API (porta 3000)
cd /path/to/mikrotik-api-vps2
npm start

# Terminal 2: Backend VPS1 (porta 3001)
cd /path/to/mikropix-backend-vps1
npm start
```

### 2. Executar testes sequenciais

#### Teste 1: Verificar conectividade
```bash
curl http://localhost:3001/health
```

#### Teste 2: Testar MikroTik API local
```bash
node test_local_mikrotik.js
```

#### Teste 3: Testar nova rota de gerenciamento
```bash
node test_new_route.js
```

#### Teste 4: Testar endpoint específico
```bash
curl -X POST http://localhost:3001/api/mikrotik-user/manage-user \
  -H "Content-Type: application/json" \
  -d '{
    "mikrotik_id": "b5cf26c0-8581-49ec-80b1-d765aacff841",
    "mac_address": "00:11:22:33:44:55",
    "username": "001122334455",
    "password": "001122334455",
    "profile": "default",
    "comment": "Teste final"
  }'
```

## ✅ Resultados Esperados

### Se tudo funcionar:
- ✅ MikroTik API responde em localhost:3000
- ✅ Backend responde em localhost:3001
- ✅ Usuário é deletado (se existir)
- ✅ Novo usuário é criado no MikroTik
- ✅ Credenciais: username=001122334455, password=001122334455

### Logs esperados:
```
🔧 [MIKROTIK-USER] Managing user for MAC: 00:11:22:33:44:55
✅ [MIKROTIK-USER] MikroTik found: 10.66.66.7
🗑️ [MIKROTIK-USER] Searching for existing user with MAC: 00:11:22:33:44:55
👤 [MIKROTIK-USER] Creating new user: 001122334455
✅ [MIKROTIK-USER] User created successfully
```

## 🔧 Troubleshooting

### Erro "Connection refused"
- Verificar se MikroTik API está rodando na porta 3000
- Verificar se backend está na porta 3001

### Erro "Username or password invalid"
- Verificar credenciais no Supabase
- Confirmar IP: 10.66.66.7, user: admin, senha: 2605

### Erro "User creation failed"
- Verificar se profile 'default' existe no MikroTik
- Verificar logs da MikroTik API para detalhes

## 🚀 Deploy para Produção

Quando os testes funcionarem localmente:

### 1. Atualizar .env para produção:
```bash
MIKROTIK_API_URL=http://193.181.208.141:3000
PORT=3000
NODE_ENV=production
```

### 2. Fazer deploy:
```bash
git push origin main
```

### 3. Testar em produção:
```bash
curl -X POST https://api.mikropix.online/api/mikrotik-user/manage-user \
  -H "Content-Type: application/json" \
  -d '{
    "mikrotik_id": "b5cf26c0-8581-49ec-80b1-d765aacff841",
    "mac_address": "00:11:22:33:44:66",
    "username": "001122334466",
    "password": "001122334466"
  }'
```

## 📊 Endpoints Implementados

- `POST /api/mikrotik-user/manage-user` - Gerenciar (deletar + criar)
- `POST /api/mikrotik-user/delete-user` - Apenas deletar
- `POST /api/mikrotik-user/create-user` - Apenas criar
- `POST /api/payment/create-captive` - Criar pagamento PIX
- `POST /api/webhook/mercadopago` - Webhook MercadoPago

## 🎯 Fluxo Completo PIX

1. Usuário acessa captive portal
2. Escolhe plano e gera PIX
3. Paga PIX no banco
4. MercadoPago envia webhook
5. Sistema deleta usuário existente (se houver)
6. Sistema cria novo usuário no MikroTik
7. Distribui comissões
8. Usuário recebe credenciais e conecta

**Sistema completo e pronto para uso! 🎉**