const axios = require('axios');
const { supabase } = require('../config/database');
const templateService = require('../services/templateService');
const errorLogService = require('../services/errorLogService');

const MIKROTIK_API_URL = process.env.MIKROTIK_API_URL;

const getMikrotikCredentials = async (mikrotikId, userId) => {
  const { data: mikrotik, error } = await supabase
    .from('mikrotiks')
    .select('*')
    .eq('id', mikrotikId)
    .eq('user_id', userId)
    .single();

  if (error || !mikrotik) {
    throw new Error('MikroTik não encontrado ou não autorizado');
  }

  if (!mikrotik.ativo) {
    throw new Error('MikroTik está inativo');
  }

  // Check if essential fields are present
  const ip = mikrotik.ip_address || mikrotik.ip;
  const username = mikrotik.usuario || mikrotik.username;
  const password = mikrotik.senha || mikrotik.password;

  if (!ip || !username || !password) {
    throw new Error('Credenciais do MikroTik incompletas. Verifique se IP, usuário e senha estão configurados.');
  }

  return {
    ip,
    username,
    password,
    port: mikrotik.porta || mikrotik.port || 8728,
    mikrotik
  };
};

const makeApiRequest = async (endpoint, credentials, method = 'GET', data = null) => {
  const url = `${MIKROTIK_API_URL}${endpoint}`;
  const params = {
    ip: credentials.ip,
    username: credentials.username,
    password: credentials.password,
    port: credentials.port
  };

  try {
    const config = {
      method,
      url,
      params,
      timeout: 15000,
      headers: {}
    };

    // Adicionar token da API MikroTik se configurado
    if (process.env.MIKROTIK_API_TOKEN) {
      config.headers['Authorization'] = `Bearer ${process.env.MIKROTIK_API_TOKEN}`;
    }

    if (data && (method === 'POST' || method === 'PUT')) {
      config.data = data;
      config.headers['Content-Type'] = 'application/json';
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error('API Request Error:', error.message);

    // Log detalhado no banco
    try {
      const errorType = error.code === 'ECONNABORTED' || error.message?.includes('timeout') ? 'timeout' : 'request_error';
      await errorLogService.logError({
        component: 'MIKROTIK_API',
        errorType,
        errorMessage: error.message,
        errorStack: error.stack,
        context: {
          endpoint,
          method,
          ip: credentials.ip,
          port: credentials.port,
          username: credentials.username
        },
        mikrotikId: credentials.mikrotik?.id,
        severity: 'warn'
      });
    } catch (logErr) {
      console.error('Failed to log API error:', logErr.message);
    }

    if (!error.response) {
      // Erro de rede: API VPS2 inacessível
      await errorLogService.logError({
        component: 'MIKROTIK_API',
        errorType: 'api_unreachable',
        errorMessage: error.message,
        errorStack: error.stack,
        context: { endpoint, method, ip: credentials.ip },
        severity: 'error'
      });
      throw new Error('API Mikrotik indisponível');
    }

    const apiError = error.response.data?.error || '';

    // Classificar erros devolvidos pela API VPS2
    let friendlyMsg = apiError || 'Erro na API do MikroTik';
    let errorType = 'request_error';

    if (apiError.toLowerCase().includes('timeout')) {
      friendlyMsg = 'MikroTik offline ou IP inválido';
      errorType = 'device_unreachable';
    } else if (apiError.toLowerCase().includes('autenticação') || apiError.toLowerCase().includes('authentication')) {
      friendlyMsg = 'Usuário ou senha do MikroTik incorretos';
      errorType = 'auth_failure';
    }

    await errorLogService.logError({
      component: 'MIKROTIK_API',
      errorType,
      errorMessage: apiError,
      errorStack: error.stack,
      context: { endpoint, method, ip: credentials.ip },
      mikrotikId: credentials.mikrotik?.id,
      severity: errorType === 'device_unreachable' ? 'info' : (errorType === 'request_error' ? 'warn' : 'error')
    });

    throw new Error(friendlyMsg);
  }
};

const getStats = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    
    // Try to get credentials first
    let credentials;
    try {
      credentials = await getMikrotikCredentials(mikrotikId, req.user.id);
    } catch (credError) {
      console.error('Credentials error:', credError.message);
      return res.status(400).json({
        success: false,
        error: credError.message,
        needsConfiguration: true
      });
    }

    // Get system resource info with detailed logging and error handling
    const [hotspotStats, systemInfo, systemResource, routerboardInfo] = await Promise.allSettled([
      makeApiRequest('/hotspot/stats', credentials),
      makeApiRequest('/system/info', credentials),
      makeApiRequest('/system/resource', credentials),
      makeApiRequest('/system/routerboard', credentials)
    ]);

    // Extract successful results or provide defaults
    const hotspotData = hotspotStats.status === 'fulfilled' ? hotspotStats.value : { data: {} };
    const systemData = systemInfo.status === 'fulfilled' ? systemInfo.value : { data: {} };
    const resourceData = systemResource.status === 'fulfilled' ? systemResource.value : { data: {} };
    const routerboardData = routerboardInfo.status === 'fulfilled' ? routerboardInfo.value : { data: {} };

    // Log any failures for debugging
    if (hotspotStats.status === 'rejected') {
      console.warn('Hotspot stats failed:', hotspotStats.reason?.message);
    }
    if (systemInfo.status === 'rejected') {
      console.warn('System info failed:', systemInfo.reason?.message);
    }
    if (systemResource.status === 'rejected') {
      console.warn('System resource failed:', systemResource.reason?.message);
    }
    if (routerboardInfo.status === 'rejected') {
      console.warn('Routerboard info failed:', routerboardInfo.reason?.message);
    }

    // Combine system info and resource data for comprehensive stats
    const combinedSystemData = {
      ...systemData.data,
      resource: resourceData.data,
      routerboard: routerboardData.data
    };

    console.log('Combined system data:', JSON.stringify(combinedSystemData, null, 2))
    console.log('Routerboard data:', JSON.stringify(routerboardData.data, null, 2))

    res.json({
      success: true,
      data: {
        mikrotik: credentials.mikrotik,
        hotspot: hotspotData.data,
        system: combinedSystemData
      },
      warnings: {
        hotspotFailed: hotspotStats.status === 'rejected',
        systemInfoFailed: systemInfo.status === 'rejected',
        resourceFailed: systemResource.status === 'rejected',
        routerboardFailed: routerboardInfo.status === 'rejected'
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const getHotspotUsers = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    
    console.log(`[BACKEND-USERS] Requisição para buscar usuários do MikroTik ${mikrotikId}`);
    
    let credentials;
    try {
      credentials = await getMikrotikCredentials(mikrotikId, req.user.id);
      console.log(`[BACKEND-USERS] Credenciais obtidas para ${credentials.ip}:${credentials.port}`);
    } catch (credError) {
      console.error('Credentials error:', credError.message);
      return res.status(400).json({
        success: false,
        error: credError.message,
        needsConfiguration: true
      });
    }

    const response = await makeApiRequest('/hotspot/users', credentials);
    
    console.log(`[BACKEND-USERS] Resposta da API VPS2:`, {
      success: response.success,
      dataType: typeof response.data,
      isArray: Array.isArray(response.data),
      count: response.count,
      dataLength: response.data?.length
    });

    res.json({
      success: true,
      data: response.data,
      count: response.count
    });
  } catch (error) {
    console.error('Get hotspot users error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const getActiveUsers = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    
    let credentials;
    try {
      credentials = await getMikrotikCredentials(mikrotikId, req.user.id);
    } catch (credError) {
      console.error('Credentials error:', credError.message);
      return res.status(400).json({
        success: false,
        error: credError.message,
        needsConfiguration: true
      });
    }

    const response = await makeApiRequest('/hotspot/active-users', credentials);

    res.json({
      success: true,
      data: response.data,
      count: response.count
    });
  } catch (error) {
    console.error('Get active users error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const getHotspotProfiles = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    
    let credentials;
    try {
      credentials = await getMikrotikCredentials(mikrotikId, req.user.id);
    } catch (credError) {
      console.error('Credentials error:', credError.message);
      return res.status(400).json({
        success: false,
        error: credError.message,
        needsConfiguration: true
      });
    }

    // Get profiles from MikroTik
    const response = await makeApiRequest('/hotspot/profiles', credentials);
    const mikrotikProfiles = response.data || [];

    // Get plans from database to match with MikroTik profiles
    const { data: dbPlans, error: dbError } = await supabase
      .from('planos')
      .select('*')
      .eq('mikrotik_id', mikrotikId);

    if (dbError) {
      console.warn('Warning: Could not fetch database plans:', dbError);
    }

    // Enhance profiles with database information
    const enhancedProfiles = mikrotikProfiles.map(profile => {
      const matchingPlan = dbPlans?.find(plan => 
        plan.nome === profile.name || plan.mikrotik_profile_id === profile['.id']
      );
      
      return {
        ...profile,
        valor: matchingPlan?.valor || 0,
        inDatabase: !!matchingPlan,
        supabaseId: matchingPlan?.id,
        dbPlan: matchingPlan
      };
    });

    res.json({
      success: true,
      data: enhancedProfiles,
      count: enhancedProfiles.length,
      dbPlansCount: dbPlans?.length || 0
    });
  } catch (error) {
    console.error('Get hotspot profiles error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const createHotspotProfile = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    // Map field names from frontend format to MikroTik API format
    const profileData = {
      name: req.body.name,
      rate_limit: req.body['rate-limit'] || req.body.rate_limit,
      session_timeout: req.body['session-timeout'] || req.body.session_timeout,
      idle_timeout: req.body['idle-timeout'] || req.body.idle_timeout,
      comment: req.body.comment,
      disabled: req.body.disabled
    };

    // Remove undefined fields
    Object.keys(profileData).forEach(key => {
      if (profileData[key] === undefined) {
        delete profileData[key];
      }
    });

    console.log('Profile data being sent to VPS2 (create):', profileData);

    // Create profile in MikroTik first
    const response = await makeApiRequest('/hotspot/profiles', credentials, 'POST', profileData);
    
    // If successful and we have additional data for database, create database record
    if (response.success && req.body.createInDatabase) {
      const profileId = response.data?.['.id'];
      
      // Validate and convert session_timeout properly
      let sessionTimeout = req.body['session-timeout'];
      if (!sessionTimeout || sessionTimeout === '0' || sessionTimeout === 0) {
        sessionTimeout = '3600'; // Default to 1 hour if not provided or zero
      }
      
      const { data: dbPlan, error: dbError } = await supabase
        .from('planos')
        .insert({
          mikrotik_id: mikrotikId,
          nome: req.body.name,
          mikrotik_profile_id: profileId,
          valor: req.body.valor || 0,
          descricao: req.body.descricao || `Plano ${req.body.name}`,
          rate_limit: req.body['rate-limit'],
          session_timeout: sessionTimeout,
          idle_timeout: req.body['idle-timeout'] || '300',
          velocidade_upload: req.body['rate-limit']?.split('/')[0],
          velocidade_download: req.body['rate-limit']?.split('/')[1],
          minutos: sessionTimeout ? Math.floor(parseInt(sessionTimeout) / 60) : null
        })
        .select()
        .single();
      
      if (dbError) {
        console.warn('Warning: Profile created in MikroTik but not in database:', dbError);
      }
    }

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Create hotspot profile error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const updateHotspotProfile = async (req, res) => {
  try {
    const { mikrotikId, profileId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    // Map field names from frontend format to MikroTik API format
    const profileData = {
      name: req.body.name,
      rate_limit: req.body['rate-limit'] || req.body.rate_limit,
      session_timeout: req.body['session-timeout'] || req.body.session_timeout,
      idle_timeout: req.body['idle-timeout'] || req.body.idle_timeout,
      comment: req.body.comment,
      disabled: req.body.disabled
    };

    // Remove undefined fields
    Object.keys(profileData).forEach(key => {
      if (profileData[key] === undefined) {
        delete profileData[key];
      }
    });

    console.log('Profile data being sent to VPS2:', profileData);

    // Update profile in MikroTik - add profileId to query string, not body
    const response = await makeApiRequest(`/hotspot/profiles?id=${profileId}`, credentials, 'PUT', profileData);

    // If successful and we have a database plan, update it too
    if (response.success && req.body.updateInDatabase) {
      const { data: dbPlan, error: findError } = await supabase
        .from('planos')
        .select('*')
        .eq('mikrotik_profile_id', profileId)
        .eq('mikrotik_id', mikrotikId)
        .single();

      if (!findError && dbPlan) {
        // Validate and convert session_timeout properly
        let sessionTimeout = req.body['session-timeout'];
        if (sessionTimeout && (sessionTimeout === '0' || sessionTimeout === 0)) {
          sessionTimeout = '3600'; // Default to 1 hour if zero
        }
        
        const { error: updateError } = await supabase
          .from('planos')
          .update({
            nome: req.body.name,
            valor: req.body.valor || dbPlan.valor,
            rate_limit: req.body['rate-limit'],
            session_timeout: sessionTimeout || dbPlan.session_timeout,
            idle_timeout: req.body['idle-timeout'] || dbPlan.idle_timeout,
            velocidade_upload: req.body['rate-limit']?.split('/')[0],
            velocidade_download: req.body['rate-limit']?.split('/')[1],
            minutos: sessionTimeout ? Math.floor(parseInt(sessionTimeout) / 60) : dbPlan.minutos,
            updated_at: new Date().toISOString()
          })
          .eq('id', dbPlan.id);

        if (updateError) {
          console.warn('Warning: Profile updated in MikroTik but not in database:', updateError);
        }
      }
    }

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Update hotspot profile error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const deleteHotspotProfile = async (req, res) => {
  try {
    const { mikrotikId, profileId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    // Delete from database first (if exists)
    const { data: dbPlan, error: findError } = await supabase
      .from('planos')
      .select('*')
      .eq('mikrotik_profile_id', profileId)
      .eq('mikrotik_id', mikrotikId)
      .single();

    if (!findError && dbPlan) {
      const { error: deleteError } = await supabase
        .from('planos')
        .delete()
        .eq('id', dbPlan.id);

      if (deleteError) {
        console.warn('Warning: Could not delete plan from database:', deleteError);
      }
    }

    // Delete profile from MikroTik
    const response = await makeApiRequest(`/hotspot/profiles?id=${profileId}`, credentials, 'DELETE');

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Delete hotspot profile error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const createHotspotUser = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    const response = await makeApiRequest('/hotspot/users', credentials, 'POST', req.body);

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Create hotspot user error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const updateHotspotUser = async (req, res) => {
  try {
    const { mikrotikId, userId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    const response = await makeApiRequest(`/hotspot/users?id=${userId}`, credentials, 'PUT', req.body);

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Update hotspot user error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const deleteHotspotUser = async (req, res) => {
  try {
    const { mikrotikId, userId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    const response = await makeApiRequest(`/hotspot/users?id=${userId}`, credentials, 'DELETE');

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Delete hotspot user error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const disconnectUser = async (req, res) => {
  try {
    const { mikrotikId, userId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    const response = await makeApiRequest(`/hotspot/disconnect?id=${userId}`, credentials, 'POST');

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Disconnect user error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const getSystemInfo = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    const response = await makeApiRequest('/system/info', credentials);

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Get system info error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const getDetailedSystemInfo = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    const [systemInfo, resource, interfaces, logs] = await Promise.all([
      makeApiRequest('/system/info', credentials),
      makeApiRequest('/system/resource', credentials),
      makeApiRequest('/system/interfaces', credentials),
      makeApiRequest('/system/logs', credentials).catch(() => ({ data: [] }))
    ]);

    res.json({
      success: true,
      data: {
        mikrotik: credentials.mikrotik,
        system: systemInfo.data,
        resource: resource.data,
        interfaces: interfaces.data,
        logs: logs.data,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get detailed system info error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const getSystemResource = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    const response = await makeApiRequest('/system/resource', credentials);

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Get system resource error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const getSystemInterfaces = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    const response = await makeApiRequest('/system/interfaces', credentials);

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Get system interfaces error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const restartSystem = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    const response = await makeApiRequest('/system/reboot', credentials, 'POST');

    res.json({
      success: true,
      data: response.data,
      message: 'Comando de reinicialização enviado com sucesso'
    });
  } catch (error) {
    console.error('Restart system error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ==================== SERVIDORES HOTSPOT ====================

const getHotspotServers = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    
    let credentials;
    try {
      credentials = await getMikrotikCredentials(mikrotikId, req.user.id);
    } catch (credError) {
      console.error('Credentials error:', credError.message);
      return res.status(400).json({
        success: false,
        error: credError.message,
        needsConfiguration: true
      });
    }

    const response = await makeApiRequest('/hotspot/servers', credentials);

    res.json({
      success: true,
      data: response.data,
      count: response.count
    });
  } catch (error) {
    console.error('Get hotspot servers error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const createHotspotServer = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    const response = await makeApiRequest('/hotspot/servers', credentials, 'POST', req.body);

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Create hotspot server error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const updateHotspotServer = async (req, res) => {
  try {
    const { mikrotikId, serverId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    const response = await makeApiRequest(`/hotspot/servers?id=${serverId}`, credentials, 'PUT', req.body);

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Update hotspot server error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const deleteHotspotServer = async (req, res) => {
  try {
    const { mikrotikId, serverId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    const response = await makeApiRequest(`/hotspot/servers?id=${serverId}`, credentials, 'DELETE');

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Delete hotspot server error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ==================== SERVER PROFILES ====================

const getHotspotServerProfiles = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    
    let credentials;
    try {
      credentials = await getMikrotikCredentials(mikrotikId, req.user.id);
    } catch (credError) {
      console.error('Credentials error:', credError.message);
      return res.status(400).json({
        success: false,
        error: credError.message,
        needsConfiguration: true
      });
    }

    const response = await makeApiRequest('/hotspot/server-profiles', credentials);

    res.json({
      success: true,
      data: response.data,
      count: response.count
    });
  } catch (error) {
    console.error('Get hotspot server profiles error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const createHotspotServerProfile = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    const response = await makeApiRequest('/hotspot/server-profiles', credentials, 'POST', req.body);

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Create hotspot server profile error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const updateHotspotServerProfile = async (req, res) => {
  try {
    const { mikrotikId, serverProfileId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    const response = await makeApiRequest(`/hotspot/server-profiles?id=${serverProfileId}`, credentials, 'PUT', req.body);

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Update hotspot server profile error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const deleteHotspotServerProfile = async (req, res) => {
  try {
    const { mikrotikId, serverProfileId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    const response = await makeApiRequest(`/hotspot/server-profiles?id=${serverProfileId}`, credentials, 'DELETE');

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Delete hotspot server profile error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ==================== TEMPLATES ====================

// Get template preview image
const getTemplatePreview = async (req, res) => {
  try {
    const { templateId } = req.params;
    const fs = require('fs');
    const path = require('path');
    
    console.log(`[GET-TEMPLATE-PREVIEW] Serving preview for template: ${templateId}`);
    
    const previewPath = path.join(__dirname, '../../templates', templateId, 'preview.png');
    
    if (!fs.existsSync(previewPath)) {
      console.log(`[GET-TEMPLATE-PREVIEW] Preview not found: ${previewPath}`);
      return res.status(404).json({
        success: false,
        error: 'Preview image not found'
      });
    }
    
    // Set proper headers
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    
    console.log(`[GET-TEMPLATE-PREVIEW] Serving preview: ${previewPath}`);
    
    // Send file
    const fileStream = fs.createReadStream(previewPath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      console.error(`[GET-TEMPLATE-PREVIEW] Error reading file:`, error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Error reading preview file' });
      }
    });
    
  } catch (error) {
    console.error('[GET-TEMPLATE-PREVIEW] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get available templates
const getTemplates = async (req, res) => {
  try {
    console.log('[GET-TEMPLATES] Requisição recebida');
    console.log('[GET-TEMPLATES] Headers:', req.headers);
    console.log('[GET-TEMPLATES] User:', req.user?.id);
    
    const templates = templateService.getAvailableTemplates();
    console.log('[GET-TEMPLATES] Templates encontrados:', templates.length);
    
    res.json({
      success: true,
      data: templates,
      count: templates.length
    });
    
    console.log('[GET-TEMPLATES] Resposta enviada com sucesso');
  } catch (error) {
    console.error('[GET-TEMPLATES] Erro:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get template details
const getTemplateDetails = async (req, res) => {
  try {
    const { templateId } = req.params;
    
    const templateConfig = templateService.getTemplateConfig(templateId);
    
    if (!templateConfig) {
      return res.status(404).json({
        success: false,
        error: 'Template não encontrado'
      });
    }

    const templateStats = templateService.getTemplateStats(templateId);
    
    res.json({
      success: true,
      data: {
        ...templateConfig,
        stats: templateStats
      }
    });
  } catch (error) {
    console.error('Error getting template details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get template files list
const getTemplateFiles = async (req, res) => {
  try {
    const { templateId } = req.params;
    
    const templateFiles = templateService.getTemplateFiles(templateId);
    
    res.json({
      success: true,
      data: templateFiles,
      count: templateFiles.length
    });
  } catch (error) {
    console.error('Error getting template files:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get template HTML content
const getTemplateHtml = async (req, res) => {
  try {
    const { templateId } = req.params;
    
    const templateConfig = templateService.getTemplateConfig(templateId);
    
    if (!templateConfig) {
      return res.status(404).json({
        success: false,
        error: 'Template não encontrado'
      });
    }

    // Obter HTML do template
    const templateHtml = await templateService.getTemplateHtml(templateId);
    
    res.json({
      success: true,
      html: templateHtml,
      templateId: templateId
    });
  } catch (error) {
    console.error('Error getting template HTML:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Apply template to MikroTik using new template service
const applyTemplate = async (req, res) => {
  try {
    const { 
      mikrotikId, 
      serverProfileId, 
      templateId, 
      variables,
      templateContent
    } = req.body

    // Validar parâmetros obrigatórios
    if (!templateId) {
      return res.status(400).json({
        success: false,
        error: 'templateId é obrigatório'
      });
    }

    if (!mikrotikId) {
      return res.status(400).json({
        success: false,
        error: 'mikrotikId é obrigatório'
      });
    }

    // Get MikroTik credentials
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id)

    console.log(`[APPLY-TEMPLATE] Aplicando template ${templateId} para MikroTik ${mikrotikId}`)

    // Se templateContent foi enviado pelo frontend, processar todos os arquivos do template
    let processedFiles;
    if (templateContent) {
      console.log(`[APPLY-TEMPLATE] Usando template processado do frontend`)
      
      // Processar todos os arquivos do template, não apenas login.html
      const allTemplateFiles = await templateService.processTemplate(templateId, variables || {}, mikrotikId);
      
      // Substituir apenas o login.html com o conteúdo processado do frontend
      processedFiles = allTemplateFiles.map(file => {
        if (file.name === 'login.html') {
          return {
            ...file,
            content: templateContent
          };
        }
        return file;
      });
      
      console.log(`[APPLY-TEMPLATE] Template processado com ${processedFiles.length} arquivo(s):`)
      processedFiles.forEach(f => {
        console.log(`  - ${f.name} -> ${f.path}`)
      })
    } else {
      // Fallback para o método antigo
      try {
        templateService.validateVariables(templateId, variables || {});
      } catch (validationError) {
        return res.status(400).json({
          success: false,
          error: validationError.message
        });
      }

      // Processar template com o novo serviço
      processedFiles = await templateService.processTemplate(templateId, variables || {}, mikrotikId);
    }

    console.log(`[APPLY-TEMPLATE] Template processado: ${processedFiles.length} arquivo(s)`)

    // Configurar URLs e cache
    const MIKROTIK_API_URL = process.env.MIKROTIK_API_URL || 'http://193.181.208.141:3000'
    const baseUrl = process.env.BASE_URL || 'https://api.mikropix.online'
    
    // Armazenar temporariamente os arquivos para download
    global.templateCache = global.templateCache || new Map()
    
    const fetchResults = []
    
    // Processar cada arquivo individualmente
    for (const file of processedFiles) {
      const uniqueFileName = `${file.name.replace(/[/\\]/g, '_')}_${mikrotikId}_${Date.now()}`
      const downloadUrl = `${baseUrl}/api/mikrotik/template/${uniqueFileName}`
      
      // Armazenar arquivo no cache temporário
      global.templateCache.set(uniqueFileName, file.content)
      
      console.log(`[APPLY-TEMPLATE] Fazendo fetch de ${file.name} para ${file.path}`)
      
      // Verificar se o arquivo está em uma subpasta
      const isInSubfolder = file.name.includes('/');
      if (isInSubfolder) {
        console.log(`[APPLY-TEMPLATE] Arquivo está em subpasta: ${file.name}`)
      }
      
      try {
        // Executar comando fetch via RouterOS API para cada arquivo
        const fetchResponse = await axios.post(`${MIKROTIK_API_URL}/tools/fetch`, {
          url: downloadUrl,
          mode: 'http',
          'dst-path': file.path // Manter o path completo flash/mikropix/arquivo
        }, {
          params: {
            ip: credentials.ip,
            username: credentials.username,
            password: credentials.password,
            port: credentials.port || '8728'
          },
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.MIKROTIK_API_TOKEN || ''}`
          },
          timeout: 30000
        })
        
        fetchResults.push({
          file: file.name,
          success: true,
          data: fetchResponse.data
        })
        
        console.log(`[APPLY-TEMPLATE] Fetch de ${file.name} concluído com sucesso`)
        
      } catch (fetchError) {
        console.warn(`[APPLY-TEMPLATE] Erro no fetch de ${file.name}:`, fetchError.message)
        fetchResults.push({
          file: file.name,
          success: false,
          error: fetchError.message,
          downloadUrl: downloadUrl
        })
      }
      
      // Limpar o cache após um tempo
      setTimeout(() => {
        global.templateCache.delete(uniqueFileName)
      }, 300000) // 5 minutos
    }
    
    const uploadResponse = { data: { success: true, files: fetchResults } }

    // Update server profile to use the new template directory
    if (serverProfileId) {
      try {
        console.log('Updating server profile with template path...')
        
        // Get list of hotspot profiles (comando que funciona)
        let serverProfiles = []
        
        try {
          const listResponse = await axios.get(`${MIKROTIK_API_URL}/hotspot/server-profiles`, {
            params: {
              ip: credentials.ip,
              username: credentials.username,
              password: credentials.password,
              port: credentials.port
            },
            headers: {
              'Authorization': `Bearer ${process.env.MIKROTIK_API_TOKEN || ''}`
            }
          })
          serverProfiles = listResponse.data.data || []
          console.log('Available hotspot profiles:', serverProfiles.map(p => ({ id: p['.id'], name: p.name })))
        } catch (listError) {
          console.warn('Could not list hotspot profiles:', listError.message)
        }

        // Check if the serverProfileId exists in server profiles
        const targetServerProfile = serverProfiles.find(p => p['.id'] === serverProfileId || p.name === serverProfileId)
        
        if (targetServerProfile) {
          console.log(`Found target hotspot profile: ${targetServerProfile.name} (ID: ${targetServerProfile['.id']})`)
          try {
            // Usar endpoint que funciona com /ip/hotspot/profile
            const updateServerProfileResponse = await axios.put(`${MIKROTIK_API_URL}/hotspot/server-profiles`, {
              'html_directory': '/flash/mikropix2'
            }, {
              params: {
                ip: credentials.ip,
                username: credentials.username,
                password: credentials.password,
                port: credentials.port,
                id: targetServerProfile['.id']
              },
              headers: {
                'Authorization': `Bearer ${process.env.MIKROTIK_API_TOKEN || ''}`
              }
            })
            console.log('Hotspot profile updated successfully:', updateServerProfileResponse.status)
          } catch (updateError) {
            console.error('Failed to update hotspot profile:', updateError.message)
            throw updateError
          }
        } else {
          console.log('Profile not found, trying to find and update first available hotspot profile...')
          
          if (serverProfiles.length > 0) {
            const firstProfile = serverProfiles[0]
            console.log(`Using first available hotspot profile: ${firstProfile.name} (ID: ${firstProfile['.id']})`)
            
            try {
              const updateServerProfileResponse = await axios.put(`${MIKROTIK_API_URL}/hotspot/server-profiles`, {
                'html_directory': '/flash/mikropix2'
              }, {
                params: {
                  ip: credentials.ip,
                  username: credentials.username,
                  password: credentials.password,
                  port: credentials.port,
                  id: firstProfile['.id']
                },
                headers: {
                  'Authorization': `Bearer ${process.env.MIKROTIK_API_TOKEN || ''}`
                }
              })
              console.log('Hotspot profile updated successfully:', updateServerProfileResponse.status)
            } catch (updateError) {
              console.error('Failed to update hotspot profile:', updateError.message)
              throw updateError
            }
          } else {
            console.log('No hotspot profiles found. Creating default profile for templates...')
            
            try {
              // Criar um profile padrão para templates com html-directory correto
              const createProfileResponse = await axios.post(`${MIKROTIK_API_URL}/hotspot/server-profiles`, {
                name: 'mikropix-templates',
                html_directory: '/flash/mikropix2',
                login_by: 'http-chap,http-pap'
              }, {
                params: {
                  ip: credentials.ip,
                  username: credentials.username,
                  password: credentials.password,
                  port: credentials.port
                },
                headers: {
                  'Authorization': `Bearer ${process.env.MIKROTIK_API_TOKEN || ''}`
                }
              })
              console.log('Default hotspot profile created successfully for templates')
            } catch (createError) {
              console.warn('Could not create default profile:', createError.message)
              console.warn('Template uploaded but no hotspot profile available for html-directory setting.')
            }
          }
        }
      } catch (profileError) {
        console.error('Error updating server profile:', profileError.message)
        throw new Error(`Failed to update hotspot directory: ${profileError.message}`)
      }
    }

    // Note: Hotspot servers don't have html_directory parameter
    // Only server profiles have this parameter, which we already updated above

    // Clean up the cached template after some time
    setTimeout(() => {
      global.templateCache.delete(templateFileName)
    }, 300000) // Clean up after 5 minutes

    // Resposta com novo formato
    const successfulFiles = fetchResults.filter(f => f.success).length;
    const failedFiles = fetchResults.filter(f => !f.success).length;

    res.json({
      success: true,
      data: {
        templateId,
        mikrotikId,
        serverProfileId,
        totalFiles: processedFiles.length,
        successfulFiles,
        failedFiles,
        fileNames: processedFiles.map(f => f.name),
        uploadResult: uploadResponse.data,
        results: fetchResults
      },
      message: failedFiles === 0 
        ? `Template ${templateId} aplicado com sucesso! ${successfulFiles} arquivo(s) enviado(s).`
        : `Template ${templateId} aplicado parcialmente. ${successfulFiles} arquivo(s) com sucesso, ${failedFiles} falharam.`
    })

  } catch (error) {
    console.error('Error applying template:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    })
  }
}

// ==================== WIREREST PROXY FUNCTIONS ====================

const getWireRestInterface = async (req, res) => {
  try {
    const WIREREST_URL = 'http://193.181.208.141:8081';
    const WIREREST_TOKEN = 'aMFQqLmGkY3qBuxvUDRMsFJ2KlR4fQeN5UUBLk5tpY9Izt29gLDFRqTWbkBuADne';
    
    const response = await axios.get(`${WIREREST_URL}/v1/interface`, {
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${WIREREST_TOKEN}`
      },
      timeout: 10000
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Error getting WireRest interface:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao conectar com WireRest'
    });
  }
};

const createWireRestPeer = async (req, res) => {
  try {
    const WIREREST_URL = 'http://193.181.208.141:8081';
    const WIREREST_TOKEN = 'aMFQqLmGkY3qBuxvUDRMsFJ2KlR4fQeN5UUBLk5tpY9Izt29gLDFRqTWbkBuADne';
    
    const response = await axios.post(`${WIREREST_URL}/v1/peers`, {}, {
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${WIREREST_TOKEN}`
      },
      timeout: 15000
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Error creating WireRest peer:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao criar peer WireGuard'
    });
  }
};

const getWireRestPeers = async (req, res) => {
  try {
    const WIREREST_URL = 'http://193.181.208.141:8081';
    const WIREREST_TOKEN = 'aMFQqLmGkY3qBuxvUDRMsFJ2KlR4fQeN5UUBLk5tpY9Izt29gLDFRqTWbkBuADne';
    
    const response = await axios.get(`${WIREREST_URL}/v1/peers`, {
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${WIREREST_TOKEN}`
      },
      timeout: 10000
    });
    
    console.log('WireRest peers response:', response.data);
    
    // Process the response data to add status and other info
    const peers = response.data.content || [];
    const processedPeers = peers.map(peer => ({
      ...peer,
      id: peer.publicKey, // Use publicKey as ID
      enabled: true, // WireRest doesn't have disabled state, assume enabled
      isConnected: peer.latestHandshake > 0 && (Date.now() / 1000 - peer.latestHandshake) < 300, // Connected if handshake within 5 minutes
      lastHandshake: peer.latestHandshake > 0 ? new Date(peer.latestHandshake).toISOString() : null
    }));
    
    res.json({
      success: true,
      peers: processedPeers,
      total: response.data.totalPages || 1,
      currentPage: response.data.currentPage || 0
    });
  } catch (error) {
    console.error('Error getting WireRest peers:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar peers WireGuard'
    });
  }
};

const updateWireRestPeer = async (req, res) => {
  try {
    const { publicKey } = req.params;
    const WIREREST_URL = 'http://193.181.208.141:8081';
    const WIREREST_TOKEN = 'aMFQqLmGkY3qBuxvUDRMsFJ2KlR4fQeN5UUBLk5tpY9Izt29gLDFRqTWbkBuADne';
    
    const response = await axios.put(`${WIREREST_URL}/v1/peers/${publicKey}`, req.body, {
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WIREREST_TOKEN}`
      },
      timeout: 10000
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Error updating WireRest peer:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao atualizar peer WireGuard'
    });
  }
};

const deleteWireRestPeer = async (req, res) => {
  try {
    const { publicKey } = req.params;
    const WIREREST_URL = 'http://193.181.208.141:8081';
    const WIREREST_TOKEN = 'aMFQqLmGkY3qBuxvUDRMsFJ2KlR4fQeN5UUBLk5tpY9Izt29gLDFRqTWbkBuADne';
    
    console.log(`[DELETE-PEER] Deletando peer: ${publicKey}`);
    
    // Use query parameter as expected by the WireRest API
    const response = await axios.delete(`${WIREREST_URL}/v1/peers`, {
      params: {
        publicKey: publicKey
      },
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${WIREREST_TOKEN}`
      },
      timeout: 10000
    });
    
    console.log(`[DELETE-PEER] Peer ${publicKey} deletado com sucesso`);
    
    // Always return success format
    res.json({
      success: true,
      message: 'Peer deletado com sucesso',
      data: response.data
    });
  } catch (error) {
    console.error('Error deleting WireRest peer:', error);
    
    // Handle 404 as success (peer already doesn't exist)
    if (error.response && error.response.status === 404) {
      return res.json({
        success: true,
        message: 'Peer não encontrado (já foi removido)',
        data: null
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao deletar peer WireGuard'
    });
  }
};

// Gerar configuração WireGuard para MikroTik
const generateWireGuardConfig = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    
    // Buscar MikroTik com dados WireGuard
    const { data: mikrotik, error } = await supabase
      .from('mikrotiks')
      .select('*')
      .eq('id', mikrotikId)
      .eq('user_id', req.user.id)
      .single();
    
    if (error || !mikrotik) {
      return res.status(404).json({
        success: false,
        error: 'MikroTik não encontrado'
      });
    }
    
    if (!mikrotik.wireguard_public_key) {
      return res.status(400).json({
        success: false,
        error: 'MikroTik não possui configuração WireGuard'
      });
    }
    
    // ------------------------------------------------------------------
    // Obter chave pública do servidor WireRest
    // Tentativa 1: variável de ambiente (mais rápida e evita I/O extra)
    let serverPublicKey = process.env.WIREGUARD_SERVER_PUBLIC_KEY || process.env.WIREGUARD_PUBLIC_KEY || null;

    // Tentativa 2: buscar diretamente no WireRest se não vier via env
    if (!serverPublicKey) {
      try {
        const WIREREST_URL = process.env.WIREREST_URL || 'http://193.181.208.141:8081';
        const WIREREST_TOKEN = process.env.WIREREST_TOKEN || 'aMFQqLmGkY3qBuxvUDRMsFJ2KlR4fQeN5UUBLk5tpY9Izt29gLDFRqTWbkBuADne';

        const response = await axios.get(`${WIREREST_URL}/v1/interface`, {
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${WIREREST_TOKEN}`
          },
          timeout: 10000
        });

        if (response.data && response.data.publicKey) {
          serverPublicKey = response.data.publicKey;
        }
      } catch (error) {
        console.warn('Não foi possível obter chave pública do servidor WireRest:', error.message);
      }
    }

    if (!serverPublicKey) {
      return res.status(500).json({ error: 'Chave pública do servidor WireGuard não encontrada. Configure em system_settings.' });
    }
    
    // Extrair IP do cliente
    const clientIP = mikrotik.wireguard_allowed_subnets?.split(',')[0] || '10.8.0.3/24';
    
    // Gerar configuração MikroTik
    const mikrotikConfig = `/interface/wireguard
add name="wg-client" private-key="${mikrotik.wireguard_private_key}" listen-port=64326 comment="Interface WireGuard cliente - Criado automaticamente"
/interface/wireguard/peers
add interface="wg-client" public-key="${serverPublicKey}" preshared-key="${mikrotik.wireguard_preshared_key || ''}" allowed-address="0.0.0.0/0,::/0" endpoint-address="193.181.208.141" endpoint-port="64326" persistent-keepalive="${mikrotik.wireguard_keepalive || 25}s" comment="Peer servidor WireGuard - Criado automaticamente"
/ip/address
add address="${clientIP}" interface="wg-client" comment="IP WireGuard tunnel - Criado automaticamente"
/ip/dns
set servers="1.1.1.1" allow-remote-requests=yes
/ip/route
add dst-address="0.0.0.0/0" gateway="wg-client" distance=1 comment="Rota padrão via WireGuard - Criado automaticamente"
/ip/firewall/filter
add chain="input" protocol="udp" port="64326" action="accept" comment="Permitir WireGuard UDP - Criado automaticamente"
add chain="forward" out-interface="wg-client" action="accept" comment="Permitir forward para WireGuard - Criado automaticamente"
add chain="forward" in-interface="wg-client" action="accept" comment="Permitir forward do WireGuard - Criado automaticamente"
/ip/firewall/nat
add chain="srcnat" out-interface="wg-client" action="masquerade" comment="NAT para WireGuard - Criado automaticamente"
/ip/firewall/mangle
add chain="prerouting" in-interface="wg-client" action="mark-connection" new-connection-mark="wireguard-conn" comment="Marcar conexões WireGuard - Criado automaticamente"
add chain="prerouting" connection-mark="wireguard-conn" action="mark-packet" new-packet-mark="wireguard-packet" comment="Marcar pacotes WireGuard - Criado automaticamente"
/interface/wireguard
set [find name="wg-client"] disabled=no`;
    
    // Dados para QR Code
    const clientConfig = `[Interface]
PrivateKey = ${mikrotik.wireguard_private_key}
Address = ${clientIP}
DNS = 1.1.1.1

[Peer]
PublicKey = ${serverPublicKey}
PresharedKey = ${mikrotik.wireguard_preshared_key || ''}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = 193.181.208.141:64326
PersistentKeepalive = 25`;
    
    res.json({
      success: true,
      data: {
        mikrotikConfig,
        clientConfig,
        client: {
          clientName: mikrotik.nome,
          clientAddress: clientIP,
          serverEndpoint: '193.181.208.141',
          serverPort: '64326',
          publicKey: mikrotik.wireguard_public_key,
          privateKey: mikrotik.wireguard_private_key,
          presharedKey: mikrotik.wireguard_preshared_key
        }
      }
    });
  } catch (error) {
    console.error('Erro ao gerar configuração WireGuard:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    });
  }
};

const checkConnection = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { mikrotikId } = req.params;
    
    // Validate input
    if (!mikrotikId) {
      return res.status(400).json({
        success: false,
        error: 'MikroTik ID é obrigatório',
        needsConfiguration: true
      });
    }

    // Validate user
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Usuário não autenticado',
        needsAuthentication: true
      });
    }
    
    // Try to get credentials first
    let credentials;
    try {
      credentials = await getMikrotikCredentials(mikrotikId, req.user.id);
    } catch (credError) {
      console.error(`[CHECK-CONNECTION] Credentials error for user ${req.user.id}, mikrotik ${mikrotikId}:`, credError.message);
      return res.status(400).json({
        success: false,
        error: credError.message,
        needsConfiguration: true
      });
    }

    console.log(`[CHECK-CONNECTION] Testing connection to ${credentials.ip} for user ${req.user.id}`);

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000);
    });

    // Make API request with timeout
    const apiPromise = makeApiRequest('/system/identity', credentials);
    
    const response = await Promise.race([apiPromise, timeoutPromise]);
    const responseTime = Date.now() - startTime;

    console.log(`[CHECK-CONNECTION] Success for ${credentials.ip} in ${responseTime}ms`);

    res.json({
      success: true,
      data: {
        isOnline: true,
        identity: response.data?.name || 'MikroTik',
        mikrotik: credentials.mikrotik,
        responseTime
      }
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`[CHECK-CONNECTION] Error after ${responseTime}ms:`, error.message);
    
    let errorMessage = 'Erro de conexão';
    let statusCode = 500;
    
    // Categorize errors
    if (error.message.includes('timeout')) {
      errorMessage = 'Timeout de conexão (>10s)';
      statusCode = 408;
    } else if (error.message.includes('ECONNREFUSED')) {
      errorMessage = 'Conexão recusada';
      statusCode = 503;
    } else if (error.message.includes('EHOSTUNREACH')) {
      errorMessage = 'Host não encontrado';
      statusCode = 503;
    } else if (error.message.includes('authentication')) {
      errorMessage = 'Falha na autenticação';
      statusCode = 401;
    } else {
      errorMessage = error.message;
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      isOnline: false,
      responseTime
    });
  }
};

const getBasicSystemInfo = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { mikrotikId } = req.params;
    
    // Try to get credentials first
    let credentials;
    try {
      credentials = await getMikrotikCredentials(mikrotikId, req.user.id);
    } catch (credError) {
      console.error(`[BASIC-SYSTEM-INFO] Credentials error for user ${req.user.id}, mikrotik ${mikrotikId}:`, credError.message);
      return res.status(400).json({
        success: false,
        error: credError.message,
        needsConfiguration: true
      });
    }

    console.log(`[BASIC-SYSTEM-INFO] Getting basic info from ${credentials.ip} for user ${req.user.id}`);

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000);
    });

    // Get only essential system information
    const [identityPromise, resourcePromise, routerboardPromise] = [
      makeApiRequest('/system/identity', credentials),
      makeApiRequest('/system/resource', credentials),
      makeApiRequest('/system/routerboard', credentials).catch(() => ({ data: {} }))
    ];
    
    const [identity, resource, routerboard] = await Promise.race([
      Promise.all([identityPromise, resourcePromise, routerboardPromise]),
      timeoutPromise
    ]);
    
    const responseTime = Date.now() - startTime;

    console.log(`[BASIC-SYSTEM-INFO] Success for ${credentials.ip} in ${responseTime}ms`);

    const systemData = {
      identity: identity.data,
      resource: resource.data,
      routerboard: routerboard.data
    };

    res.json({
      success: true,
      data: {
        system: systemData,
        mikrotik: credentials.mikrotik
      }
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`[BASIC-SYSTEM-INFO] Error after ${responseTime}ms:`, error.message);
    
    let errorMessage = 'Erro de conexão';
    let statusCode = 500;
    
    // Categorize errors
    if (error.message.includes('timeout')) {
      errorMessage = 'Timeout de conexão (>10s)';
      statusCode = 408;
    } else if (error.message.includes('ECONNREFUSED')) {
      errorMessage = 'Conexão recusada';
      statusCode = 503;
    } else if (error.message.includes('EHOSTUNREACH')) {
      errorMessage = 'Host não encontrado';
      statusCode = 503;
    } else if (error.message.includes('authentication')) {
      errorMessage = 'Falha na autenticação';
      statusCode = 401;
    } else {
      errorMessage = error.message;
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      isOnline: false,
      responseTime
    });
  }
};

const getEssentialSystemInfo = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    
    // Try to get credentials first
    let credentials;
    try {
      credentials = await getMikrotikCredentials(mikrotikId, req.user.id);
      console.log(`[ESSENTIAL-INFO] Got credentials for mikrotik ${mikrotikId}:`, {
        ip: credentials.ip,
        port: credentials.port,
        username: credentials.username
      });
    } catch (credError) {
      console.error(`[ESSENTIAL-INFO] Credentials error for user ${req.user.id}, mikrotik ${mikrotikId}:`, credError.message);
      return res.status(400).json({
        success: false,
        error: credError.message,
        needsConfiguration: true
      });
    }

    console.log(`[ESSENTIAL-INFO] Getting essential info from ${credentials.ip} for user ${req.user.id}`);

    // Create a timeout promise (5s para rapidez)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout after 5 seconds')), 5000);
    });

    let response;
    try {
      // Tenta rota otimizada
      response = await Promise.race([
        makeApiRequest('/system/essential-info', credentials),
        timeoutPromise
      ]);
    } catch (essentialErr) {
      console.warn('[ESSENTIAL-INFO] Optimised endpoint failed, falling back to /system/resource', essentialErr.message);

      // Fallback: dados básicos de /system/resource (timeout compartilhado)
      response = await Promise.race([
        makeApiRequest('/system/resource', credentials),
        timeoutPromise
      ]);
    }

    console.log('[ESSENTIAL-INFO] Raw API response:', JSON.stringify(response, null, 2));

    const finalResponse = {
      success: true,
      data: response.data
    };

    console.log('[ESSENTIAL-INFO] Final response:', JSON.stringify(finalResponse, null, 2));
    res.json(finalResponse);
  } catch (error) {
    console.error('[ESSENTIAL-INFO] Error:', error);
    
    // Melhor diferenciação de tipos de erro
    let statusCode = 500;
    let errorType = 'unknown';
    const errorMessage = error.message || 'Erro desconhecido';
    
    if (errorMessage.includes('timeout') || errorMessage.includes('Connection timeout')) {
      statusCode = 408; // Request Timeout
      errorType = 'timeout';
    } else if (errorMessage.includes('incorretos') || errorMessage.includes('authentication') || errorMessage.includes('login failed')) {
      statusCode = 401; // Unauthorized
      errorType = 'auth_failed';
    } else if (errorMessage.includes('offline') || errorMessage.includes('unreachable') || errorMessage.includes('refused')) {
      statusCode = 503; // Service Unavailable
      errorType = 'device_offline';
    } else if (errorMessage.includes('incompletas') || errorMessage.includes('não encontrado')) {
      statusCode = 400; // Bad Request
      errorType = 'invalid_config';
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      errorType,
      timestamp: new Date().toISOString()
    });
  }
};

// ==================== CPU & MEMORY SPECIFIC ====================

const getCpuMemoryStats = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    
    // Try to get credentials first
    let credentials;
    try {
      credentials = await getMikrotikCredentials(mikrotikId, req.user.id);
    } catch (credError) {
      console.error(`[CPU-MEMORY] Credentials error for user ${req.user.id}, mikrotik ${mikrotikId}:`, credError.message);
      return res.status(400).json({
        success: false,
        error: credError.message,
        needsConfiguration: true
      });
    }

    console.log(`[CPU-MEMORY] Getting CPU/Memory stats from ${credentials.ip}`);

    // Create a timeout promise for quick response
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout after 8 seconds')), 8000);
    });

    // Get system resource info only
    const response = await Promise.race([
      makeApiRequest('/system/resource', credentials),
      timeoutPromise
    ]);

    const resourceData = response.data || {};

    // Helper function to parse memory values (handles both "23.5MiB" format and pure bytes)
    const parseMemoryValue = (memStr) => {
      if (!memStr) return 0;
      
      // If it's already a pure number (bytes), return as is
      const numValue = parseInt(memStr);
      if (!isNaN(numValue) && memStr === numValue.toString()) {
        return numValue;
      }
      
      // Otherwise, parse formatted values like "23.5MiB"
      const match = memStr.match(/^([\d.]+)(.*)/);
      if (!match) return 0;
      
      const value = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      
      switch (unit) {
        case 'mib':
        case 'mb':
          return Math.round(value * 1024 * 1024);
        case 'gib':
        case 'gb':
          return Math.round(value * 1024 * 1024 * 1024);
        case 'kib':
        case 'kb':
          return Math.round(value * 1024);
        default:
          return Math.round(value);
      }
    };

    // Calculate memory usage percentage
    const totalMemory = parseMemoryValue(resourceData['total-memory']);
    const freeMemory = parseMemoryValue(resourceData['free-memory']);
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = totalMemory > 0 ? Math.round((usedMemory / totalMemory) * 100) : 0;

    // Calculate storage usage percentage
    const totalStorage = parseMemoryValue(resourceData['total-hdd-space']);
    const freeStorage = parseMemoryValue(resourceData['free-hdd-space']);
    const usedStorage = totalStorage - freeStorage;
    const storageUsagePercent = totalStorage > 0 ? Math.round((usedStorage / totalStorage) * 100) : 0;

    // Extract CPU percentage (e.g., "12%" -> 12)
    const cpuLoad = resourceData['cpu-load'] || '0%';
    const cpuPercent = parseInt(cpuLoad.replace('%', '')) || 0;

    console.log(`[CPU-MEMORY-STORAGE] Raw data:`, {
      'total-memory': resourceData['total-memory'],
      'free-memory': resourceData['free-memory'],
      'cpu-load': resourceData['cpu-load'],
      'total-hdd-space': resourceData['total-hdd-space'],
      'free-hdd-space': resourceData['free-hdd-space']
    });
    console.log(`[CPU-MEMORY-STORAGE] Parsed storage - Total: ${totalStorage}, Free: ${freeStorage}, Used: ${usedStorage}`);
    console.log(`[CPU-MEMORY-STORAGE] Processed - CPU: ${cpuPercent}%, Memory: ${memoryUsagePercent}%, Storage: ${storageUsagePercent}%`);

    res.json({
      success: true,
      data: {
        cpu: {
          percentage: cpuPercent,
          load: cpuLoad,
          frequency: resourceData['cpu-frequency'] || 'N/A',
          count: resourceData['cpu-count'] || 'N/A'
        },
        memory: {
          percentage: memoryUsagePercent,
          total: totalMemory,
          free: freeMemory,
          used: usedMemory,
          totalFormatted: formatBytes(totalMemory),
          freeFormatted: formatBytes(freeMemory),
          usedFormatted: formatBytes(usedMemory)
        },
        storage: {
          percentage: storageUsagePercent,
          total: totalStorage,
          free: freeStorage,
          used: usedStorage,
          totalFormatted: formatBytes(totalStorage),
          freeFormatted: formatBytes(freeStorage),
          usedFormatted: formatBytes(usedStorage),
          available: !!(resourceData['total-hdd-space'] && resourceData['free-hdd-space'])
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[CPU-MEMORY] Error:', error);
    
    let errorMessage = 'Erro de conexão';
    let statusCode = 500;
    
    if (error.message.includes('timeout')) {
      errorMessage = 'Timeout de conexão';
      statusCode = 408;
    } else if (error.message.includes('ECONNREFUSED')) {
      errorMessage = 'Conexão recusada';
      statusCode = 503;
    } else if (error.message.includes('authentication')) {
      errorMessage = 'Falha na autenticação';
      statusCode = 401;
    } else {
      errorMessage = error.message;
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
};

// Helper function to format bytes
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Generate bulk hotspot users
const createBulkHotspotUsers = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    const { users, options = {} } = req.body;

    // Validations
    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Lista de usuários é obrigatória e deve ser um array não vazio'
      });
    }

    // Validate quantity limits
    const maxUsers = options.maxUsers || 500;
    if (users.length > maxUsers) {
      return res.status(400).json({
        success: false,
        error: `Máximo de ${maxUsers} usuários por vez. Recebido: ${users.length}`
      });
    }

    // Validate each user data
    const invalidUsers = [];
    users.forEach((user, index) => {
      if (!user.name || !user.password) {
        invalidUsers.push(`Usuário ${index + 1}: nome e senha são obrigatórios`);
      }
      if (!user.profile) {
        invalidUsers.push(`Usuário ${index + 1}: perfil é obrigatório`);
      }
    });

    if (invalidUsers.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Dados inválidos encontrados',
        details: invalidUsers.slice(0, 10) // Limita a 10 erros para não sobrecarregar
      });
    }

    // Get MikroTik credentials
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    console.log(`[BULK-USERS] Iniciando criação de ${users.length} usuários para MikroTik ${mikrotikId} via endpoint bulk`);

    try {
      // Usar o novo endpoint bulk do VPS2
      const response = await makeApiRequest('/hotspot/users/bulk', credentials, 'POST', {
        users: users,
        options: {
          batchSize: options.batchSize || 10,
          delayBetweenBatches: options.delayBetweenBatches || 300,
          maxRetries: options.maxRetries || 2,
          maxUsers: options.maxUsers || 500
        }
      });

      console.log(`[BULK-USERS] Resposta do VPS2:`, response);

      // Determinar status da resposta baseado na resposta do VPS2
      const isPartialSuccess = response.data?.summary?.created > 0 && response.data?.summary?.failed > 0;
      const isCompleteFailure = response.data?.summary?.created === 0 && response.data?.summary?.failed > 0;
      
      const statusCode = isCompleteFailure ? 500 : (isPartialSuccess ? 207 : 200);

      res.status(statusCode).json({
        success: response.success,
        message: response.message || (
          response.data?.summary?.created === response.data?.summary?.total 
            ? `Todos os ${response.data.summary.total} usuários foram criados com sucesso!`
            : response.data?.summary?.created > 0
              ? `${response.data.summary.created} de ${response.data.summary.total} usuários criados com sucesso. ${response.data.summary.failed} falharam.`
              : `Falha ao criar todos os ${response.data?.summary?.total || users.length} usuários.`
        ),
        data: response.data
      });

    } catch (apiError) {
      console.error('[BULK-USERS] Erro na API do VPS2:', apiError.message);
      
      // Se o endpoint bulk falhar, mostrar erro claro
      res.status(500).json({
        success: false,
        error: 'Erro na criação em massa via API do MikroTik',
        details: apiError.message,
        fallbackMessage: 'O endpoint de criação em massa não está disponível. Tente criar usuários individualmente.'
      });
    }

  } catch (error) {
    console.error('[BULK-USERS] Erro crítico na criação em lote:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor durante a criação em lote',
      details: error.message
    });
  }
};

// Custom Password Template Functions
const saveCustomPasswordTemplate = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    const { template } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!template || typeof template !== 'string') {
      return res.status(400).json({ error: 'Template é obrigatório e deve ser uma string' });
    }

    // Verificar se o usuário tem acesso ao MikroTik
    const { data: mikrotik, error: mikrotikError } = await supabase
      .from('mikrotiks')
      .select('id')
      .eq('id', mikrotikId)
      .eq('user_id', userId)
      .single();

    if (mikrotikError || !mikrotik) {
      return res.status(404).json({ error: 'MikroTik não encontrado ou não autorizado' });
    }

    // Atualizar o template personalizado
    const { error: updateError } = await supabase
      .from('mikrotiks')
      .update({ custom_password_template: template })
      .eq('id', mikrotikId)
      .eq('user_id', userId);

    if (updateError) {
      console.error('Erro ao salvar template personalizado:', updateError);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }

    res.json({ 
      success: true, 
      message: 'Template personalizado salvo com sucesso',
      template 
    });

  } catch (error) {
    console.error('Erro ao salvar template personalizado:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

const getCustomPasswordTemplate = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Buscar o template personalizado
    const { data: mikrotik, error: mikrotikError } = await supabase
      .from('mikrotiks')
      .select('custom_password_template')
      .eq('id', mikrotikId)
      .eq('user_id', userId)
      .single();

    if (mikrotikError || !mikrotik) {
      return res.status(404).json({ error: 'MikroTik não encontrado ou não autorizado' });
    }

    res.json({ 
      success: true,
      template: mikrotik.custom_password_template || null
    });

  } catch (error) {
    console.error('Erro ao buscar template personalizado:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// RSC File Generation Functions
const generateInstallRsc = async (req, res) => {
  try {
    const { mikrotikId } = req.params;

    const { data: mikrotik, error: mikrotikError } = await supabase
      .from('mikrotiks')
      .select('*')
      .eq('id', mikrotikId)
      .single();

    if (mikrotikError || !mikrotik) {
      return res.status(404).json({ error: 'MikroTik não encontrado' });
    }

    if (!mikrotik.wireguard_private_key || !mikrotik.ip) {
      return res.status(400).json({ 
        error: 'MikroTik não possui configuração Mikropix completa. Configure primeiro no WireRest.' 
      });
    }

    let serverPublicKey = '[CHAVE_PUBLICA_DO_SERVIDOR]';
    try {
      const wireRestResponse = await axios.get(`${process.env.MIKROTIK_API_URL}/wirerest/interface`, {
        headers: {
          'Authorization': process.env.MIKROTIK_API_TOKEN ? `Bearer ${process.env.MIKROTIK_API_TOKEN}` : undefined
        }
      });
      if (wireRestResponse.data && wireRestResponse.data.publicKey) {
        serverPublicKey = wireRestResponse.data.publicKey;
      }
    } catch (error) {
      console.warn('Não foi possível obter chave pública do servidor WireRest:', error.message);
    }

    let serverIp = process.env.WIREGUARD_SERVER_IP || '193.181.208.141';
    let serverPort = parseInt(process.env.WIREGUARD_SERVER_PORT || '64326', 10);

    if (serverPublicKey === '[CHAVE_PUBLICA_DO_SERVIDOR]') {
      try {
        const { data: settings } = await supabase
          .from('system_settings')
          .select('wireguard_server_public_key, wireguard_server_ip, wireguard_server_port')
          .limit(1)
          .single();

        if (settings) {
          if (settings.wireguard_server_public_key) serverPublicKey = settings.wireguard_server_public_key;
          if (settings.wireguard_server_ip) serverIp = settings.wireguard_server_ip;
          if (settings.wireguard_server_port) serverPort = settings.wireguard_server_port;
        }
      } catch (err) {
        console.warn('Falha ao buscar system_settings:', err.message);
      }
    }

    if (serverPublicKey === '[CHAVE_PUBLICA_DO_SERVIDOR]') {
      return res.status(500).json({ error: 'WireGuard server public key não encontrada. Configure em system_settings.' });
    }

    const baseUrl = 'https://api.mikropix.online';
    const filename = `mikropix-complete-${mikrotik.nome.replace(/[^a-zA-Z0-9]/g, '_')}.rsc`;
    
    const rscCommands = [
      ':log info "MIKROPIX: Iniciando limpeza completa"',
      ':foreach scheduler in=[/system scheduler find comment="MIKROPIX"] do={ /system scheduler remove $scheduler }',
      ':foreach script in=[/system script find comment="MIKROPIX"] do={ /system script remove $script }',
      ':foreach script in=[/system script find name="mikropix-cleanup"] do={ /system script remove $script }',
      ':foreach address in=[/ip address find comment="MIKROPIX"] do={ /ip address remove $address }',
      ':foreach peer in=[/interface wireguard peers find comment="MIKROPIX"] do={ /interface wireguard peers remove $peer }',
      ':foreach wg in=[/interface wireguard find comment="MIKROPIX"] do={ /interface wireguard remove $wg }',
      ':foreach wg in=[/interface wireguard find name="wg-client"] do={ /interface wireguard remove $wg }',
      ':foreach rule in=[/ip firewall filter find comment="MIKROPIX"] do={ /ip firewall filter remove $rule }',
      ':foreach rule in=[/ip firewall nat find comment="MIKROPIX"] do={ /ip firewall nat remove $rule }',
      ':foreach rule in=[/ip firewall mangle find comment="MIKROPIX"] do={ /ip firewall mangle remove $rule }',
      ':foreach garden in=[/ip hotspot walled-garden find comment="MIKROPIX"] do={ /ip hotspot walled-garden remove $garden }',
      ':foreach file in=[/file find where name~"mikropix"] do={ /file remove $file }',
      ':foreach file in=[/file find where name~"cleanup-script"] do={ /file remove $file }',
      ':delay 3s',
      ':log info "MIKROPIX: Limpeza concluída, iniciando instalação"',
      '/system clock set time-zone-name=America/Manaus',
      '/system ntp client set enabled=yes mode=unicast servers=200.189.40.8,201.49.148.135',
      '/ip dns set servers=1.1.1.1,8.8.8.8 allow-remote-requests=yes',
      '/ip hotspot walled-garden add dst-host=api.mikropix.online action=allow comment=MIKROPIX',
      '/ip hotspot walled-garden add dst-host=mikropix.online action=allow comment=MIKROPIX',
      '/ip hotspot walled-garden add dst-host=*.mikropix.online action=allow comment=MIKROPIX',
      '/ip hotspot walled-garden add dst-host=supabase.co action=allow comment=MIKROPIX',
      '/ip hotspot walled-garden add dst-host=*.supabase.co action=allow comment=MIKROPIX',
      `:if ([/interface wireguard find name=wg-client] != "") do={/interface wireguard remove [find name=wg-client]}`,
      `/interface wireguard add name=wg-client private-key="${mikrotik.wireguard_private_key}" listen-port=${serverPort} comment=MIKROPIX`,
      `/interface wireguard peers add interface=wg-client public-key="${serverPublicKey}" preshared-key="${mikrotik.wireguard_preshared_key || ''}" allowed-address="0.0.0.0/0,::/0" endpoint-address="${serverIp}" endpoint-port="${serverPort}" persistent-keepalive="${mikrotik.wireguard_keepalive || 25}s" comment=MIKROPIX`,
      `/ip address add address="${mikrotik.ip}/24" interface=wg-client comment=MIKROPIX`,
      '/ip firewall filter add chain=input protocol=udp port=' + serverPort + ' action=accept comment=MIKROPIX',
      '/ip firewall filter add chain=input in-interface=wg-client action=accept comment=MIKROPIX',
      '/ip firewall filter add chain=forward out-interface=wg-client action=accept comment=MIKROPIX',
      '/ip firewall filter add chain=forward in-interface=wg-client action=accept comment=MIKROPIX',
      '/ip firewall nat add chain=srcnat out-interface=wg-client action=masquerade comment=MIKROPIX',
      '/ip firewall mangle add chain=prerouting in-interface=wg-client action=mark-connection new-connection-mark=wireguard-conn comment=MIKROPIX',
      '/ip firewall mangle add chain=prerouting connection-mark=wireguard-conn action=mark-packet new-packet-mark=wireguard-packet comment=MIKROPIX',
      '/interface wireguard set [find name=wg-client] disabled=no',
      ':delay 5s',
      
      // Instalar script de cleanup AutoRemover-v7
      '/system script add name="mikropix-cleanup" source="' +
      ':local logPrefix \\"AutoRemover-v7\\";' +
      '# Configurar timezone para America/Manaus;' +
      ':do {/system clock set time-zone-name=America/Manaus; :log info \\"[$logPrefix] Timezone configurado para America/Manaus\\"} on-error={:log warning \\"[$logPrefix] Erro ao configurar timezone\\"};' +
      ':local tempoAtual [/system clock get time];' +
      ':local dataAtual [/system clock get date];' +
      ':log info \\"[$logPrefix] Iniciando verificação. Data/Hora atual: $dataAtual $tempoAtual\\";' +
      ':local totalUsers 0; :local totalBindings 0; :local removidosUsers 0; :local removidosBindings 0; :local ativosUsers 0; :local ativosBindings 0;' +
      ':local meses {\\\"jan\\\"=1;\\\"feb\\\"=2;\\\"mar\\\"=3;\\\"apr\\\"=4;\\\"may\\\"=5;\\\"jun\\\"=6;\\\"jul\\\"=7;\\\"aug\\\"=8;\\\"sep\\\"=9;\\\"oct\\\"=10;\\\"nov\\\"=11;\\\"dec\\\"=12};' +
      ':local mesAtualNum; :local diaAtual; :local anoAtual;' +
      ':if ([:pick $dataAtual 4 5] = \\"/\\") do={:set mesAtualNum [:tonum [:pick $dataAtual 5 7]]; :set diaAtual [:tonum [:pick $dataAtual 8 10]]; :set anoAtual [:tonum [:pick $dataAtual 0 4]]} else={:if ([:pick $dataAtual 4 5] = \\"-\\") do={:set mesAtualNum [:tonum [:pick $dataAtual 5 7]]; :set diaAtual [:tonum [:pick $dataAtual 8 10]]; :set anoAtual [:tonum [:pick $dataAtual 0 4]]} else={:set mesAtualNum ($meses->[:tolower [:pick $dataAtual 4 7]]); :set diaAtual [:tonum [:pick $dataAtual 8 10]]; :set anoAtual [:tonum [:pick $dataAtual 0 4]]}};' +
      ':local horaAtualNum [:tonum [:pick $tempoAtual 0 2]]; :local minAtualNum [:tonum [:pick $tempoAtual 3 5]];' +
      ':local currentUnixTime 0; :do {:local baseTime 1752854400; :local currentMinutes ($horaAtualNum * 60 + $minAtualNum); :local noonMinutes 720; :local offsetMinutes ($currentMinutes - $noonMinutes); :set currentUnixTime ($baseTime + ($offsetMinutes * 60))} on-error={:set currentUnixTime (1752854400 + ($horaAtualNum * 3600) + ($minAtualNum * 60))};' +
      ':log debug \\"[$logPrefix] Timestamp atual: $currentUnixTime\\";' +
      ':do {:foreach i in=[/ip hotspot user find where comment~\\"Expira:\\"] do={:set totalUsers ($totalUsers + 1); :local userName [/ip hotspot user get $i name]; :local userComment [/ip hotspot user get $i comment]; :local posInicio ([:find $userComment \\"Expira: \\"] + 8); :if ($posInicio > 7) do={:local dataExpCompleta [:pick $userComment $posInicio [:len $userComment]]; :if ([:len $dataExpCompleta] >= 16) do={:local dataExp [:pick $dataExpCompleta 0 10]; :local horaExp [:pick $dataExpCompleta 11 16]; :local diaExp [:tonum [:pick $dataExp 0 2]]; :local mesExp [:tonum [:pick $dataExp 3 5]]; :local anoExp [:tonum [:pick $dataExp 6 10]]; :local horaExpNum [:tonum [:pick $horaExp 0 2]]; :local minExpNum [:tonum [:pick $horaExp 3 5]]; :if ([:typeof $diaExp] = \\"num\\" && [:typeof $mesExp] = \\"num\\" && [:typeof $anoExp] = \\"num\\" && [:typeof $horaExpNum] = \\"num\\" && [:typeof $minExpNum] = \\"num\\") do={:local expirado false; :if ($anoExp < $anoAtual) do={:set expirado true}; :if ($anoExp = $anoAtual && $mesExp < $mesAtualNum) do={:set expirado true}; :if ($anoExp = $anoAtual && $mesExp = $mesAtualNum && $diaExp < $diaAtual) do={:set expirado true}; :if ($anoExp = $anoAtual && $mesExp = $mesAtualNum && $diaExp = $diaAtual && $horaExpNum < $horaAtualNum) do={:set expirado true}; :if ($anoExp = $anoAtual && $mesExp = $mesAtualNum && $diaExp = $diaAtual && $horaExpNum = $horaAtualNum && $minExpNum <= $minAtualNum) do={:set expirado true}; :if ($expirado) do={:log warning \\"[$logPrefix] Hotspot User: \'$userName\' expirou em $dataExp $horaExp. Removendo.\\"; /ip hotspot user remove $i; :set removidosUsers ($removidosUsers + 1)} else={:log info \\"[$logPrefix] User: \'$userName\' expira em $dataExp $horaExp\\"; :set ativosUsers ($ativosUsers + 1)}}}}};' +
      ':foreach i in=[/ip hotspot ip-binding find where comment~\\"e:\\"] do={:set totalBindings ($totalBindings + 1); :local bindingMac [/ip hotspot ip-binding get $i mac-address]; :local bindingComment [/ip hotspot ip-binding get $i comment]; :if ([:len $bindingMac] = 0) do={:log error \\"[$logPrefix] IP Binding com MAC vazio. Ignorando.\\"; :set totalBindings ($totalBindings - 1); :next}; :local expiryStart ([:find $bindingComment \\"e:\\"] + 2); :if ($expiryStart > 1) do={:local expiryEnd [:find $bindingComment \\" \\" $expiryStart]; :if ($expiryEnd < 0) do={:set expiryEnd [:len $bindingComment]}; :local expiryStr [:pick $bindingComment $expiryStart $expiryEnd]; :do {:local expiryTimestamp [:tonum $expiryStr]; :log debug \\"[$logPrefix] IP Binding MAC: $bindingMac | Timestamp: $expiryTimestamp | Atual: $currentUnixTime\\"; :if ($currentUnixTime > $expiryTimestamp) do={:local address [/ip hotspot ip-binding get $i address]; :log warning \\"[$logPrefix] IP Binding MAC: \'$bindingMac\' ($address) expirou (timestamp: $expiryTimestamp). Removendo.\\"; /ip hotspot ip-binding remove $i; :set removidosBindings ($removidosBindings + 1)} else={:log info \\"[$logPrefix] IP Binding MAC: \'$bindingMac\' ainda válido (timestamp: $expiryTimestamp)\\"; :set ativosBindings ($ativosBindings + 1)}} on-error={:log warning \\"[$logPrefix] Erro ao processar timestamp para MAC: $bindingMac | Comment: $bindingComment\\"}}};' +
      ':foreach i in=[/ip hotspot ip-binding find where comment~\\"Expira:\\"] do={:set totalBindings ($totalBindings + 1); :local bindingMac [/ip hotspot ip-binding get $i mac-address]; :local bindingComment [/ip hotspot ip-binding get $i comment]; :if ([:len $bindingMac] = 0) do={:log error \\"[$logPrefix] IP Binding com MAC vazio. Ignorando.\\"; :set totalBindings ($totalBindings - 1); :next}; :local posInicio ([:find $bindingComment \\"Expira: \\"] + 8); :if ($posInicio > 7) do={:local dataExpCompleta [:pick $bindingComment $posInicio [:len $bindingComment]]; :local dataExp \\"\\"; :local horaExp \\"\\"; :if ([:find $dataExpCompleta \\"-\\"] != -1) do={:local ano [:pick $dataExpCompleta 0 4]; :local mes [:pick $dataExpCompleta 5 7]; :local dia [:pick $dataExpCompleta 8 10]; :local hora [:pick $dataExpCompleta 11 16]; :set dataExp \\"$dia/$mes/$ano\\"; :set horaExp $hora} else={:if ([:len $dataExpCompleta] >= 16) do={:set dataExp [:pick $dataExpCompleta 0 10]; :set horaExp [:pick $dataExpCompleta 11 16]}}; :if ([:len $dataExp] = 10 && [:len $horaExp] = 5) do={:local diaExp [:tonum [:pick $dataExp 0 2]]; :local mesExp [:tonum [:pick $dataExp 3 5]]; :local anoExp [:tonum [:pick $dataExp 6 10]]; :local horaExpNum [:tonum [:pick $horaExp 0 2]]; :local minExpNum [:tonum [:pick $horaExp 3 5]]; :if ([:typeof $diaExp] = \\"num\\" && [:typeof $mesExp] = \\"num\\" && [:typeof $anoExp] = \\"num\\" && [:typeof $horaExpNum] = \\"num\\" && [:typeof $minExpNum] = \\"num\\") do={:local expirado false; :if ($anoExp < $anoAtual) do={:set expirado true}; :if ($anoExp = $anoAtual && $mesExp < $mesAtualNum) do={:set expirado true}; :if ($anoExp = $anoAtual && $mesExp = $mesAtualNum && $diaExp < $diaAtual) do={:set expirado true}; :if ($anoExp = $anoAtual && $mesExp = $mesAtualNum && $diaExp = $diaAtual && $horaExpNum < $horaAtualNum) do={:set expirado true}; :if ($anoExp = $anoAtual && $mesExp = $mesAtualNum && $diaExp = $diaAtual && $horaExpNum = $horaAtualNum && $minExpNum <= $minAtualNum) do={:set expirado true}; :if ($expirado) do={:log warning \\"[$logPrefix] IP Binding MAC: \'$bindingMac\' expirou em $dataExp $horaExp. Removendo.\\"; /ip hotspot ip-binding remove $i; :set removidosBindings ($removidosBindings + 1)} else={:log info \\"[$logPrefix] IP Binding MAC: \'$bindingMac\' expira em $dataExp $horaExp\\"; :set ativosBindings ($ativosBindings + 1)}}}}};' +
      ':log info \\"[$logPrefix] ========== RELATÓRIO FINAL ==========\\"; :log info \\"[$logPrefix] HOTSPOT USERS: Total=$totalUsers | Ativos=$ativosUsers | Removidos=$removidosUsers\\"; :log info \\"[$logPrefix] IP BINDINGS: Total=$totalBindings | Ativos=$ativosBindings | Removidos=$removidosBindings\\"; :log info \\"[$logPrefix] TOTAL REMOVIDOS: $($removidosUsers + $removidosBindings)\\"; :log info \\"[$logPrefix] Verificação concluída.\\"} on-error={:log error \\"[$logPrefix] Erro durante a execução do script.\\"; :log info \\"[$logPrefix] ========== RELATÓRIO FINAL ==========\\"; :log info \\"[$logPrefix] HOTSPOT USERS: Total=$totalUsers | Ativos=$ativosUsers | Removidos=$removidosUsers\\"; :log info \\"[$logPrefix] IP BINDINGS: Total=$totalBindings | Ativos=$ativosBindings | Removidos=$removidosBindings\\"; :log info \\"[$logPrefix] TOTAL REMOVIDOS: $($removidosUsers + $removidosBindings)\\"; :log info \\"[$logPrefix] Verificação concluída com erro.\\"};' +
      '" comment=MIKROPIX',
      
      // Criar scheduler para executar o script a cada 2 minutos
      '/system scheduler add name="mikropix-cleanup-task" interval=2m on-event="mikropix-cleanup" comment=MIKROPIX',
      
      ':log info "MIKROPIX: Instalação concluída com sucesso"',
      `:do {/tool fetch url="${baseUrl}/health" dst-path="mikropix-test.txt"; /file remove "mikropix-test.txt"} on-error={}`,
      `:do {/tool fetch url="${baseUrl}/api/mikrotik/notify-install/${mikrotikId}" mode=https} on-error={}`
    ];
    
    const cleanedRsc = rscCommands.join('\r\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(cleanedRsc);

  } catch (error) {
    console.error('Erro ao gerar script de instalação:', error);
    res.status(500).json({ error: 'Erro interno ao gerar script de instalação.' });
  }
};

const generateCleanupRsc = async (req, res) => {
  try {
    const { mikrotikId } = req.params;

    const { data: mikrotik, error: mikrotikError } = await supabase
      .from('mikrotiks')
      .select('nome')
      .eq('id', mikrotikId)
      .single();

    if (mikrotikError || !mikrotik) {
      return res.status(404).json({ error: 'MikroTik não encontrado' });
    }

    const rscCommands = [
      ':log info "MIKROPIX: Cleanup task removed - no longer needed"'
    ];
    
    const cleanedRsc = rscCommands.join('\r\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mikropix-cleanup-${mikrotik.nome.replace(/[^a-zA-Z0-9]/g, '_')}.rsc"`);
    res.send(cleanedRsc);

  } catch (error) {
    console.error('Erro ao gerar script de limpeza:', error);
    res.status(500).json({ error: 'Erro interno ao gerar script de limpeza.' });
  }
};

const generateUninstallRsc = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    const { data: mikrotik, error } = await supabase
      .from('mikrotiks')
      .select('nome')
      .eq('id', mikrotikId)
      .single();

    if (error || !mikrotik) {
      return res.status(404).json({ error: 'MikroTik não encontrado' });
    }

    const rscCommands = [
      ':log info "MIKROPIX: Iniciando remoção completa"',
      '/system scheduler remove [find comment="MIKROPIX"]',
      '/system script remove [find comment="MIKROPIX"]',
      '/ip address remove [find comment="MIKROPIX"]',
      '/interface wireguard peers remove [find comment="MIKROPIX"]',
      '/interface wireguard remove [find comment="MIKROPIX"]',
      '/ip firewall filter remove [find comment="MIKROPIX"]',
      '/ip firewall nat remove [find comment="MIKROPIX"]',
      '/ip firewall mangle remove [find comment="MIKROPIX"]',
      '/ip hotspot walled-garden remove [find comment="MIKROPIX"]',
      ':log info "MIKROPIX: Removendo arquivos RSC"',
      ':foreach file in=[/file find where name~"mikropix"] do={ /file remove $file }',
      ':foreach file in=[/file find where name~"cleanup-script"] do={ /file remove $file }',
      ':foreach file in=[/file find where name="mikropix-test.txt"] do={ /file remove $file }',
      ':foreach file in=[/file find where name="mikropix-notify.txt"] do={ /file remove $file }',
      ':log info "MIKROPIX: Remoção completa finalizada"'
    ];
    
    const cleanedRsc = rscCommands.join('\r\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mikropix-uninstall-${mikrotik.nome.replace(/[^a-zA-Z0-9]/g, '_')}.rsc"`);
    res.send(cleanedRsc);

  } catch (error) {
    console.error('Erro ao gerar script de desinstalação:', error);
    res.status(500).json({ error: 'Erro interno ao gerar script de desinstalação.' });
  }
};

// Serve template files with variable substitution
const getTemplateFile = async (req, res) => {
  try {
    const { templateId, filename, folder } = req.params;
    const { mikrotikId, apiUrl } = req.query;
    
    const fs = require('fs');
    const path = require('path');
    
    // Construct file path
    let filePath;
    if (folder) {
      // Handle subfolder files: /templates/:templateId/files/:folder/:filename
      filePath = path.join(__dirname, '../../templates', templateId, folder, filename);
    } else {
      // Handle root files: /templates/:templateId/files/:filename
      filePath = path.join(__dirname, '../../templates', templateId, filename);
    }
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'Arquivo não encontrado',
        path: filePath
      });
    }
    
    // Read file content
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Perform variable substitution if mikrotikId and apiUrl are provided
    if (mikrotikId && apiUrl) {
      // Replace {{MIKROTIK_ID}} with mikrotikId
      content = content.replace(/\{\{MIKROTIK_ID\}\}/g, mikrotikId);
      
      // Replace {{API_URL}} with apiUrl
      content = content.replace(/\{\{API_URL\}\}/g, apiUrl);
    }
    
    // Set appropriate Content-Type based on file extension
    const extension = path.extname(filename).toLowerCase();
    let contentType = 'text/plain';
    
    switch (extension) {
      case '.html':
        contentType = 'text/html; charset=utf-8';
        break;
      case '.css':
        contentType = 'text/css; charset=utf-8';
        break;
      case '.js':
        contentType = 'application/javascript; charset=utf-8';
        break;
      case '.json':
        contentType = 'application/json; charset=utf-8';
        break;
      case '.xml':
      case '.xsd':
        contentType = 'application/xml; charset=utf-8';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.ico':
        contentType = 'image/x-icon';
        break;
      case '.gif':
        contentType = 'image/gif';
        break;
      case '.svg':
        contentType = 'image/svg+xml';
        break;
      case '.txt':
        contentType = 'text/plain; charset=utf-8';
        break;
    }
    
    // Set headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // For binary files, don't perform text substitution
    if (extension === '.png' || extension === '.jpg' || extension === '.jpeg' || 
        extension === '.ico' || extension === '.gif') {
      // Send binary file directly
      res.sendFile(filePath);
    } else {
      // Send processed text content
      res.send(content);
    }
    
    console.log(`[TEMPLATE-FILE] Served: ${templateId}/${folder ? folder + '/' : ''}${filename}, with substitution: ${!!(mikrotikId && apiUrl)}`);
    
  } catch (error) {
    console.error('[TEMPLATE-FILE] Error serving template file:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
};

module.exports = {
  getStats,
  getHotspotUsers,
  getActiveUsers,
  getHotspotProfiles,
  createHotspotProfile,
  updateHotspotProfile,
  deleteHotspotProfile,
  createHotspotUser,
  updateHotspotUser,
  deleteHotspotUser,
  createBulkHotspotUsers,
  disconnectUser,
  getSystemInfo,
  getDetailedSystemInfo,
  getSystemResource,
  getSystemInterfaces,
  restartSystem,
  getHotspotServers,
  createHotspotServer,
  updateHotspotServer,
  deleteHotspotServer,
  getHotspotServerProfiles,
  createHotspotServerProfile,
  updateHotspotServerProfile,
  deleteHotspotServerProfile,
  // Template endpoints
  getTemplates,
  getTemplatePreview,
  getTemplateDetails,
  getTemplateHtml,
  getTemplateFiles,
  getTemplateFile,
  applyTemplate,
  getWireRestInterface,
  createWireRestPeer,
  getWireRestPeers,
  updateWireRestPeer,
  deleteWireRestPeer,
  generateWireGuardConfig,
  checkConnection,
  getBasicSystemInfo,
  getEssentialSystemInfo,
  getCpuMemoryStats,
  saveCustomPasswordTemplate,
  getCustomPasswordTemplate,
  generateInstallRsc,
  generateUninstallRsc
};