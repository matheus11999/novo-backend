const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const logger = require('../config/logger');
const cacheService = require('../config/cache');
const circuitBreakerService = require('../config/circuitBreaker');
const { metricsHelpers, getMetrics, healthCheck: metricsHealthCheck } = require('../config/metrics');

// Health check básico
router.get('/', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0'
    });
});

// Health check detalhado
router.get('/detailed', async (req, res) => {
    const startTime = Date.now();
    
    try {
        logger.info('Performing detailed health check', { component: 'HEALTH_CHECK' });
        
        // Verificar componentes em paralelo
        const [
            databaseHealth,
            cacheHealth,
            circuitBreakerHealth,
            metricsHealth
        ] = await Promise.allSettled([
            checkDatabase(),
            checkCache(),
            checkCircuitBreakers(),
            Promise.resolve(metricsHealthCheck())
        ]);

        const overall = determineOverallHealth([
            databaseHealth,
            cacheHealth,
            circuitBreakerHealth,
            metricsHealth
        ]);

        const healthReport = {
            status: overall.status,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            version: '1.0.0',
            checkDuration: Date.now() - startTime,
            components: {
                database: getComponentResult(databaseHealth),
                cache: getComponentResult(cacheHealth),
                circuitBreakers: getComponentResult(circuitBreakerHealth),
                metrics: getComponentResult(metricsHealth)
            },
            system: {
                memory: process.memoryUsage(),
                cpu: process.cpuUsage(),
                nodeVersion: process.version,
                platform: process.platform
            }
        };

        // Log resultado
        logger.info('Health check completed', {
            component: 'HEALTH_CHECK',
            status: overall.status,
            duration: Date.now() - startTime,
            issues: overall.issues
        });

        // Retornar status HTTP apropriado
        const statusCode = overall.status === 'healthy' ? 200 : 
                          overall.status === 'degraded' ? 200 : 503;
        
        res.status(statusCode).json(healthReport);

    } catch (error) {
        logger.error('Health check failed', {
            component: 'HEALTH_CHECK',
            error: error.message
        });

        res.status(500).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message,
            checkDuration: Date.now() - startTime
        });
    }
});

// Health check específico para Kubernetes/Docker
router.get('/readiness', async (req, res) => {
    try {
        // Verificar se componentes críticos estão prontos
        const [dbCheck, cacheCheck] = await Promise.allSettled([
            checkDatabase(),
            checkCache()
        ]);

        const dbHealthy = dbCheck.status === 'fulfilled' && dbCheck.value.healthy;
        const cacheHealthy = cacheCheck.status === 'fulfilled' && cacheCheck.value.healthy;

        if (dbHealthy && cacheHealthy) {
            res.status(200).json({
                status: 'ready',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(503).json({
                status: 'not_ready',
                timestamp: new Date().toISOString(),
                components: {
                    database: dbHealthy,
                    cache: cacheHealthy
                }
            });
        }
    } catch (error) {
        res.status(503).json({
            status: 'not_ready',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// Liveness probe para Kubernetes
router.get('/liveness', (req, res) => {
    // Verificação simples se a aplicação está rodando
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Endpoint para métricas (Prometheus)
router.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', 'text/plain');
        res.send(await getMetrics());
    } catch (error) {
        logger.error('Failed to get metrics', {
            component: 'HEALTH_CHECK',
            error: error.message
        });
        res.status(500).json({ error: 'Failed to get metrics' });
    }
});

// Verificar status dos serviços
router.get('/services', async (req, res) => {
    try {
        // Importar serviços dinamicamente para evitar dependências circulares
        const OptimizedPaymentPollingService = require('../services/optimizedPaymentPollingService');
        const DailyExpiredPlansService = require('../services/dailyExpiredPlansService');

        const paymentPollingService = new OptimizedPaymentPollingService();
        const expiredPlansService = new DailyExpiredPlansService();

        res.json({
            timestamp: new Date().toISOString(),
            services: {
                paymentPolling: paymentPollingService.getStatus(),
                expiredPlans: expiredPlansService.getStatus(),
                cache: cacheService.getStatus(),
                circuitBreakers: circuitBreakerService.getAllStatus()
            }
        });
    } catch (error) {
        logger.error('Failed to get services status', {
            component: 'HEALTH_CHECK',
            error: error.message
        });
        res.status(500).json({ error: 'Failed to get services status' });
    }
});

// Funções auxiliares para verificação de componentes
async function checkDatabase() {
    const startTime = Date.now();
    
    try {
        // Teste simples de conectividade
        const { data, error } = await supabase
            .from('users')
            .select('count')
            .limit(1);

        if (error) {
            throw new Error(`Database error: ${error.message}`);
        }

        const duration = Date.now() - startTime;
        
        return {
            healthy: true,
            duration,
            details: {
                connected: true,
                responseTime: duration
            }
        };
    } catch (error) {
        const duration = Date.now() - startTime;
        return {
            healthy: false,
            duration,
            error: error.message,
            details: {
                connected: false,
                responseTime: duration
            }
        };
    }
}

async function checkCache() {
    const startTime = Date.now();
    
    try {
        const testKey = 'health_check_test';
        const testValue = { timestamp: Date.now() };
        
        // Teste de escrita
        await cacheService.set(testKey, testValue, 10);
        
        // Teste de leitura
        const retrieved = await cacheService.get(testKey);
        
        // Limpeza
        await cacheService.del(testKey);
        
        const duration = Date.now() - startTime;
        const status = cacheService.getStatus();
        
        return {
            healthy: true,
            duration,
            details: {
                ...status,
                writeRead: retrieved !== null,
                responseTime: duration
            }
        };
    } catch (error) {
        const duration = Date.now() - startTime;
        const status = cacheService.getStatus();
        
        return {
            healthy: false,
            duration,
            error: error.message,
            details: {
                ...status,
                responseTime: duration
            }
        };
    }
}

async function checkCircuitBreakers() {
    try {
        const health = circuitBreakerService.healthCheck();
        
        return {
            healthy: health.overall === 'healthy',
            details: health
        };
    } catch (error) {
        return {
            healthy: false,
            error: error.message
        };
    }
}

function determineOverallHealth(checks) {
    const results = checks.map(check => 
        check.status === 'fulfilled' ? check.value : { healthy: false }
    );
    
    const healthyCount = results.filter(r => r.healthy).length;
    const totalCount = results.length;
    
    const issues = results
        .filter(r => !r.healthy)
        .map(r => r.error || 'Unknown error');
    
    if (healthyCount === totalCount) {
        return { status: 'healthy', issues: [] };
    } else if (healthyCount >= totalCount * 0.5) {
        return { status: 'degraded', issues };
    } else {
        return { status: 'unhealthy', issues };
    }
}

function getComponentResult(check) {
    if (check.status === 'fulfilled') {
        return check.value;
    } else {
        return {
            healthy: false,
            error: check.reason?.message || 'Unknown error'
        };
    }
}

module.exports = router;