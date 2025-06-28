const express = require('express');
const router = express.Router();
const axios = require('axios');
const { supabase } = require('../config/database');

// Rota para gerenciar usuário MikroTik (deletar + criar)
router.post('/manage-user', async (req, res) => {
    try {
        const { mikrotik_id, mac_address, username, password, profile, comment } = req.body;

        if (!mikrotik_id || !mac_address) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Provide mikrotik_id and mac_address'
            });
        }

        console.log('🔧 [MIKROTIK-USER] Managing user for MAC:', mac_address);

        // Buscar dados do MikroTik no banco
        const { data: mikrotik, error: mikrotikError } = await supabase
            .from('mikrotiks')
            .select('ip, usuario, senha, porta')
            .eq('id', mikrotik_id)
            .single();

        if (mikrotikError || !mikrotik) {
            console.error('❌ [MIKROTIK-USER] MikroTik not found:', mikrotikError);
            return res.status(404).json({
                error: 'MikroTik not found',
                message: 'The specified MikroTik was not found'
            });
        }

        console.log('✅ [MIKROTIK-USER] MikroTik found:', mikrotik.ip);

        const credentials = {
            ip: mikrotik.ip,
            username: mikrotik.usuario,
            password: mikrotik.senha,
            port: mikrotik.porta || 8728
        };

        // Preparar dados do usuário
        const cleanMac = mac_address.replace(/[:-]/g, '').toLowerCase();
        const userData = {
            name: username || cleanMac,
            password: password || cleanMac,
            profile: profile || 'default',
            comment: comment || `Created via API - ${new Date().toISOString()}`,
            'mac-address': mac_address
        };

        // Executar operações
        const deleteResult = await deleteExistingUser(credentials, mac_address);
        const createResult = await createNewUser(credentials, userData);

        res.json({
            success: true,
            message: 'User management completed',
            data: {
                mikrotik_ip: mikrotik.ip,
                mac_address: mac_address,
                username: userData.name,
                password: userData.password,
                profile: userData.profile,
                delete_result: deleteResult,
                create_result: createResult
            }
        });

    } catch (error) {
        console.error('❌ [MIKROTIK-USER] Error managing user:', error);
        res.status(500).json({
            error: 'Failed to manage MikroTik user',
            message: error.message
        });
    }
});

// Rota para deletar usuário específico
router.post('/delete-user', async (req, res) => {
    try {
        const { mikrotik_id, mac_address } = req.body;

        if (!mikrotik_id || !mac_address) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Provide mikrotik_id and mac_address'
            });
        }

        // Buscar dados do MikroTik
        const { data: mikrotik, error: mikrotikError } = await supabase
            .from('mikrotiks')
            .select('ip, usuario, senha, porta')
            .eq('id', mikrotik_id)
            .single();

        if (mikrotikError || !mikrotik) {
            return res.status(404).json({
                error: 'MikroTik not found',
                message: 'The specified MikroTik was not found'
            });
        }

        const credentials = {
            ip: mikrotik.ip,
            username: mikrotik.usuario,
            password: mikrotik.senha,
            port: mikrotik.porta || 8728
        };

        const result = await deleteExistingUser(credentials, mac_address);

        res.json({
            success: true,
            message: 'User deletion completed',
            data: result
        });

    } catch (error) {
        console.error('❌ [MIKROTIK-USER] Error deleting user:', error);
        res.status(500).json({
            error: 'Failed to delete MikroTik user',
            message: error.message
        });
    }
});

// Rota para criar usuário
router.post('/create-user', async (req, res) => {
    try {
        const { mikrotik_id, mac_address, username, password, profile, comment } = req.body;

        if (!mikrotik_id || !mac_address) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Provide mikrotik_id and mac_address'
            });
        }

        // Buscar dados do MikroTik
        const { data: mikrotik, error: mikrotikError } = await supabase
            .from('mikrotiks')
            .select('ip, usuario, senha, porta')
            .eq('id', mikrotik_id)
            .single();

        if (mikrotikError || !mikrotik) {
            return res.status(404).json({
                error: 'MikroTik not found',
                message: 'The specified MikroTik was not found'
            });
        }

        const credentials = {
            ip: mikrotik.ip,
            username: mikrotik.usuario,
            password: mikrotik.senha,
            port: mikrotik.porta || 8728
        };

        const cleanMac = mac_address.replace(/[:-]/g, '').toLowerCase();
        const userData = {
            name: username || cleanMac,
            password: password || cleanMac,
            profile: profile || 'default',
            comment: comment || `Created via API - ${new Date().toISOString()}`,
            'mac-address': mac_address
        };

        const result = await createNewUser(credentials, userData);

        res.json({
            success: true,
            message: 'User creation completed',
            data: result
        });

    } catch (error) {
        console.error('❌ [MIKROTIK-USER] Error creating user:', error);
        res.status(500).json({
            error: 'Failed to create MikroTik user',
            message: error.message
        });
    }
});

