# 🚀 Deployment no EasyPanel - Backend VPS1

## 📋 Configuração para EasyPanel

### 1. **Configuração do Redis**

Sua configuração Redis do EasyPanel:
```env
REDIS_URL=redis://default:260520jm@frontend_mikrotik:6379
```

### 2. **Arquivo .env para Produção**

Copie o arquivo `.env.easypanel.example` para `.env` e configure:

```env
# Configuração básica
NODE_ENV=production
PORT=3000
TZ=America/Sao_Paulo

# Redis do EasyPanel
REDIS_URL=redis://default:260520jm@frontend_mikrotik:6379

# Suas configurações
SUPABASE_URL=https://uyxmptrxgycuybtdthtb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
MERCADOPAGO_ACCESS_TOKEN=your-mercadopago-token
MIKROTIK_API_URL=http://your-mikrotik-api:3000
MIKROTIK_API_TOKEN=your-mikrotik-token

# Logging para produção
LOG_LEVEL=info

# CORS para suas URLs
CORS_ORIGINS=https://mikropix.online,https://api.mikropix.online
```

## 🐳 Configuração Docker (EasyPanel)

### 1. **Dockerfile Otimizado**

```dockerfile
FROM node:18-alpine

# Instalar dependências do sistema
RUN apk add --no-cache dumb-init

# Criar diretório da aplicação
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production && npm cache clean --force

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S backend -u 1001

# Copiar código da aplicação
COPY --chown=backend:nodejs . .

# Criar diretório de logs
RUN mkdir -p logs && chown -R backend:nodejs logs

# Mudar para usuário não-root
USER backend

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/liveness', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Comando para iniciar
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
```

### 2. **.dockerignore**

```dockerignore
node_modules
npm-debug.log
.env
.env.local
.env.*.local
logs/*.log
*.md
.git
.gitignore
coverage
.nyc_output
```

## 🔧 Configuração no EasyPanel

### 1. **Variáveis de Ambiente**

No painel do EasyPanel, configure estas variáveis:

```env
NODE_ENV=production
PORT=3000
TZ=America/Sao_Paulo

# Redis
REDIS_URL=redis://default:260520jm@frontend_mikrotik:6379

# Supabase
SUPABASE_URL=https://uyxmptrxgycuybtdthtb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-actual-service-role-key

# MercadoPago
MERCADOPAGO_ACCESS_TOKEN=your-actual-mp-token
MERCADOPAGO_PUBLIC_KEY=your-actual-mp-public-key

# MikroTik API
MIKROTIK_API_URL=http://your-mikrotik-api-service:3000
MIKROTIK_API_TOKEN=your-actual-mikrotik-token

# Performance
LOG_LEVEL=info
PAYMENT_POLLING_INTERVAL=60000
BATCH_SIZE=20
MAX_CONCURRENCY=5

# Security
JWT_SECRET=your-super-secure-jwt-secret-minimum-32-characters
API_TOKEN=your-internal-api-token-minimum-32-characters

# CORS
CORS_ORIGINS=https://mikropix.online,https://api.mikropix.online
```

### 2. **Configurações de Container**

- **CPU**: 1-2 cores
- **Memory**: 1-2GB
- **Port**: 3000
- **Health Check**: `/health/liveness`
- **Readiness Check**: `/health/readiness`

### 3. **Volume para Logs (Opcional)**

Se quiser persistir logs:
```
/app/logs -> volume persistent
```

## 🚀 Deploy Steps

### 1. **Preparar o Código**

```bash
# Fazer build local (se necessário)
npm install
npm run build # se tiver build step

# Commit changes
git add .
git commit -m "Production deployment with optimizations"
git push
```

### 2. **Configurar no EasyPanel**

1. **Criar novo serviço** no EasyPanel
2. **Conectar repositório** GitHub
3. **Configurar variáveis** de ambiente
4. **Definir porta** 3000
5. **Configurar health checks**:
   - Liveness: `/health/liveness`
   - Readiness: `/health/readiness`

### 3. **Configurar DNS e Load Balancer**

```nginx
# Configuração Nginx (se usar)
upstream mikropix_backend {
    server backend-container:3000;
}

server {
    listen 80;
    server_name api.mikropix.online;
    
    location / {
        proxy_pass http://mikropix_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Health checks
        proxy_connect_timeout 10s;
        proxy_send_timeout 10s;
        proxy_read_timeout 10s;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://mikropix_backend/health;
        access_log off;
    }
}
```

## 📊 Monitoramento

### 1. **Health Checks**

Verificar se a aplicação está funcionando:

```bash
# Health check básico
curl https://api.mikropix.online/health

# Health check detalhado
curl https://api.mikropix.online/health/detailed

# Métricas
curl https://api.mikropix.online/health/metrics
```

### 2. **Logs**

```bash
# Ver logs do container (EasyPanel)
docker logs -f container-name

# Ou através do painel EasyPanel
# Acessar: Logs -> Real-time logs
```

### 3. **Status dos Serviços**

```bash
# Verificar status dos serviços internos
curl https://api.mikropix.online/health/services
```

## 🔧 Troubleshooting

### 1. **Redis Connection Issues**

Se houver problemas com Redis:

```bash
# Verificar se Redis está acessível
docker exec -it redis-container redis-cli ping

# Testar conexão com sua URL
redis-cli -u redis://default:260520jm@frontend_mikrotik:6379 ping
```

### 2. **Performance Issues**

Verificar métricas:
```bash
curl https://api.mikropix.online/health/detailed
```

### 3. **Logs de Debug**

Temporariamente aumentar log level:
```env
LOG_LEVEL=debug
```

## 📈 Otimizações para Produção

### 1. **Configurações de Node.js**

```env
NODE_OPTIONS="--max-old-space-size=1024 --optimize-for-size"
```

### 2. **PM2 (Alternativa)**

Se quiser usar PM2 no lugar do npm start:

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'mikropix-backend',
    script: './src/server.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

### 3. **Configurações de Cache**

Para melhor performance:
```env
CACHE_TTL=600        # 10 minutos
BATCH_SIZE=30        # Lotes maiores
MAX_CONCURRENCY=8    # Mais concorrência
```

## ✅ Checklist de Deploy

- [ ] Variáveis de ambiente configuradas
- [ ] Redis funcionando e acessível
- [ ] Health checks respondendo
- [ ] Logs sendo gerados
- [ ] Métricas disponíveis
- [ ] Polling services iniciados
- [ ] Circuit breakers funcionando
- [ ] CORS configurado para produção
- [ ] Rate limiting ativo

## 🎯 URLs Finais

Após deploy, estas URLs devem funcionar:

- **Health**: `https://api.mikropix.online/health`
- **Detailed Health**: `https://api.mikropix.online/health/detailed`
- **Metrics**: `https://api.mikropix.online/health/metrics`
- **Services**: `https://api.mikropix.online/health/services`

---

**✅ Pronto para produção com todas as otimizações implementadas!**