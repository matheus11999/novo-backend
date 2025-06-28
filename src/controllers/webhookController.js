const { supabase } = require('../config/database');
const { payment } = require('../config/mercadopago');
const { createMikrotikUser } = require('../utils/mikrotikUtils');
const axios = require('axios');

class WebhookController {
    async handleMercadoPagoWebhook(req, res) {
        try {
            console.log('MercadoPago Webhook received:', req.body);

            const { type, data } = req.body;

            // Only process payment notifications
            if (type !== 'payment') {
                return res.status(200).json({ message: 'Notification type not handled' });
            }

            const paymentId = data.id;
            if (!paymentId) {
                return res.status(400).json({ error: 'Payment ID not provided' });
            }

            // Get payment details from MercadoPago
            const mpPayment = await payment.get({ id: paymentId });
            
            if (!mpPayment) {
                return res.status(404).json({ error: 'Payment not found in MercadoPago' });
            }

            const externalReference = mpPayment.external_reference;
            if (!externalReference) {
                console.log('No external reference found for payment:', paymentId);
                return res.status(200).json({ message: 'No external reference' });
            }

            // Find the sale in our database
            const { data: venda, error: vendaError } = await supabase
                .from('vendas')
                .select(`
                    *,
                    planos (*),
                    mikrotiks (*)
                `)
                .eq('payment_id', externalReference)
                .single();

            if (vendaError || !venda) {
                console.log('Sale not found for external reference:', externalReference);
                return res.status(404).json({ error: 'Sale not found' });
            }

            // Update payment status
            const updateData = {
                mercadopago_status: mpPayment.status,
                updated_at: new Date().toISOString()
            };

            // Handle approved payment
            if (mpPayment.status === 'approved' && venda.status !== 'completed') {
                updateData.status = 'completed';
                updateData.paid_at = new Date().toISOString();

                try {
                    // Create user in MikroTik with MAC as username and password
                    const macAddress = venda.mac_address;
                    const cleanMac = macAddress.replace(/[:-]/g, '').toLowerCase();
                    
                    const mikrotikUser = {
                        username: cleanMac,
                        password: cleanMac,
                        profile: venda.planos.nome,
                        comment: `Vendido via PIX - ${new Date().toISOString()}`,
                        'mac-address': macAddress
                    };

                    // First try to delete existing user with same MAC to avoid conflicts
                    await this.deleteMikrotikUserByMac(venda.mikrotiks, macAddress);
                    
                    // Create new user in MikroTik
                    const userCreated = await this.createMikrotikUserAPI(venda.mikrotiks, mikrotikUser, venda.planos);
                    
                    if (userCreated.success) {
                        updateData.usuario_criado = cleanMac;
                        updateData.senha_usuario = cleanMac;
                        updateData.mikrotik_user_id = userCreated.user_id;
                        
                        console.log(`✅ MikroTik user created successfully: ${cleanMac}`);
                    } else {
                        console.error('❌ Failed to create MikroTik user:', userCreated.error);
                        updateData.error_message = userCreated.error;
                    }
                } catch (userError) {
                    console.error('❌ Error creating MikroTik user:', userError.message);
                    updateData.error_message = userError.message;
                    // Don't fail the payment, just log the error
                }

                // Update the sale
                const { error: updateError } = await supabase
                    .from('vendas')
                    .update(updateData)
                    .eq('id', venda.id);

                if (updateError) {
                    throw updateError;
                }

                // Create transaction history
                await this.createTransactionHistory(venda);

                console.log(`💰 Payment approved for MAC: ${venda.mac_address}`);
            } 
            // Handle other status updates
            else if (mpPayment.status !== venda.mercadopago_status) {
                const { error: updateError } = await supabase
                    .from('vendas')
                    .update(updateData)
                    .eq('id', venda.id);

                if (updateError) {
                    throw updateError;
                }

                console.log(`Payment status updated to: ${mpPayment.status}`);
            }

            res.status(200).json({ message: 'Webhook processed successfully' });
        } catch (error) {
            console.error('Webhook processing error:', error);
            res.status(500).json({
                error: 'Webhook processing failed',
                message: error.message
            });
        }
    }

