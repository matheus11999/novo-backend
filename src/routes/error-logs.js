const express = require('express');
const router = express.Router();
const errorLogService = require('../services/errorLogService');
const logger = require('../config/logger');

// Get recent error logs
router.get('/', async (req, res) => {
    try {
        const { 
            limit = 50, 
            component, 
            severity,
            page = 1 
        } = req.query;

        const errors = await errorLogService.getRecentErrors(
            parseInt(limit), 
            component, 
            severity
        );

        res.json({
            success: true,
            data: errors,
            count: errors.length,
            filters: {
                component,
                severity,
                limit: parseInt(limit),
                page: parseInt(page)
            }
        });

    } catch (error) {
        logger.error('Error fetching error logs', {
            component: 'ERROR_LOGS_API',
            error: error.message
        });

        res.status(500).json({
            success: false,
            error: 'Failed to fetch error logs',
            message: error.message
        });
    }
});

// Get error statistics
router.get('/stats', async (req, res) => {
    try {
        const stats = await errorLogService.getErrorStats();

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        logger.error('Error fetching error stats', {
            component: 'ERROR_LOGS_API',
            error: error.message
        });

        res.status(500).json({
            success: false,
            error: 'Failed to fetch error statistics',
            message: error.message
        });
    }
});

// Mark error as resolved
router.patch('/:errorId/resolve', async (req, res) => {
    try {
        const { errorId } = req.params;

        const success = await errorLogService.markErrorResolved(errorId);

        if (success) {
            res.json({
                success: true,
                message: 'Error marked as resolved'
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Error not found or already resolved'
            });
        }

    } catch (error) {
        logger.error('Error marking error as resolved', {
            component: 'ERROR_LOGS_API',
            errorId: req.params.errorId,
            error: error.message
        });

        res.status(500).json({
            success: false,
            error: 'Failed to mark error as resolved',
            message: error.message
        });
    }
});

// Get payment processing errors specifically
router.get('/payment-errors', async (req, res) => {
    try {
        const errors = await errorLogService.getRecentErrors(100, 'PAYMENT_POLLING');

        // Group by error type and reason
        const groupedErrors = {};
        errors.forEach(error => {
            const key = error.error_type;
            if (!groupedErrors[key]) {
                groupedErrors[key] = {
                    errorType: key,
                    count: 0,
                    examples: [],
                    reasons: {}
                };
            }
            
            groupedErrors[key].count++;
            
            if (groupedErrors[key].examples.length < 3) {
                groupedErrors[key].examples.push({
                    id: error.id,
                    paymentId: error.payment_id,
                    vendaId: error.venda_id,
                    errorMessage: error.error_message,
                    context: error.context,
                    createdAt: error.created_at
                });
            }

            // Count reasons
            const reason = error.context?.reason || 'unknown';
            groupedErrors[key].reasons[reason] = (groupedErrors[key].reasons[reason] || 0) + 1;
        });

        res.json({
            success: true,
            data: {
                totalErrors: errors.length,
                groupedErrors: Object.values(groupedErrors),
                rawErrors: errors.slice(0, 20) // Last 20 for detailed view
            }
        });

    } catch (error) {
        logger.error('Error fetching payment errors', {
            component: 'ERROR_LOGS_API',
            error: error.message
        });

        res.status(500).json({
            success: false,
            error: 'Failed to fetch payment errors',
            message: error.message
        });
    }
});

// Cleanup old logs (admin endpoint)
router.delete('/cleanup', async (req, res) => {
    try {
        await errorLogService.cleanupOldLogs();

        res.json({
            success: true,
            message: 'Old error logs cleaned up successfully'
        });

    } catch (error) {
        logger.error('Error during cleanup', {
            component: 'ERROR_LOGS_API',
            error: error.message
        });

        res.status(500).json({
            success: false,
            error: 'Failed to cleanup old logs',
            message: error.message
        });
    }
});

module.exports = router;