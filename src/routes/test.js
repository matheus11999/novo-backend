const express = require('express');
const router = express.Router();
const axios = require('axios');
const { supabase } = require('../config/database');

// Test endpoint to create MikroTik user
router.post('/create-mikrotik-user', async (req, res) => {
    try {
        const { mikrotik_id, mac_address, plano_nome } = req.body;

        if (!mikrotik_id || !mac_address || !plano_nome) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Provide mikrotik_id, mac_address, and plano_nome'
            });
        }

        console.log('🧪 [TEST] Starting MikroTik user creation test');
        console.log('🧪 [TEST] Parameters:', { mikrotik_id, mac_address, plano_nome });

        // Get MikroTik details
        const { data: mikrotik, error: mikrotikError } = await supabase
            .from('mikrotiks')
            .select('ip, usuario, senha, porta')
            .eq('id', mikrotik_id)
            .single();

        if (mikrotikError || !mikrotik) {
            console.error('❌ [TEST] MikroTik not found:', mikrotikError);
            return res.status(404).json({
                error: 'MikroTik not found',
                message: 'The specified MikroTik was not found'
            });
        }

        console.log('✅ [TEST] MikroTik found:', mikrotik.ip);

        // Prepare credentials
        const cleanMac = mac_address.replace(/[:-]/g, '').toLowerCase();
        const mikrotikCredentials = {
            ip: mikrotik.ip,
            usuario: mikrotik.usuario,
            senha: mikrotik.senha,
            porta: mikrotik.porta || 8728
        };

        console.log('🔑 [TEST] MikroTik credentials:', {
            ip: mikrotikCredentials.ip,
            usuario: mikrotikCredentials.usuario,
            porta: mikrotikCredentials.porta
        });

        // Step 1: Try to delete existing user with same MAC
        console.log('🗑️ [TEST] Step 1: Attempting to delete existing user');
        try {
            const deleteResult = await deleteMikrotikUserByMac(mikrotikCredentials, mac_address);
            console.log('✅ [TEST] Delete result:', deleteResult);
        } catch (deleteError) {
            console.log('ℹ️ [TEST] Delete error (user may not exist):', deleteError.message);
        }

        // Step 2: Create new user
        console.log('👤 [TEST] Step 2: Creating new user');
        const mikrotikUser = {
            username: cleanMac,
            password: cleanMac,
            profile: plano_nome,
            comment: `Teste via API - ${new Date().toISOString()}`,
            'mac-address': mac_address
        };

        console.log('👤 [TEST] User data:', mikrotikUser);

        const createResult = await createMikrotikUser(mikrotikCredentials, mikrotikUser);
        console.log('✅ [TEST] User created successfully:', createResult);

        res.json({
            success: true,
            message: 'MikroTik user created successfully',
            data: {
                username: cleanMac,
                password: cleanMac,
                profile: plano_nome,
                mac_address: mac_address,
                mikrotik_ip: mikrotik.ip,
                created_at: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ [TEST] Error creating MikroTik user:', error);
        res.status(500).json({
            error: 'Failed to create MikroTik user',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Test endpoint to delete MikroTik user
router.post('/delete-mikrotik-user', async (req, res) => {
    try {
        const { mikrotik_id, mac_address } = req.body;

        if (!mikrotik_id || !mac_address) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Provide mikrotik_id and mac_address'
            });
        }

        console.log('🧪 [TEST] Starting MikroTik user deletion test');
        console.log('🧪 [TEST] Parameters:', { mikrotik_id, mac_address });

        // Get MikroTik details
        const { data: mikrotik, error: mikrotikError } = await supabase
            .from('mikrotiks')
            .select('ip, usuario, senha, porta')
            .eq('id', mikrotik_id)
            .single();

        if (mikrotikError || !mikrotik) {
            console.error('❌ [TEST] MikroTik not found:', mikrotikError);
            return res.status(404).json({
                error: 'MikroTik not found',
                message: 'The specified MikroTik was not found'
            });
        }

        const mikrotikCredentials = {
            ip: mikrotik.ip,
            usuario: mikrotik.usuario,
            senha: mikrotik.senha,
            porta: mikrotik.porta || 8728
        };

        const deleteResult = await deleteMikrotikUserByMac(mikrotikCredentials, mac_address);
        console.log('✅ [TEST] User deleted successfully:', deleteResult);

        res.json({
            success: true,
            message: 'MikroTik user deleted successfully',
            data: deleteResult
        });

    } catch (error) {
        console.error('❌ [TEST] Error deleting MikroTik user:', error);
        res.status(500).json({
            error: 'Failed to delete MikroTik user',
            message: error.message
        });
    }
});

// Helper function to delete MikroTik user by MAC
async function deleteMikrotikUserByMac(credentials, macAddress) {
    console.log('🗑️ [MIKROTIK] Attempting to delete user with MAC:', macAddress);
    
    const mikrotikApiUrl = process.env.MIKROTIK_API_URL || 'http://localhost:3001';
    const mikrotikApiToken = process.env.MIKROTIK_API_TOKEN;

    if (!mikrotikApiToken) {
        throw new Error('MIKROTIK_API_TOKEN not configured');
    }

    try {
        // First, list users to find the one with this MAC
        const listResponse = await axios.post(`${mikrotikApiUrl}/users/list`, {
            credentials: credentials
        }, {
            headers: {
                'Authorization': `Bearer ${mikrotikApiToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('📋 [MIKROTIK] Users list response:', listResponse.data);

        if (listResponse.data && listResponse.data.success && listResponse.data.data) {
            const users = listResponse.data.data;
            const userToDelete = users.find(user => 
                user['mac-address'] === macAddress || 
                user.name === macAddress.replace(/[:-]/g, '').toLowerCase()
            );

            if (userToDelete) {
                console.log('🎯 [MIKROTIK] Found user to delete:', userToDelete);
                
                // Delete the user
                const deleteResponse = await axios.post(`${mikrotikApiUrl}/users/delete`, {
                    credentials: credentials,
                    userId: userToDelete['.id']
                }, {
                    headers: {
                        'Authorization': `Bearer ${mikrotikApiToken}`,
                        'Content-Type': 'application/json'
                    }
                });

                console.log('✅ [MIKROTIK] User deleted:', deleteResponse.data);
                return deleteResponse.data;
            } else {
                console.log('ℹ️ [MIKROTIK] No user found with MAC:', macAddress);
                return { success: true, message: 'No user found with this MAC' };
            }
        }
    } catch (error) {
        console.error('❌ [MIKROTIK] Error in delete operation:', error.message);
        if (error.response) {
            console.error('❌ [MIKROTIK] Error response:', error.response.data);
        }
        throw error;
    }
}

// Helper function to create MikroTik user
async function createMikrotikUser(credentials, userData) {
    console.log('👤 [MIKROTIK] Creating user:', userData);
    
    const mikrotikApiUrl = process.env.MIKROTIK_API_URL || 'http://localhost:3001';
    const mikrotikApiToken = process.env.MIKROTIK_API_TOKEN;

    if (!mikrotikApiToken) {
        throw new Error('MIKROTIK_API_TOKEN not configured');
    }

    try {
        const response = await axios.post(`${mikrotikApiUrl}/users/create`, {
            credentials: credentials,
            user: userData
        }, {
            headers: {
                'Authorization': `Bearer ${mikrotikApiToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ [MIKROTIK] User creation response:', response.data);
        return response.data;
    } catch (error) {
        console.error('❌ [MIKROTIK] Error creating user:', error.message);
        if (error.response) {
            console.error('❌ [MIKROTIK] Error response:', error.response.data);
        }
        throw error;
    }
}

module.exports = router;