    async createTransactionHistory(venda) {
        try {
            const historyEntries = [
                {
                    venda_id: venda.id,
                    mikrotik_id: venda.mikrotik_id,
                    user_id: venda.mikrotiks.user_id,
                    tipo: 'admin',
                    valor: venda.valor_admin,
                    descricao: `Comissão admin - Venda ${venda.payment_id}`
                },
                {
                    venda_id: venda.id,
                    mikrotik_id: venda.mikrotik_id,
                    user_id: venda.mikrotiks.user_id,
                    tipo: 'usuario',
                    valor: venda.valor_usuario,
                    descricao: `Pagamento usuario - Venda ${venda.payment_id}`
                }
            ];

            const { error } = await supabase
                .from('historico_vendas')
                .insert(historyEntries);

            if (error) {
                throw error;
            }

            console.log('Transaction history created for sale:', venda.payment_id);
        } catch (error) {
            console.error('Error creating transaction history:', error);
            throw error;
        }
    }

    async deleteMikrotikUserByMac(mikrotik, macAddress) {
        try {
            console.log(`🗑️ Attempting to delete existing user with MAC: ${macAddress}`);
            
            const params = new URLSearchParams({
                ip: mikrotik.ip,
                username: mikrotik.usuario,
                password: mikrotik.senha,
                port: mikrotik.porta || 8728
            });

            // First, get all users to find the one with this MAC
            const getUsersResponse = await axios.get(
                `${process.env.MIKROTIK_API_URL}/hotspot/users?${params}`,
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.MIKROTIK_API_TOKEN}`
                    },
                    timeout: 10000
                }
            );

            if (getUsersResponse.data && getUsersResponse.data.data) {
                const users = getUsersResponse.data.data;
                const existingUser = users.find(user => 
                    user['mac-address'] && user['mac-address'].toLowerCase() === macAddress.toLowerCase()
                );

                if (existingUser) {
                    console.log(`🔍 Found existing user with MAC ${macAddress}: ${existingUser.name}`);
                    
                    // Delete the existing user
                    params.append('id', existingUser['.id']);
                    await axios.delete(
                        `${process.env.MIKROTIK_API_URL}/hotspot/users?${params}`,
                        {
                            headers: {
                                'Authorization': `Bearer ${process.env.MIKROTIK_API_TOKEN}`
                            },
                            timeout: 10000
                        }
                    );
                    
                    console.log(`✅ Deleted existing user: ${existingUser.name}`);
                } else {
                    console.log(`ℹ️ No existing user found with MAC: ${macAddress}`);
                }
            }
        } catch (error) {
            console.warn(`⚠️ Warning: Could not delete existing user with MAC ${macAddress}:`, error.message);
            // Don't throw error, just warn - we'll try to create the user anyway
        }
    }

    async createMikrotikUserAPI(mikrotik, userData, planData) {
        try {
            console.log(`👤 Creating MikroTik user: ${userData.username}`);
            
            const params = new URLSearchParams({
                ip: mikrotik.ip,
                username: mikrotik.usuario,
                password: mikrotik.senha,
                port: mikrotik.porta || 8728
            });

            const userPayload = {
                name: userData.username,
                password: userData.password,
                profile: userData.profile,
                comment: userData.comment,
                'mac-address': userData['mac-address']
            };

            console.log(`📡 Sending user creation request to MikroTik API...`);
            
            const response = await axios.post(
                `${process.env.MIKROTIK_API_URL}/hotspot/users?${params}`,
                userPayload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.MIKROTIK_API_TOKEN}`
                    },
                    timeout: 15000
                }
            );

            if (response.data && response.data.success) {
                return {
                    success: true,
                    user_id: response.data.data?.['.id'] || null,
                    data: response.data
                };
            } else {
                return {
                    success: false,
                    error: response.data?.error || 'Unknown error creating user'
                };
            }
        } catch (error) {
            console.error('❌ MikroTik API Error:', error.message);
            return {
                success: false,
                error: error.response?.data?.error || error.message
            };
        }
    }
}

module.exports = new WebhookController();