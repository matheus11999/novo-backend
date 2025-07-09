require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Importar configurações otimizadas
const logger = require('./config/logger');
const cacheService = require('./config/cache');
const circuitBreakerService = require('./config/circuitBreaker');
const { httpMetricsMiddleware } = require('./config/metrics');

const paymentRoutes = require('./routes/payment');
const webhookRoutes = require('./routes/webhook');
const mikrotikRoutes = require('./routes/mikrotik');
const planosRoutes = require('./routes/planos');
const recentSalesRoutes = require('./routes/recent-sales');
const testRoutes = require('./routes/test');
const mikrotikUserRoutes = require('./routes/mikrotik-user');
const mikrotikRetryRoutes = require('./routes/mikrotik-retry');
const paymentPollingRoutes = require('./routes/payment-polling');
const saquesRoutes = require('./routes/saques');
const usersRoutes = require('./routes/users');
const subscriptionRoutes = require('./routes/subscription');
const expiredPlansRoutes = require('./routes/expired-plans');
const autoTrialRoutes = require('./routes/auto-trial');
const healthRoutes = require('./routes/health');

// Importar serviços otimizados
const OptimizedPaymentPollingService = require('./services/optimizedPaymentPollingService');
const subscriptionPaymentService = require('./services/subscriptionPaymentService');
const DailyExpiredPlansService = require('./services/dailyExpiredPlansService');

const app = express();
const PORT = process.env.PORT || 3000;

// Inicializar serviços
const optimizedPaymentPollingService = new OptimizedPaymentPollingService();
const dailyExpiredPlansService = new DailyExpiredPlansService();

// Trust proxy for accurate IP detection behind reverse proxy
app.set('trust proxy', true);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// CORS configuration - Allow localhost always + production domains
const corsOrigins = [
    'https://mikropix.online', 
    'https://api.mikropix.online',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5174'
];

// In development, allow any origin
const corsConfig = {
    origin: process.env.NODE_ENV === 'development' ? true : corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Token', 'Accept', 'Origin', 'X-Requested-With'],
    preflightContinue: false,
    optionsSuccessStatus: 204
};

logger.info('CORS Configuration', {
    component: 'SERVER',
    environment: process.env.NODE_ENV || 'development',
    origin: corsConfig.origin,
    methods: corsConfig.methods
});

app.use(cors(corsConfig));

// Handle preflight requests explicitly
app.options('*', cors(corsConfig));

// Additional CORS headers for problematic requests
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS,PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Token, Accept, Origin, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        logger.debug('Preflight request handled', { 
            component: 'SERVER',
            path: req.path 
        });
        return res.status(204).end();
    }
    
    next();
});

// Middleware de métricas (antes do logging)
app.use(httpMetricsMiddleware);

// Logging middleware estruturado
app.use(morgan('combined', {
    stream: {
        write: (message) => {
            logger.http(message.trim(), { component: 'HTTP' });
        }
    }
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API routes
app.use('/api/payment', paymentRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/mikrotik', mikrotikRoutes);
app.use('/api/planos', planosRoutes);
app.use('/api/recent-sales', recentSalesRoutes);
app.use('/api/test', testRoutes);
app.use('/api/mikrotik-user', mikrotikUserRoutes);
app.use('/api/mikrotik-retry', mikrotikRetryRoutes);
app.use('/api/payment-polling', paymentPollingRoutes);
app.use('/api/saques', saquesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/expired-plans', expiredPlansRoutes);
app.use('/api/auto-trial', autoTrialRoutes);

// Health check routes
app.use('/health', healthRoutes);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        message: `The route ${req.method} ${req.originalUrl} does not exist`
    });
});

// Global error handler
app.use((error, req, res, next) => {
    logger.error('Global error handler', {
        component: 'SERVER',
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
    });
    
    res.status(error.status || 500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully', { component: 'SERVER' });
    
    try {
        optimizedPaymentPollingService.stop();
        subscriptionPaymentService.stop();
        dailyExpiredPlansService.stop();
        
        // Fechar cache
        await cacheService.close();
        
        // Fechar circuit breakers
        circuitBreakerService.shutdown();
        
        logger.info('Graceful shutdown completed', { component: 'SERVER' });
        process.exit(0);
    } catch (error) {
        logger.error('Error during graceful shutdown', { 
            component: 'SERVER',
            error: error.message 
        });
        process.exit(1);
    }
});

process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully', { component: 'SERVER' });
    
    try {
        optimizedPaymentPollingService.stop();
        subscriptionPaymentService.stop();
        dailyExpiredPlansService.stop();
        
        // Fechar cache
        await cacheService.close();
        
        // Fechar circuit breakers
        circuitBreakerService.shutdown();
        
        logger.info('Graceful shutdown completed', { component: 'SERVER' });
        process.exit(0);
    } catch (error) {
        logger.error('Error during graceful shutdown', { 
            component: 'SERVER',
            error: error.message 
        });
        process.exit(1);
    }
});

app.listen(PORT, () => {
    logger.info('Server started successfully', {
        component: 'SERVER',
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        healthCheck: `http://localhost:${PORT}/health`,
        metrics: `http://localhost:${PORT}/health/metrics`
    });
    
    // Iniciar serviços automaticamente
    setTimeout(() => {
        logger.info('Starting optimized services...', { component: 'SERVER' });
        
        // Iniciar payment polling otimizado
        optimizedPaymentPollingService.start();
        
        // Iniciar subscription payment polling
        subscriptionPaymentService.start();
        
        // Iniciar expired plans service diário
        dailyExpiredPlansService.start();
        
        logger.info('All services started successfully', { component: 'SERVER' });
    }, 5000); // Aguardar 5 segundos para garantir que tudo foi inicializado
});

module.exports = app;