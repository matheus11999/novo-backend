require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const paymentRoutes = require('./routes/payment');
const webhookRoutes = require('./routes/webhook');
const mikrotikRoutes = require('./routes/mikrotik');
const planosRoutes = require('./routes/planos');
const recentSalesRoutes = require('./routes/recent-sales');
const testRoutes = require('./routes/test');
const mikrotikUserRoutes = require('./routes/mikrotik-user');
const mikrotikRetryRoutes = require('./routes/mikrotik-retry');
const paymentPollingRoutes = require('./routes/payment-polling');
const paymentPollingService = require('./services/paymentPollingService');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for accurate IP detection behind reverse proxy
app.set('trust proxy', true);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// CORS configuration - Allow all origins in development, specific in production
const corsOrigins = process.env.NODE_ENV === 'production' ? [
    'https://mikropix.online', 
    'https://api.mikropix.online'
] : true; // Allow all origins in development

app.use(cors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Token', 'Accept'],
    preflightContinue: false,
    optionsSuccessStatus: 200
}));

// Logging middleware
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

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

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        message: `The route ${req.method} ${req.originalUrl} does not exist`
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    
    res.status(error.status || 500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    paymentPollingService.stop();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    paymentPollingService.stop();
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Iniciar polling de pagamentos automaticamente
    setTimeout(() => {
        console.log('🔄 Starting payment polling service...');
        paymentPollingService.start();
    }, 5000); // Aguardar 5 segundos para garantir que tudo foi inicializado
});

module.exports = app;