const express = require('express');
const router = express.Router();
const axios = require('axios');
const { supabase } = require('../config/database');

// Test endpoint to check MikroTik API VPS2 connectivity
router.get('/mikrotik-api-health', async (req, res) => {
    try {
        const mikrotikApiUrl = process.env.MIKROTIK_API_URL || 'http://localhost:3001';
        const mikrotikApiToken = process.env.MIKROTIK_API_TOKEN;

        console.log('🔍 [TEST] Testing MikroTik API connectivity...');
        console.log('🔍 [TEST] URL:', mikrotikApiUrl);
        console.log('🔍 [TEST] Token configured:', !!mikrotikApiToken);

        if (!mikrotikApiToken) {
            return res.status(400).json({
                error: 'Configuration error',
                message: 'MIKROTIK_API_TOKEN not configured'
            });
        }

        // Test basic connectivity - try different common endpoints
        let healthResponse;
        const testEndpoints = [
            '/health',
            '/',
            '/status',
            '/api/health'
        ];

        for (const endpoint of testEndpoints) {
            try {
                console.log(`🔍 [TEST] Trying endpoint: ${mikrotikApiUrl}${endpoint}`);
                healthResponse = await axios.get(`${mikrotikApiUrl}${endpoint}`, {
                    headers: {
                        'Authorization': `Bearer ${mikrotikApiToken}`,
                        'X-API-Token': mikrotikApiToken
                    },
                    timeout: 5000
                });
                console.log(`✅ [TEST] Working endpoint found: ${endpoint}`);
                break;
            } catch (err) {
                console.log(`❌ [TEST] Endpoint ${endpoint} failed: ${err.message}`);
                if (endpoint === testEndpoints[testEndpoints.length - 1]) {
                    throw err; // Rethrow last error
                }
            }
        }

        console.log('✅ [TEST] MikroTik API health response:', healthResponse.data);

        res.json({
            success: true,
            message: 'MikroTik API VPS2 is reachable',
            data: {
                url: mikrotikApiUrl,
                status: healthResponse.status,
                response: healthResponse.data
            }
        });

    } catch (error) {
        console.error('❌ [TEST] MikroTik API connectivity error:', error.message);
        
        res.status(500).json({
            error: 'MikroTik API connectivity failed',
            message: error.message,
            details: {
                url: process.env.MIKROTIK_API_URL,
                tokenConfigured: !!process.env.MIKROTIK_API_TOKEN,
                errorCode: error.code,
                errorType: error.name
            }
        });
    }
});

