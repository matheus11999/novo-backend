/**
 * Commission Service
 * Handles all commission calculations and related business logic
 */

class CommissionService {
    /**
     * Calculate commission split for payment
     * Admin gets 10% fixed commission, user gets remaining 90%
     * @param {number} valorTotal - Total payment amount
     * @param {number} porcentagemUsuario - User percentage (legacy parameter, not used in new logic)
     * @returns {Object} Commission breakdown
     */
    static calculateCommission(valorTotal, porcentagemUsuario = null) {
        const valor = parseFloat(valorTotal);
        
        if (isNaN(valor) || valor <= 0) {
            throw new Error('Invalid payment amount for commission calculation');
        }

        // FIXED COMMISSION LOGIC:
        // Admin always gets 10% fixed commission
        // User gets the remaining 90%
        const ADMIN_COMMISSION_RATE = 10; // 10% fixed for admin
        
        const valorAdmin = (valor * ADMIN_COMMISSION_RATE) / 100; // Admin: 10%
        const valorUsuario = valor - valorAdmin; // User: 90%

        const result = {
            valorTotal: valor,
            valorAdmin: parseFloat(valorAdmin.toFixed(2)),
            valorUsuario: parseFloat(valorUsuario.toFixed(2)),
            porcentagemAdmin: ADMIN_COMMISSION_RATE,
            porcentagemUsuario: 100 - ADMIN_COMMISSION_RATE,
            calculatedAt: new Date().toISOString()
        };

        console.log(`💰 [COMMISSION-SERVICE] Cálculo de comissões:`);
        console.log(`  📊 Valor Total: R$ ${result.valorTotal.toFixed(2)}`);
        console.log(`  📊 Admin (${result.porcentagemAdmin}%): R$ ${result.valorAdmin.toFixed(2)}`);
        console.log(`  📊 Usuário (${result.porcentagemUsuario}%): R$ ${result.valorUsuario.toFixed(2)}`);

        return result;
    }

    /**
     * Validate commission calculation
     * @param {Object} commission - Commission object to validate
     * @returns {boolean} True if valid
     */
    static validateCommission(commission) {
        if (!commission || typeof commission !== 'object') {
            return false;
        }

        const { valorTotal, valorAdmin, valorUsuario } = commission;
        
        // Check if all values are numbers
        if (isNaN(valorTotal) || isNaN(valorAdmin) || isNaN(valorUsuario)) {
            return false;
        }

        // Check if sum equals total (with small tolerance for floating point precision)
        const sum = valorAdmin + valorUsuario;
        const tolerance = 0.01;
        
        return Math.abs(sum - valorTotal) <= tolerance;
    }

    /**
     * Create commission history record data
     * @param {string} paymentId - Payment ID
     * @param {string} userId - User ID
     * @param {string} mikrotikId - MikroTik ID
     * @param {Object} commission - Commission breakdown
     * @returns {Object} Commission history data
     */
    static createCommissionHistoryData(paymentId, userId, mikrotikId, commission) {
        if (!this.validateCommission(commission)) {
            throw new Error('Invalid commission data for history creation');
        }

        return {
            id: require('uuid').v4(),
            payment_id: paymentId,
            user_id: userId,
            mikrotik_id: mikrotikId,
            valor_total: commission.valorTotal,
            valor_admin: commission.valorAdmin,
            valor_usuario: commission.valorUsuario,
            porcentagem_admin: commission.porcentagemAdmin,
            porcentagem_usuario: commission.porcentagemUsuario,
            created_at: new Date(),
            updated_at: new Date()
        };
    }

    /**
     * Get commission statistics for a user
     * @param {Array} commissions - Array of commission records
     * @returns {Object} Commission statistics
     */
    static getCommissionStats(commissions) {
        if (!Array.isArray(commissions) || commissions.length === 0) {
            return {
                totalCommissions: 0,
                totalAdminCommission: 0,
                totalUserCommission: 0,
                averageCommission: 0,
                count: 0
            };
        }

        const stats = commissions.reduce((acc, commission) => {
            acc.totalCommissions += commission.valor_total || 0;
            acc.totalAdminCommission += commission.valor_admin || 0;
            acc.totalUserCommission += commission.valor_usuario || 0;
            acc.count++;
            return acc;
        }, {
            totalCommissions: 0,
            totalAdminCommission: 0,
            totalUserCommission: 0,
            count: 0
        });

        stats.averageCommission = stats.count > 0 ? stats.totalCommissions / stats.count : 0;

        return stats;
    }

    /**
     * Calculate commission for bulk payments
     * @param {Array} payments - Array of payment amounts
     * @returns {Array} Array of commission breakdowns
     */
    static calculateBulkCommissions(payments) {
        if (!Array.isArray(payments)) {
            throw new Error('Payments must be an array');
        }

        return payments.map(payment => {
            try {
                return this.calculateCommission(payment.valor || payment.amount || payment);
            } catch (error) {
                console.error(`[COMMISSION-SERVICE] Error calculating commission for payment:`, error);
                return null;
            }
        }).filter(commission => commission !== null);
    }
}

module.exports = CommissionService;