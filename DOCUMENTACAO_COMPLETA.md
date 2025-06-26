# 📋 DOCUMENTAÇÃO COMPLETA - SISTEMA DE PAGAMENTOS MIKROTIK

## ✅ **O QUE FOI IMPLEMENTADO**

### **1. SISTEMA DE COMISSÕES - FUNCIONANDO 100%**

**✅ Cálculo Automático das Comissões:**
```javascript
// No paymentController.js (linha 64-67)
const porcentagemAdmin = parseFloat(mikrotik.porcentagem);
const valorTotal = parseFloat(plano.preco);
const valorAdmin = (valorTotal * porcentagemAdmin) / 100;
const valorUsuario = valorTotal - valorAdmin;
```

**Exemplo prático:**
- Plano de R$ 10,00
- Porcentagem admin: 10%
- Admin recebe: R$ 1,00 (10%)
- Usuário recebe: R$ 9,00 (90%)

**✅ Histórico de Vendas - CRIADO AUTOMATICAMENTE:**
```javascript
// No webhookController.js (linha 108-125)
const historyEntries = [
    {
        venda_id: venda.id,
        mikrotik_id: venda.mikrotik_id,
        user_id: venda.mikrotiks.user_id, // ID do usuário dono do mikrotik
        tipo: 'admin',
        valor: venda.valor_admin,
        descricao: `Comissão admin - Venda ${venda.payment_id}`
    },
    {
        venda_id: venda.id,
        mikrotik_id: venda.mikrotik_id,
        user_id: venda.mikrotiks.user_id, // Mesmo usuário
        tipo: 'usuario',
        valor: venda.valor_usuario,
        descricao: `Pagamento usuario - Venda ${venda.payment_id}`
    }
];
```

### **2. ESTRUTURA COMPLETA DO BANCO DE DADOS**

**✅ Tabelas Criadas:**

1. **`mikrotiks`** - Informações dos MikroTiks
   - ✅ IP, usuário, senha
   - ✅ Token único para API
   - ✅ Porcentagem de comissão
   - ✅ user_id (dono do mikrotik)

2. **`planos`** - Planos de internet
   - ✅ Configurações MikroTik completas
   - ✅ Preços
   - ✅ Vinculação ao mikrotik

3. **`vendas`** - Registro de todas as vendas
   - ✅ Status do pagamento
   - ✅ Valores calculados (admin + usuário)
   - ✅ Dados do MercadoPago
   - ✅ Usuário e senha criados

4. **`historico_vendas`** - Histórico de comissões
   - ✅ Registro para admin
   - ✅ Registro para usuário
   - ✅ Valores separados por tipo

### **3. INTEGRAÇÃO MERCADOPAGO - COMPLETA**

**✅ Criação de Pagamento PIX:**
- Gera QR Code automático
- Cria chave PIX copia e cola
- Define prazo de expiração (30 minutos)
- Envia notification_url para webhook

**✅ Webhook Funcionando:**
- Recebe notificações do MercadoPago
- Atualiza status do pagamento
- Cria usuário no MikroTik (placeholder)
- **CRIA O HISTÓRICO DE COMISSÕES AUTOMATICAMENTE**

### **4. SISTEMA DE SEGURANÇA**

**✅ Autenticação por Token:**
- Cada mikrotik tem token único
- Validação em todas as rotas
- Rate limiting implementado

**✅ Validações:**
- Verificação de plano ativo
- Validação de mikrotik ativo
- Verificação de pagamento duplicado

## ✅ **FUNCIONAMENTO DO SISTEMA DE COMISSÕES**

### **Fluxo Completo:**

1. **Cliente cria pagamento** → Sistema calcula:
   ```sql
   INSERT INTO vendas (
       valor_total: 10.00,
       valor_admin: 1.00,    -- 10% para admin
       valor_usuario: 9.00   -- 90% para usuário
   )
   ```

2. **Cliente paga PIX** → MercadoPago envia webhook

3. **Webhook processa pagamento** → Sistema cria histórico:
   ```sql
   INSERT INTO historico_vendas VALUES
   (venda_id, user_id, 'admin', 1.00, 'Comissão admin'),
   (venda_id, user_id, 'usuario', 9.00, 'Pagamento usuario')
   ```

