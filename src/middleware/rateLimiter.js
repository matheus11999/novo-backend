const rateLimit = require('express-rate-limit');

const createPaymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 payment creation requests per windowMs
    message: {
        error: 'Too many payment requests',
        message: 'Too many payment creation attempts, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // limit each IP to 100 webhook requests per minute
    message: {
        error: 'Too many webhook requests',
        message: 'Webhook rate limit exceeded',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests',
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    createPaymentLimiter,
    webhookLimiter,
    generalLimiter
};