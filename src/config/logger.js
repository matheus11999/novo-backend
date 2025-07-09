const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston about the colors
winston.addColors(colors);

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} [${info.level}] ${info.message}`
  )
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ all: true }),
      winston.format.printf(
        (info) => `${info.timestamp} [${info.level}] ${info.message}`
      )
    )
  }),
  
  // File transport for errors
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/error.log'),
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/combined.log'),
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  })
];

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  transports,
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Enhanced logging methods with metadata support
const enhancedLogger = {
  error: (message, meta = {}) => {
    logger.error(message, {
      timestamp: new Date().toISOString(),
      component: meta.component || 'UNKNOWN',
      userId: meta.userId,
      mikrotikId: meta.mikrotikId,
      ip: meta.ip,
      ...meta
    });
  },
  
  warn: (message, meta = {}) => {
    logger.warn(message, {
      timestamp: new Date().toISOString(),
      component: meta.component || 'UNKNOWN',
      userId: meta.userId,
      mikrotikId: meta.mikrotikId,
      ip: meta.ip,
      ...meta
    });
  },
  
  info: (message, meta = {}) => {
    logger.info(message, {
      timestamp: new Date().toISOString(),
      component: meta.component || 'UNKNOWN',
      userId: meta.userId,
      mikrotikId: meta.mikrotikId,
      ip: meta.ip,
      ...meta
    });
  },
  
  http: (message, meta = {}) => {
    logger.http(message, {
      timestamp: new Date().toISOString(),
      component: meta.component || 'HTTP',
      method: meta.method,
      url: meta.url,
      ip: meta.ip,
      userAgent: meta.userAgent,
      ...meta
    });
  },
  
  debug: (message, meta = {}) => {
    logger.debug(message, {
      timestamp: new Date().toISOString(),
      component: meta.component || 'DEBUG',
      ...meta
    });
  },
  
  // Security logging
  security: (message, meta = {}) => {
    logger.error(`[SECURITY] ${message}`, {
      timestamp: new Date().toISOString(),
      component: 'SECURITY',
      level: 'SECURITY',
      ip: meta.ip,
      userAgent: meta.userAgent,
      ...meta
    });
  },
  
  // Performance logging
  performance: (message, meta = {}) => {
    logger.info(`[PERFORMANCE] ${message}`, {
      timestamp: new Date().toISOString(),
      component: 'PERFORMANCE',
      duration: meta.duration,
      operation: meta.operation,
      ...meta
    });
  }
};

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Export enhanced logger
module.exports = enhancedLogger;