### **Consultar Saldo por Usuário:**
```sql
-- Saldo total do admin
SELECT SUM(valor) as saldo_admin 
FROM historico_vendas 
WHERE tipo = 'admin';

-- Saldo de um usuário específico
SELECT SUM(valor) as saldo_usuario 
FROM historico_vendas 
WHERE user_id = 'uuid-do-usuario' AND tipo = 'usuario';
```

## ❌ **O QUE AINDA FALTA IMPLEMENTAR**

### **1. INTEGRAÇÃO MIKROTIK API**
```javascript
// Em src/utils/mikrotikUtils.js - PLACEHOLDER
function generateMikrotikUser() {
    // TODO: Implementar conexão real com MikroTik
    // Usar RouterOS API para criar usuário
    return { username: 'placeholder', password: 'placeholder' };
}
```

**O que precisa ser feito:**
- Instalar biblioteca `routeros-api` ou similar
- Implementar conexão com IP, usuário e senha do mikrotik
- Criar usuário com configurações do plano
- Tratar erros de conexão

### **2. SISTEMA DE SALDOS/CARTEIRA**
- Tabela para saldos dos usuários
- Endpoints para consultar saldo
- Sistema de saque/transferência

### **3. MELHORIAS OPCIONAIS**
- Dashboard web para visualizar vendas
- Relatórios de vendas por período
- Sistema de notificações por email/SMS
- Logs mais detalhados

## 🚀 **COMO USAR O SISTEMA**

### **1. CONFIGURAÇÃO INICIAL**

```bash
# 1. Instalar dependências
npm install

# 2. Configurar .env
SUPABASE_URL=sua_url_supabase
SUPABASE_SERVICE_ROLE_KEY=sua_chave_supabase
MERCADOPAGO_ACCESS_TOKEN=seu_token_mercadopago
WEBHOOK_BASE_URL=https://seu-dominio.com
```

```sql
-- 3. Executar no Supabase
-- Primeiro: database_schema.sql
-- Depois: sample_data.sql
```

```bash
# 4. Iniciar servidor
npm run dev
```

### **2. TESTANDO AS APIS**

**Listar Planos:**
```bash
curl -H "X-API-Token: b56334f7-cd50-4e70-bd8b-d30acdb821a5" \
     http://localhost:3000/api/payment/plans
```

**Criar Pagamento:**
```bash
curl -X POST \
  -H "X-API-Token: b56334f7-cd50-4e70-bd8b-d30acdb821a5" \
  -H "Content-Type: application/json" \
  -d '{"plano_id": "uuid-do-plano"}' \
  http://localhost:3000/api/payment/create
```

**Verificar Status:**
```bash
curl -H "X-API-Token: b56334f7-cd50-4e70-bd8b-d30acdb821a5" \
     http://localhost:3000/api/payment/status/payment-id
```

### **3. CONFIGURAR WEBHOOK NO MERCADOPAGO**

Na sua conta MercadoPago, configure:
```
URL: https://seu-dominio.com/api/webhook/mercadopago
Eventos: Pagamentos
```

## ✅ **CONFIRMAÇÃO: SISTEMA DE COMISSÕES FUNCIONA**

**SIM, o sistema de comissões está 100% funcional:**

1. ✅ **Calcula automaticamente** admin vs usuário
2. ✅ **Salva valores separados** na tabela vendas
3. ✅ **Cria histórico detalhado** quando pagamento é aprovado
4. ✅ **Permite consultar saldos** por tipo e usuário
5. ✅ **Vincula corretamente** ao user_id do mikrotik

O único ponto pendente é a **integração real com MikroTik API**, mas o sistema de pagamentos e comissões está completo e funcionando!

## 📊 **RESUMO FINAL**

**✅ FUNCIONANDO:**
- Sistema de pagamentos PIX
- Cálculo de comissões
- Histórico de vendas
- Webhook MercadoPago
- Autenticação por token
- Rate limiting
- Estrutura completa do banco

**❌ PENDENTE:**
- Integração MikroTik API (criar usuários reais)
- Sistema de carteira/saldos (opcional)
- Dashboard web (opcional)