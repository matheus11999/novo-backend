const promClient = require('prom-client');
const logger = require('./logger');

// Configurar coletor padrão
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 10000 });

// Métricas customizadas
const metrics = {
  // Contador de requests HTTP
  httpRequestsTotal: new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
  }),

  // Duração de requests HTTP
  httpRequestDuration: new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5, 10]
  }),

  // Contador de queries do banco
  databaseQueriesTotal: new promClient.Counter({
    name: 'database_queries_total',
    help: 'Total number of database queries',
    labelNames: ['table', 'operation', 'status']
  }),

  // Duração de queries do banco
  databaseQueryDuration: new promClient.Histogram({
    name: 'database_query_duration_seconds',
    help: 'Duration of database queries in seconds',
    labelNames: ['table', 'operation'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
  }),

  // Contador de pagamentos processados
  paymentsProcessedTotal: new promClient.Counter({
    name: 'payments_processed_total',
    help: 'Total number of payments processed',
    labelNames: ['status', 'source']
  }),

  // Duração do polling de pagamentos
  paymentPollingDuration: new promClient.Histogram({
    name: 'payment_polling_duration_seconds',
    help: 'Duration of payment polling cycles',
    buckets: [1, 5, 10, 30, 60, 120]
  }),

  // Gauge para pagamentos pendentes
  pendingPaymentsGauge: new promClient.Gauge({
    name: 'pending_payments',
    help: 'Number of pending payments'
  }),

  // Contador de operações do MikroTik
  mikrotikOperationsTotal: new promClient.Counter({
    name: 'mikrotik_operations_total',
    help: 'Total number of MikroTik operations',
    labelNames: ['operation', 'status']
  }),

  // Duração de operações do MikroTik
  mikrotikOperationDuration: new promClient.Histogram({
    name: 'mikrotik_operation_duration_seconds',
    help: 'Duration of MikroTik operations',
    labelNames: ['operation'],
    buckets: [0.5, 1, 2, 5, 10, 15, 30]
  }),

  // Gauge para conexões ativas do MikroTik
  mikrotikActiveConnections: new promClient.Gauge({
    name: 'mikrotik_active_connections',
    help: 'Number of active MikroTik connections'
  }),

  // Contador de circuit breaker
  circuitBreakerTotal: new promClient.Counter({
    name: 'circuit_breaker_total',
    help: 'Total circuit breaker events',
    labelNames: ['name', 'event']
  }),

  // Gauge para status do circuit breaker
  circuitBreakerStatus: new promClient.Gauge({
    name: 'circuit_breaker_status',
    help: 'Circuit breaker status (0=closed, 1=open, 2=half-open)',
    labelNames: ['name']
  }),

  // Contador de cache hits/misses
  cacheOperationsTotal: new promClient.Counter({
    name: 'cache_operations_total',
    help: 'Total cache operations',
    labelNames: ['operation', 'result']
  }),

  // Gauge para usuários ativos
  activeUsersGauge: new promClient.Gauge({
    name: 'active_users',
    help: 'Number of active users'
  }),

  // Contador de assinaturas expiradas
  expiredSubscriptionsTotal: new promClient.Counter({
    name: 'expired_subscriptions_total',
    help: 'Total number of expired subscriptions processed'
  }),

  // Gauge para uso de memória da aplicação
  memoryUsageGauge: new promClient.Gauge({
    name: 'nodejs_memory_usage_bytes',
    help: 'Node.js memory usage in bytes',
    labelNames: ['type']
  }),

  // Contador de erros por componente
  errorsTotal: new promClient.Counter({
    name: 'errors_total',
    help: 'Total number of errors',
    labelNames: ['component', 'type']
  })
};

// Função para atualizar métricas de memória
const updateMemoryMetrics = () => {
  const memUsage = process.memoryUsage();
  metrics.memoryUsageGauge.set({ type: 'rss' }, memUsage.rss);
  metrics.memoryUsageGauge.set({ type: 'heapTotal' }, memUsage.heapTotal);
  metrics.memoryUsageGauge.set({ type: 'heapUsed' }, memUsage.heapUsed);
  metrics.memoryUsageGauge.set({ type: 'external' }, memUsage.external);
  metrics.memoryUsageGauge.set({ type: 'arrayBuffers' }, memUsage.arrayBuffers);
};

// Atualizar métricas de memória a cada 30 segundos
setInterval(updateMemoryMetrics, 30000);

