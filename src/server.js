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

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// CORS configuration - Allow all development ports
app.use(cors({
    origin: [
        // Create React App default
        'http://localhost:3000', 
        'http://127.0.0.1:3000',
        // Backend port  
        'http://localhost:3001',
        'http://127.0.0.1:3001',
        // Vite dev server
        'http://localhost:5173', 
        'http://127.0.0.1:5173',
        // Vite preview
        'http://localhost:4173', 
        'http://127.0.0.1:4173',
        // Next.js default
        'http://localhost:3001',
        'http://127.0.0.1:3001',
        // Alternative dev ports
        'http://localhost:8080',
        'http://127.0.0.1:8080',
        'http://localhost:8000',
        'http://127.0.0.1:8000',
        // Production domains
        'https://mikropix.online', 
        'https://api.mikropix.online'
    ],
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
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;