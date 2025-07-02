/**
 * Payment Service
 * Handles payment processing logic extracted from payment controller
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { mercadopago, Payment, Preference } = require('../config/mercadopago');
const CommissionService = require('./commissionService');

class PaymentService {
    /**
     * Format duration for display
     * @param {number} seconds - Duration in seconds
     * @returns {string} Formatted duration
     */
    static formatDuration(seconds) {
        if (seconds < 3600) {
            return `${Math.floor(seconds / 60)} minutos`;
        } else if (seconds < 86400) {
            return `${Math.floor(seconds / 3600)} horas`;
        } else {
            return `${Math.floor(seconds / 86400)} dias`;
        }
    }

    /**
     * Get plans by MikroTik ID
     * @param {string} mikrotikId - MikroTik ID
     * @returns {Promise<Array>} Array of plans
     */
    static async getPlansByMikrotik(mikrotikId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM mikrotik_planos 
                WHERE mikrotik_id = ? AND ativo = 1 
                ORDER BY valor ASC
            `;
            
            db.query(query, [mikrotikId], (error, results) => {
                if (error) {
                    console.error('[PAYMENT-SERVICE] Error fetching plans:', error);
                    reject(error);
                } else {
                    resolve(results);
                }
            });
        });
    }

    /**
     * Get MikroTik by ID
     * @param {string} mikrotikId - MikroTik ID
     * @returns {Promise<Object>} MikroTik data
     */
    static async getMikrotikById(mikrotikId) {
        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM mikrotiks WHERE id = ?';
            
            db.query(query, [mikrotikId], (error, results) => {
                if (error) {
                    console.error('[PAYMENT-SERVICE] Error fetching MikroTik:', error);
                    reject(error);
                } else {
                    resolve(results[0] || null);
                }
            });
        });
    }

    /**
     * Get plan by ID and MikroTik
     * @param {string} planId - Plan ID
     * @param {string} mikrotikId - MikroTik ID
     * @returns {Promise<Object>} Plan data
     */
    static async getPlanById(planId, mikrotikId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM mikrotik_planos 
                WHERE id = ? AND mikrotik_id = ? AND ativo = 1
            `;
            
            db.query(query, [planId, mikrotikId], (error, results) => {
                if (error) {
                    console.error('[PAYMENT-SERVICE] Error fetching plan:', error);
                    reject(error);
                } else {
                    resolve(results[0] || null);
                }
            });
        });
    }

    /**
     * Create payment data for MercadoPago
     * @param {Object} options - Payment options
     * @returns {Object} Payment data
     */
    static createPaymentData(options) {
        const {
            valorTotal,
            planNome,
            sessionTimeout,
            paymentId,
            webhookUrl,
            payerEmail = null,
            payerFirstName = 'Cliente',
            payerLastName = 'Hotspot',
            isCaptive = false
        } = options;

        const description = isCaptive 
            ? `${planNome} - ${this.formatDuration(sessionTimeout)} - Hotspot`
            : `${planNome} - ${this.formatDuration(sessionTimeout)}`;

        return {
            transaction_amount: valorTotal,
            description: description,
            payment_method_id: 'pix',
            external_reference: paymentId,
            payer: {
                email: payerEmail || 'cliente@mikropix.com',
                first_name: payerFirstName,
                last_name: payerLastName
            },
            notification_url: webhookUrl,
            metadata: {
                payment_type: isCaptive ? 'captive_portal' : 'authenticated',
                plan_name: planNome,
                session_timeout: sessionTimeout
            }
        };
    }

    /**
     * Generate payer email from MAC address
     * @param {string} macAddress - MAC address
     * @returns {string} Generated email
     */
    static generatePayerEmail(macAddress) {
        const cleanMac = macAddress.replace(/[:-]/g, '');
        return `cliente.${cleanMac.slice(-6)}@hotspot.com`;
    }

    /**
     * Create PIX payment
     * @param {Object} paymentData - Payment data for MercadoPago
     * @returns {Promise<Object>} Payment response
     */
    static async createPixPayment(paymentData) {
        try {
            console.log('[PAYMENT-SERVICE] Creating PIX payment with MercadoPago...');
            
            const payment = new Payment(mercadopago);
            const response = await payment.create({ body: paymentData });
            
            console.log('[PAYMENT-SERVICE] PIX payment created successfully');
            return response;
            
        } catch (error) {
            console.error('[PAYMENT-SERVICE] Error creating PIX payment:', error);
            throw error;
        }
    }

    /**
     * Save payment to database
     * @param {Object} paymentInfo - Payment information
     * @returns {Promise<void>}
     */
    static async savePaymentToDatabase(paymentInfo) {
        const {
            paymentId,
            userId,
            mikrotikId,
            planId,
            mercadoPagoPaymentId,
            qrCode,
            qrCodeBase64,
            pixCopiaECola,
            valorTotal,
            commission,
            macAddress = null,
            isCaptive = false
        } = paymentInfo;

        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO vendas_pix (
                    id, user_id, mikrotik_id, plano_id, mercadopago_payment_id,
                    qr_code, qr_code_base64, pix_copia_e_cola, valor_total,
                    valor_admin, valor_usuario, mac_address, is_captive,
                    status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())
            `;

            const values = [
                paymentId,
                userId,
                mikrotikId,
                planId,
                mercadoPagoPaymentId,
                qrCode,
                qrCodeBase64,
                pixCopiaECola,
                commission.valorTotal,
                commission.valorAdmin,
                commission.valorUsuario,
                macAddress,
                isCaptive ? 1 : 0
            ];

            db.query(query, values, (error, results) => {
                if (error) {
                    console.error('[PAYMENT-SERVICE] Error saving payment:', error);
                    reject(error);
                } else {
                    console.log('[PAYMENT-SERVICE] Payment saved successfully');
                    resolve(results);
                }
            });
        });
    }

    /**
     * Get payment status
     * @param {string} paymentId - Payment ID
     * @returns {Promise<Object>} Payment status
     */
    static async getPaymentStatus(paymentId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT vp.*, mp.nome as plano_nome, mp.session_timeout,
                       m.nome as mikrotik_nome, m.host as mikrotik_host
                FROM vendas_pix vp
                LEFT JOIN mikrotik_planos mp ON vp.plano_id = mp.id
                LEFT JOIN mikrotiks m ON vp.mikrotik_id = m.id
                WHERE vp.id = ?
            `;
            
            db.query(query, [paymentId], (error, results) => {
                if (error) {
                    console.error('[PAYMENT-SERVICE] Error fetching payment status:', error);
                    reject(error);
                } else {
                    resolve(results[0] || null);
                }
            });
        });
    }

    /**
     * Check if captive user exists
     * @param {string} macAddress - MAC address
     * @param {string} mikrotikId - MikroTik ID
     * @returns {Promise<Object>} User check result
     */
    static async checkCaptiveUser(macAddress, mikrotikId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT vp.*, mp.nome as plano_nome, mp.session_timeout as duracao,
                       m.nome as mikrotik_nome, m.host as mikrotik_host,
                       m.port as mikrotik_port, m.username as mikrotik_username,
                       m.password as mikrotik_password
                FROM vendas_pix vp
                LEFT JOIN mikrotik_planos mp ON vp.plano_id = mp.id
                LEFT JOIN mikrotiks m ON vp.mikrotik_id = m.id
                WHERE vp.mac_address = ? AND vp.mikrotik_id = ? 
                      AND vp.status = 'approved'
                ORDER BY vp.created_at DESC
                LIMIT 1
            `;
            
            db.query(query, [macAddress, mikrotikId], (error, results) => {
                if (error) {
                    console.error('[PAYMENT-SERVICE] Error checking captive user:', error);
                    reject(error);
                } else {
                    const user = results[0] || null;
                    resolve({
                        exists: !!user,
                        user: user,
                        macAddress: macAddress,
                        mikrotikId: mikrotikId
                    });
                }
            });
        });
    }

    /**
     * Process payment creation workflow
     * @param {Object} options - Payment creation options
     * @returns {Promise<Object>} Payment creation result
     */
    static async processPaymentCreation(options) {
        const {
            userId,
            mikrotikId,
            planId,
            macAddress = null,
            isCaptive = false
        } = options;

        try {
            // 1. Get MikroTik data
            const mikrotik = await this.getMikrotikById(mikrotikId);
            if (!mikrotik) {
                throw new Error('MikroTik not found');
            }

            // 2. Get plan data
            const plano = await this.getPlanById(planId, mikrotikId);
            if (!plano) {
                throw new Error('Plan not found');
            }

            // 3. Calculate commission
            const commission = CommissionService.calculateCommission(plano.valor);

            // 4. Generate payment ID
            const paymentId = uuidv4();

            // 5. Create payment data
            const paymentData = this.createPaymentData({
                valorTotal: commission.valorTotal,
                planNome: plano.nome,
                sessionTimeout: plano.session_timeout,
                paymentId: paymentId,
                webhookUrl: 'https://api.mikropix.online/api/webhook/mercadopago',
                payerEmail: isCaptive ? this.generatePayerEmail(macAddress) : null,
                isCaptive: isCaptive
            });

            // 6. Create PIX payment
            const pixResponse = await this.createPixPayment(paymentData);

            // 7. Save to database
            await this.savePaymentToDatabase({
                paymentId,
                userId,
                mikrotikId,
                planId,
                mercadoPagoPaymentId: pixResponse.id,
                qrCode: pixResponse.point_of_interaction?.transaction_data?.qr_code,
                qrCodeBase64: pixResponse.point_of_interaction?.transaction_data?.qr_code_base64,
                pixCopiaECola: pixResponse.point_of_interaction?.transaction_data?.qr_code,
                valorTotal: commission.valorTotal,
                commission: commission,
                macAddress: macAddress,
                isCaptive: isCaptive
            });

            return {
                success: true,
                paymentId: paymentId,
                mercadoPagoId: pixResponse.id,
                qrCode: pixResponse.point_of_interaction?.transaction_data?.qr_code,
                qrCodeBase64: pixResponse.point_of_interaction?.transaction_data?.qr_code_base64,
                pixCopiaECola: pixResponse.point_of_interaction?.transaction_data?.qr_code,
                valorTotal: commission.valorTotal,
                commission: commission,
                plano: plano,
                mikrotik: mikrotik
            };

        } catch (error) {
            console.error('[PAYMENT-SERVICE] Error processing payment creation:', error);
            throw error;
        }
    }
}

module.exports = PaymentService;