// Middleware para coletar métricas HTTP
const httpMetricsMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const route = req.route?.path || req.path || 'unknown';
  
  // Incrementar contador de requests
  metrics.httpRequestsTotal.inc({
    method: req.method,
    route: route,
    status_code: 'pending'
  });

  // Wrapper para capturar resposta
  const originalSend = res.send;
  res.send = function(data) {
    const duration = (Date.now() - startTime) / 1000;
    
    // Atualizar métricas
    metrics.httpRequestDuration.observe({
      method: req.method,
      route: route,
      status_code: res.statusCode
    }, duration);
    
    // Decrementar contador pendente e incrementar com status final
    metrics.httpRequestsTotal.inc({
      method: req.method,
      route: route,
      status_code: res.statusCode
    });
    
    return originalSend.call(this, data);
  };

  next();
};

// Helpers para métricas específicas
const metricsHelpers = {
  // Registrar query do banco
  recordDatabaseQuery: (table, operation, duration, success = true) => {
    metrics.databaseQueriesTotal.inc({
      table,
      operation,
      status: success ? 'success' : 'error'
    });
    
    if (success) {
      metrics.databaseQueryDuration.observe({
        table,
        operation
      }, duration / 1000);
    }
  },

  // Registrar operação do MikroTik
  recordMikrotikOperation: (operation, duration, success = true) => {
    metrics.mikrotikOperationsTotal.inc({
      operation,
      status: success ? 'success' : 'error'
    });
    
    if (success) {
      metrics.mikrotikOperationDuration.observe({
        operation
      }, duration / 1000);
    }
  },

  // Registrar pagamento processado
  recordPaymentProcessed: (status, source = 'polling') => {
    metrics.paymentsProcessedTotal.inc({
      status,
      source
    });
  },

  // Registrar operação de cache
  recordCacheOperation: (operation, result) => {
    metrics.cacheOperationsTotal.inc({
      operation,
      result
    });
  },

  // Registrar evento do circuit breaker
  recordCircuitBreakerEvent: (name, event) => {
    metrics.circuitBreakerTotal.inc({
      name,
      event
    });
  },

  // Atualizar status do circuit breaker
  updateCircuitBreakerStatus: (name, status) => {
    let statusCode;
    switch (status) {
      case 'CLOSED': statusCode = 0; break;
      case 'OPEN': statusCode = 1; break;
      case 'HALF_OPEN': statusCode = 2; break;
      default: statusCode = -1;
    }
    
    metrics.circuitBreakerStatus.set({ name }, statusCode);
  },

  // Registrar erro
  recordError: (component, errorType) => {
    metrics.errorsTotal.inc({
      component,
      type: errorType
    });
  },

  // Atualizar gauge de pagamentos pendentes
  updatePendingPayments: (count) => {
    metrics.pendingPaymentsGauge.set(count);
  },

  // Atualizar gauge de usuários ativos
  updateActiveUsers: (count) => {
    metrics.activeUsersGauge.set(count);
  },

  // Atualizar conexões ativas do MikroTik
  updateMikrotikConnections: (count) => {
    metrics.mikrotikActiveConnections.set(count);
  },

  // Registrar assinatura expirada
  recordExpiredSubscription: () => {
    metrics.expiredSubscriptionsTotal.inc();
  },

  // Registrar duração do polling
  recordPollingDuration: (duration) => {
    metrics.paymentPollingDuration.observe(duration / 1000);
  }
};

// Função para obter todas as métricas
const getMetrics = () => {
  return promClient.register.metrics();
};

// Função para reset das métricas (útil para testes)
const resetMetrics = () => {
  promClient.register.clear();
  logger.warn('Metrics registry cleared', { component: 'METRICS' });
};

// Health check das métricas
const healthCheck = () => {
  try {
    const metrics = promClient.register.getMetricsAsJSON();
    return {
      status: 'healthy',
      metricsCount: metrics.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Metrics health check failed', {
      component: 'METRICS',
      error: error.message
    });
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

// Inicializar métricas de memória
updateMemoryMetrics();

logger.info('Metrics system initialized', {
  component: 'METRICS',
  metricsCount: Object.keys(metrics).length
});

module.exports = {
  metrics,
  metricsHelpers,
  httpMetricsMiddleware,
  getMetrics,
  resetMetrics,
  healthCheck
};