// Função helper para deletar usuário existente
async function deleteExistingUser(credentials, macAddress) {
    try {
        console.log('🗑️ [MIKROTIK-USER] Searching for existing user with MAC:', macAddress);
        
        const mikrotikApiUrl = getMikroTikApiUrl();
        const mikrotikApiToken = process.env.MIKROTIK_API_TOKEN;

        if (!mikrotikApiToken) {
            throw new Error('MIKROTIK_API_TOKEN not configured');
        }

        // Listar usuários para encontrar o que tem este MAC
        const listResponse = await axios.get(`${mikrotikApiUrl}/hotspot/users`, {
            headers: {
                'Authorization': `Bearer ${mikrotikApiToken}`,
                'X-API-Token': mikrotikApiToken,
                'Content-Type': 'application/json'
            },
            params: credentials,
            timeout: 15000
        });

        if (listResponse.data?.success && listResponse.data?.data) {
            const users = listResponse.data.data;
            const cleanMac = macAddress.replace(/[:-]/g, '').toLowerCase();
            
            const userToDelete = users.find(user => 
                (user['mac-address'] && user['mac-address'].replace(/[:-]/g, '').toLowerCase() === cleanMac) ||
                (user.name && user.name.toLowerCase() === cleanMac)
            );

            if (userToDelete) {
                console.log('🎯 [MIKROTIK-USER] Found user to delete:', userToDelete.name);
                
                const deleteResponse = await axios.delete(`${mikrotikApiUrl}/hotspot/users`, {
                    headers: {
                        'Authorization': `Bearer ${mikrotikApiToken}`,
                        'X-API-Token': mikrotikApiToken,
                        'Content-Type': 'application/json'
                    },
                    params: {
                        ...credentials,
                        id: userToDelete['.id']
                    },
                    timeout: 15000
                });

                console.log('✅ [MIKROTIK-USER] User deleted successfully');
                return { success: true, deleted: true, user: userToDelete.name, response: deleteResponse.data };
            } else {
                console.log('ℹ️ [MIKROTIK-USER] No existing user found with MAC:', macAddress);
                return { success: true, deleted: false, message: 'No user found with this MAC' };
            }
        } else {
            throw new Error('Failed to list users');
        }
    } catch (error) {
        console.warn('⚠️ [MIKROTIK-USER] Delete warning:', error.message);
        return { success: false, deleted: false, error: error.message };
    }
}

// Função helper para criar novo usuário
async function createNewUser(credentials, userData) {
    try {
        console.log('👤 [MIKROTIK-USER] Creating new user:', userData.name);
        
        const mikrotikApiUrl = getMikroTikApiUrl();
        const mikrotikApiToken = process.env.MIKROTIK_API_TOKEN;

        if (!mikrotikApiToken) {
            throw new Error('MIKROTIK_API_TOKEN not configured');
        }

        const payload = {
            ...credentials,
            ...userData
        };

        console.log('📤 [MIKROTIK-USER] Sending create request with payload:', payload);

        const createResponse = await axios.post(`${mikrotikApiUrl}/hotspot/users`, payload, {
            headers: {
                'Authorization': `Bearer ${mikrotikApiToken}`,
                'X-API-Token': mikrotikApiToken,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        console.log('✅ [MIKROTIK-USER] User created successfully:', createResponse.data);
        return { success: true, created: true, response: createResponse.data };

    } catch (error) {
        console.error('❌ [MIKROTIK-USER] Error creating user:', error.message);
        if (error.response) {
            console.error('❌ [MIKROTIK-USER] Error response:', error.response.data);
        }
        throw error;
    }
}

// Função helper para obter URL da API MikroTik
function getMikroTikApiUrl() {
    const url = process.env.MIKROTIK_API_URL;
    if (!url) {
        throw new Error('MIKROTIK_API_URL not configured');
    }
    return url;
}

module.exports = router;