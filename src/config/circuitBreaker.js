const CircuitBreaker = require('opossum');
const logger = require('./logger');

class CircuitBreakerService {
    constructor() {
        this.breakers = new Map();
        this.defaultOptions = {
            timeout: 10000, // 10 seconds
            errorThresholdPercentage: 50,
            resetTimeout: 30000, // 30 seconds
            rollingCountTimeout: 60000, // 1 minute
            rollingCountBuckets: 10,
            volumeThreshold: 5, // Minimum number of requests in rolling window
            errorFilter: (err) => {
                // Don't count certain errors as failures
                if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
                    return false;
                }
                return true;
            }
        };
    }

    createBreaker(name, fn, options = {}) {
        const breakerOptions = { ...this.defaultOptions, ...options };
        
        const breaker = new CircuitBreaker(fn, {
            ...breakerOptions,
            name
        });

        // Event handlers
        breaker.on('open', () => {
            logger.warn(`Circuit breaker opened for ${name}`, { 
                component: 'CIRCUIT_BREAKER',
                breakerName: name,
                state: 'OPEN'
            });
        });

        breaker.on('halfOpen', () => {
            logger.info(`Circuit breaker half-opened for ${name}`, { 
                component: 'CIRCUIT_BREAKER',
                breakerName: name,
                state: 'HALF_OPEN'
            });
        });

        breaker.on('close', () => {
            logger.info(`Circuit breaker closed for ${name}`, { 
                component: 'CIRCUIT_BREAKER',
                breakerName: name,
                state: 'CLOSED'
            });
        });

        breaker.on('reject', () => {
            logger.warn(`Circuit breaker rejected request for ${name}`, { 
                component: 'CIRCUIT_BREAKER',
                breakerName: name,
                action: 'REJECTED'
            });
        });

        breaker.on('timeout', () => {
            logger.error(`Circuit breaker timeout for ${name}`, { 
                component: 'CIRCUIT_BREAKER',
                breakerName: name,
                action: 'TIMEOUT'
            });
        });

        breaker.on('failure', (err) => {
            logger.error(`Circuit breaker failure for ${name}`, { 
                component: 'CIRCUIT_BREAKER',
                breakerName: name,
                error: err.message,
                action: 'FAILURE'
            });
        });

        breaker.on('success', () => {
            logger.debug(`Circuit breaker success for ${name}`, { 
                component: 'CIRCUIT_BREAKER',
                breakerName: name,
                action: 'SUCCESS'
            });
        });

        this.breakers.set(name, breaker);
        return breaker;
    }

    getBreaker(name) {
        return this.breakers.get(name);
    }

    getAllBreakers() {
        return Array.from(this.breakers.keys());
    }

    getStatus(name) {
        const breaker = this.breakers.get(name);
        if (!breaker) {
            return null;
        }

        const stats = breaker.stats;
        return {
            name,
            state: breaker.opened ? 'OPEN' : breaker.halfOpen ? 'HALF_OPEN' : 'CLOSED',
            stats: {
                requests: stats.requests,
                successes: stats.successes,
                failures: stats.failures,
                rejects: stats.rejects,
                timeouts: stats.timeouts,
                percentiles: stats.percentiles
            },
            options: breaker.options
        };
    }

    getAllStatus() {
        const status = {};
        for (const name of this.breakers.keys()) {
            status[name] = this.getStatus(name);
        }
        return status;
    }

    // Pre-configured breakers for common services
    createMikrotikBreaker(fn, options = {}) {
        return this.createBreaker('mikrotik-api', fn, {
            timeout: 15000, // MikroTik can be slow
            errorThresholdPercentage: 60,
            resetTimeout: 60000, // 1 minute
            volumeThreshold: 3,
            ...options
        });
    }

    createMercadoPagoBreaker(fn, options = {}) {
        return this.createBreaker('mercadopago-api', fn, {
            timeout: 8000,
            errorThresholdPercentage: 40,
            resetTimeout: 30000,
            volumeThreshold: 5,
            ...options
        });
    }

    createSupabaseBreaker(fn, options = {}) {
        return this.createBreaker('supabase-api', fn, {
            timeout: 5000,
            errorThresholdPercentage: 30,
            resetTimeout: 20000,
            volumeThreshold: 10,
            ...options
        });
    }

    createEmailBreaker(fn, options = {}) {
        return this.createBreaker('email-service', fn, {
            timeout: 10000,
            errorThresholdPercentage: 50,
            resetTimeout: 120000, // 2 minutes
            volumeThreshold: 3,
            ...options
        });
    }

    // Utility function to wrap async functions with circuit breaker
    wrap(name, fn, options = {}) {
        const breaker = this.createBreaker(name, fn, options);
        
        return async (...args) => {
            try {
                return await breaker.fire(...args);
            } catch (error) {
                if (breaker.opened) {
                    logger.error(`Circuit breaker ${name} is open, request failed`, {
                        component: 'CIRCUIT_BREAKER',
                        breakerName: name,
                        error: 'Circuit breaker is open'
                    });
                    throw new Error(`Service ${name} is temporarily unavailable`);
                }
                throw error;
            }
        };
    }

    // Health check for all circuit breakers
    healthCheck() {
        const health = {
            timestamp: new Date().toISOString(),
            breakers: {},
            overall: 'healthy'
        };

        for (const name of this.breakers.keys()) {
            const status = this.getStatus(name);
            health.breakers[name] = {
                state: status.state,
                healthy: status.state === 'CLOSED',
                stats: status.stats
            };

            if (status.state === 'OPEN') {
                health.overall = 'degraded';
            }
        }

        return health;
    }

    // Reset all circuit breakers
    resetAll() {
        for (const breaker of this.breakers.values()) {
            breaker.close();
        }
        logger.info('All circuit breakers reset', { component: 'CIRCUIT_BREAKER' });
    }

    // Shutdown all circuit breakers
    shutdown() {
        for (const breaker of this.breakers.values()) {
            breaker.shutdown();
        }
        this.breakers.clear();
        logger.info('All circuit breakers shut down', { component: 'CIRCUIT_BREAKER' });
    }
}

// Create singleton instance
const circuitBreakerService = new CircuitBreakerService();

module.exports = circuitBreakerService;