// Test endpoint to check MikroTik data in database
router.post('/check-mikrotik', async (req, res) => {
    try {
        const { mikrotik_id } = req.body;

        if (!mikrotik_id) {
            return res.status(400).json({
                error: 'Missing mikrotik_id',
                message: 'Provide mikrotik_id in request body'
            });
        }

        console.log('🔍 [TEST] Checking MikroTik data for ID:', mikrotik_id);

        // Get MikroTik details from database
        const { data: mikrotik, error: mikrotikError } = await supabase
            .from('mikrotiks')
            .select('*')
            .eq('id', mikrotik_id)
            .single();

        if (mikrotikError) {
            console.error('❌ [TEST] Database error:', mikrotikError);
            return res.status(500).json({
                error: 'Database error',
                message: mikrotikError.message
            });
        }

        if (!mikrotik) {
            console.error('❌ [TEST] MikroTik not found:', mikrotik_id);
            return res.status(404).json({
                error: 'MikroTik not found',
                message: 'The specified MikroTik was not found in database'
            });
        }

        console.log('✅ [TEST] MikroTik found:', {
            id: mikrotik.id,
            nome: mikrotik.nome,
            ip: mikrotik.ip,
            hasCredentials: !!(mikrotik.usuario && mikrotik.senha)
        });

        // Also check if there are any plans for this MikroTik
        const { data: planos, error: planosError } = await supabase
            .from('planos')
            .select('id, nome, valor, session_timeout, ativo, visivel')
            .eq('mikrotik_id', mikrotik_id)
            .eq('ativo', true)
            .eq('visivel', true);

        res.json({
            success: true,
            data: {
                mikrotik: {
                    id: mikrotik.id,
                    nome: mikrotik.nome,
                    ip: mikrotik.ip,
                    porta: mikrotik.porta,
                    usuario: mikrotik.usuario ? '***' : null,
                    senha: mikrotik.senha ? '***' : null,
                    porcentagem_admin: mikrotik.porcentagem_admin,
                    ativo: mikrotik.ativo
                },
                planos: planos || [],
                planos_count: planos?.length || 0,
                has_credentials: !!(mikrotik.usuario && mikrotik.senha),
                has_connection_data: !!(mikrotik.ip && mikrotik.porta)
            }
        });

    } catch (error) {
        console.error('❌ [TEST] Error checking MikroTik:', error);
        res.status(500).json({
            error: 'Failed to check MikroTik',
            message: error.message
        });
    }
});

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
    
    const mikrotikApiUrl = process.env.MIKROTIK_API_URL;
    const mikrotikApiToken = process.env.MIKROTIK_API_TOKEN;

    if (!mikrotikApiToken) {
        throw new Error('MIKROTIK_API_TOKEN not configured');
    }

    try {
        // Try different possible endpoints for listing users
        const possibleEndpoints = [
            '/api/hotspot/users',
            '/hotspot/users',
            '/api/users',
            '/users'
        ];

        let listResponse;
        let workingEndpoint;

        for (const endpoint of possibleEndpoints) {
            try {
                console.log(`🔍 [MIKROTIK] Trying list endpoint: ${endpoint}`);
                listResponse = await axios.get(`${mikrotikApiUrl}${endpoint}`, {
                    headers: {
                        'Authorization': `Bearer ${mikrotikApiToken}`,
                        'X-API-Token': mikrotikApiToken,
                        'Content-Type': 'application/json'
                    },
                    params: {
                        ip: credentials.ip,
                        username: credentials.usuario,
                        password: credentials.senha,
                        port: credentials.porta
                    },
                    timeout: 10000
                });
                workingEndpoint = endpoint;
                console.log(`✅ [MIKROTIK] Working list endpoint: ${endpoint}`);
                break;
            } catch (err) {
                console.log(`❌ [MIKROTIK] Endpoint ${endpoint} failed: ${err.message}`);
            }
        }

        if (!listResponse) {
            throw new Error('No working endpoint found for listing users');
        }

        console.log('📋 [MIKROTIK] Users list response:', listResponse.data);

        if (listResponse.data && (listResponse.data.success || Array.isArray(listResponse.data))) {
            const users = listResponse.data.data || listResponse.data;
            const cleanMac = macAddress.replace(/[:-]/g, '').toLowerCase();
            
            const userToDelete = users.find(user => 
                (user['mac-address'] && user['mac-address'].replace(/[:-]/g, '').toLowerCase() === cleanMac) ||
                (user.name && user.name.toLowerCase() === cleanMac)
            );

            if (userToDelete) {
                console.log('🎯 [MIKROTIK] Found user to delete:', userToDelete);
                
                // Try to delete using the same base endpoint
                const deleteEndpoint = workingEndpoint + (userToDelete['.id'] ? `/${userToDelete['.id']}` : '');
                
                const deleteResponse = await axios.delete(`${mikrotikApiUrl}${deleteEndpoint}`, {
                    headers: {
                        'Authorization': `Bearer ${mikrotikApiToken}`,
                        'X-API-Token': mikrotikApiToken,
                        'Content-Type': 'application/json'
                    },
                    params: {
                        ip: credentials.ip,
                        username: credentials.usuario,
                        password: credentials.senha,
                        port: credentials.porta,
                        id: userToDelete['.id'] || userToDelete.id
                    },
                    timeout: 10000
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
        // Don't throw, just warn - we'll continue to create
        console.warn('⚠️ [MIKROTIK] Delete failed, continuing...');
        return { success: false, message: error.message };
    }
}

// Helper function to create MikroTik user
async function createMikrotikUser(credentials, userData) {
    console.log('👤 [MIKROTIK] Creating user:', userData);
    
    const mikrotikApiUrl = process.env.MIKROTIK_API_URL;
    const mikrotikApiToken = process.env.MIKROTIK_API_TOKEN;

    if (!mikrotikApiToken) {
        throw new Error('MIKROTIK_API_TOKEN not configured');
    }

    try {
        // Try different possible endpoints for creating users
        const possibleEndpoints = [
            '/api/hotspot/users',
            '/hotspot/users',
            '/api/users',
            '/users'
        ];

        let createResponse;
        let workingEndpoint;

        for (const endpoint of possibleEndpoints) {
            try {
                console.log(`🔍 [MIKROTIK] Trying create endpoint: ${endpoint}`);
                
                const payload = {
                    ...userData,
                    // Add connection params
                    ip: credentials.ip,
                    username: credentials.usuario,
                    password: credentials.senha,
                    port: credentials.porta
                };

                createResponse = await axios.post(`${mikrotikApiUrl}${endpoint}`, payload, {
                    headers: {
                        'Authorization': `Bearer ${mikrotikApiToken}`,
                        'X-API-Token': mikrotikApiToken,
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                });
                
                workingEndpoint = endpoint;
                console.log(`✅ [MIKROTIK] Working create endpoint: ${endpoint}`);
                break;
            } catch (err) {
                console.log(`❌ [MIKROTIK] Endpoint ${endpoint} failed: ${err.message}`);
                if (err.response) {
                    console.log(`❌ [MIKROTIK] Error response for ${endpoint}:`, err.response.data);
                }
            }
        }

        if (!createResponse) {
            throw new Error('No working endpoint found for creating users');
        }

        console.log('✅ [MIKROTIK] User creation response:', createResponse.data);
        return createResponse.data;
    } catch (error) {
        console.error('❌ [MIKROTIK] Error creating user:', error.message);
        if (error.response) {
            console.error('❌ [MIKROTIK] Error response:', error.response.data);
        }
        throw error;
    }
}

module.exports = router;