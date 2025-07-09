const redis = require('redis');
const logger = require('./logger');

class CacheService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.retryAttempts = 0;
        this.maxRetries = 5;
        this.retryDelay = 1000;
        
        this.init();
    }

    async init() {
        try {
            const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
            
            logger.info('Initializing Redis connection', { 
                component: 'CACHE',
                url: redisUrl.replace(/:[^:]*@/, ':***@') // Mascarar senha no log
            });
            
            this.client = redis.createClient({
                url: redisUrl,
                socket: {
                    connectTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT) || 10000,
                    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT) || 5000,
                    lazyConnect: true,
                    keepAlive: true,
                    noDelay: true
                },
                retry_strategy: (options) => {
                    if (options.error && options.error.code === 'ECONNREFUSED') {
                        logger.error('Redis connection refused', { 
                            component: 'CACHE',
                            error: options.error.message 
                        });
                        return new Error('Redis server connection refused');
                    }
                    
                    if (options.total_retry_time > 1000 * 60 * 60) {
                        logger.error('Redis retry time exhausted', { component: 'CACHE' });
                        return new Error('Retry time exhausted');
                    }
                    
                    if (options.attempt > this.maxRetries) {
                        logger.error('Max Redis retries reached', { component: 'CACHE' });
                        return new Error('Max retries reached');
                    }
                    
                    const delay = Math.min(options.attempt * this.retryDelay, 3000);
                    logger.warn(`Redis retry attempt ${options.attempt}`, {
                        component: 'CACHE',
                        delay,
                        totalRetryTime: options.total_retry_time
                    });
                    
                    return delay;
                },
                // Configurações específicas para EasyPanel/Docker
                family: 4, // IPv4
                password: process.env.REDIS_PASSWORD || undefined,
                database: parseInt(process.env.REDIS_DATABASE) || 0
            });

            // Event handlers
            this.client.on('connect', () => {
                logger.info('Redis client connected', { component: 'CACHE' });
                this.isConnected = true;
                this.retryAttempts = 0;
            });

            this.client.on('ready', () => {
                logger.info('Redis client ready', { component: 'CACHE' });
                this.isConnected = true;
            });

            this.client.on('error', (err) => {
                logger.error('Redis client error', { 
                    component: 'CACHE',
                    error: err.message 
                });
                this.isConnected = false;
            });

            this.client.on('end', () => {
                logger.warn('Redis client disconnected', { component: 'CACHE' });
                this.isConnected = false;
            });

            // Connect to Redis
            await this.client.connect();
            
        } catch (error) {
            logger.error('Failed to initialize Redis cache', { 
                component: 'CACHE',
                error: error.message 
            });
            
            // Fallback to in-memory cache
            this.client = new Map();
            this.isConnected = false;
        }
    }

    async get(key) {
        if (!this.isConnected) {
            if (this.client instanceof Map) {
                const item = this.client.get(key);
                if (item && item.expiry > Date.now()) {
                    return JSON.parse(item.value);
                }
                return null;
            }
            return null;
        }

        try {
            const value = await this.client.get(key);
            if (value) {
                logger.debug(`Cache hit for key: ${key}`, { component: 'CACHE' });
                return JSON.parse(value);
            }
            logger.debug(`Cache miss for key: ${key}`, { component: 'CACHE' });
            return null;
        } catch (error) {
            logger.error(`Cache get error for key: ${key}`, { 
                component: 'CACHE',
                error: error.message 
            });
            return null;
        }
    }

    async set(key, value, ttl = 300) {
        if (!this.isConnected) {
            if (this.client instanceof Map) {
                this.client.set(key, {
                    value: JSON.stringify(value),
                    expiry: Date.now() + (ttl * 1000)
                });
                return true;
            }
            return false;
        }

        try {
            await this.client.setEx(key, ttl, JSON.stringify(value));
            logger.debug(`Cache set for key: ${key} with TTL: ${ttl}s`, { component: 'CACHE' });
            return true;
        } catch (error) {
            logger.error(`Cache set error for key: ${key}`, { 
                component: 'CACHE',
                error: error.message 
            });
            return false;
        }
    }

    async del(key) {
        if (!this.isConnected) {
            if (this.client instanceof Map) {
                this.client.delete(key);
                return true;
            }
            return false;
        }

        try {
            await this.client.del(key);
            logger.debug(`Cache deleted for key: ${key}`, { component: 'CACHE' });
            return true;
        } catch (error) {
            logger.error(`Cache delete error for key: ${key}`, { 
                component: 'CACHE',
                error: error.message 
            });
            return false;
        }
    }

    async flush() {
        if (!this.isConnected) {
            if (this.client instanceof Map) {
                this.client.clear();
                return true;
            }
            return false;
        }

        try {
            await this.client.flushAll();
            logger.info('Cache flushed', { component: 'CACHE' });
            return true;
        } catch (error) {
            logger.error('Cache flush error', { 
                component: 'CACHE',
                error: error.message 
            });
            return false;
        }
    }

    // Utility methods for common cache patterns
    async getOrSet(key, fetchFunction, ttl = 300) {
        const cached = await this.get(key);
        if (cached !== null) {
            return cached;
        }

        try {
            const value = await fetchFunction();
            await this.set(key, value, ttl);
            return value;
        } catch (error) {
            logger.error(`Cache getOrSet error for key: ${key}`, { 
                component: 'CACHE',
                error: error.message 
            });
            throw error;
        }
    }

    // Generate cache keys for common patterns
    static keys = {
        mikrotikSystem: (mikrotikId) => `mikrotik:${mikrotikId}:system`,
        mikrotikStats: (mikrotikId) => `mikrotik:${mikrotikId}:stats`,
        userPlans: (userId) => `user:${userId}:plans`,
        paymentStatus: (paymentId) => `payment:${paymentId}:status`,
        mikrotikUsers: (mikrotikId) => `mikrotik:${mikrotikId}:users`,
        mikrotikProfiles: (mikrotikId) => `mikrotik:${mikrotikId}:profiles`
    };

    // Get connection status
    getStatus() {
        return {
            connected: this.isConnected,
            type: this.client instanceof Map ? 'memory' : 'redis',
            retryAttempts: this.retryAttempts
        };
    }

    // Clean expired keys (for in-memory fallback)
    cleanExpired() {
        if (this.client instanceof Map) {
            const now = Date.now();
            for (const [key, item] of this.client.entries()) {
                if (item.expiry <= now) {
                    this.client.delete(key);
                }
            }
        }
    }

    async close() {
        if (this.isConnected && this.client && typeof this.client.disconnect === 'function') {
            await this.client.disconnect();
            logger.info('Redis client disconnected', { component: 'CACHE' });
        }
    }
}

// Create singleton instance
const cacheService = new CacheService();

// Clean expired in-memory cache every 5 minutes
setInterval(() => {
    cacheService.cleanExpired();
}, 5 * 60 * 1000);

module.exports = cacheService;