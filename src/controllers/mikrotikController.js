const axios = require('axios');
const { supabase } = require('../config/database');

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
    if (error.response) {
      throw new Error(error.response.data?.error || 'Erro na API do MikroTik');
    }
    throw new Error('Erro de conexão com a API do MikroTik');
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

// Apply template to MikroTik using fetch method
const applyTemplate = async (req, res) => {
  try {
    const { 
      mikrotikId, 
      serverProfileId, 
      templateId, 
      templateContent, // Para compatibilidade com versão anterior
      templateFiles,   // Nova propriedade para múltiplos arquivos
      variables, 
      mikrotikParams 
    } = req.body

    // Get MikroTik credentials
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id)

    console.log(`[APPLY-TEMPLATE] Aplicando template para MikroTik ${mikrotikId}`)

    // Determinar se estamos usando o novo formato (templateFiles) ou o antigo (templateContent)
    const isMultipleFiles = templateFiles && Array.isArray(templateFiles)
    let uploadResponse = null
    let fetchResponse = null
    let downloadUrl = null
    
    if (isMultipleFiles) {
      console.log(`[APPLY-TEMPLATE] Enviando ${templateFiles.length} arquivo(s) individualmente via fetch`)
      
      const MIKROTIK_API_URL = process.env.MIKROTIK_API_URL || 'http://193.181.208.141:3000'
      const baseUrl = process.env.BASE_URL || 'https://api.mikropix.online'
      
      // Armazenar temporariamente os arquivos para download
      global.templateCache = global.templateCache || new Map()
      
      const fetchResults = []
      
      // Processar cada arquivo individualmente
      for (const file of templateFiles) {
        const uniqueFileName = `${file.name.replace('.', '_')}_${mikrotikId}_${Date.now()}`
        const downloadUrl = `${baseUrl}/api/mikrotik/template/${uniqueFileName}`
        
        // Armazenar arquivo no cache temporário
        global.templateCache.set(uniqueFileName, file.content)
        
        console.log(`[APPLY-TEMPLATE] Fazendo fetch de ${file.name} para ${file.path}`)
        
        try {
          // Executar comando fetch via RouterOS API para cada arquivo
          const fetchResponse = await axios.post(`${MIKROTIK_API_URL}/tools/fetch`, {
            url: downloadUrl,
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
      
      uploadResponse = { data: { success: true, files: fetchResults } }
      
      // Buscar o arquivo login.html para usar no server profile
      const loginFile = templateFiles.find(f => f.name === 'login.html')
      if (!loginFile) {
        throw new Error('Arquivo login.html não encontrado nos arquivos do template')
      }

    } else {
      // Modo de compatibilidade: usar o método antigo com templateContent
      console.log('[APPLY-TEMPLATE] Usando modo de compatibilidade com templateContent')
      
      // Generate unique filename for this template
      const templateFileName = `template_${mikrotikId}_${Date.now()}.html`
      
      // Store the processed template content temporarily (in memory for now)
      global.templateCache = global.templateCache || new Map()
      global.templateCache.set(templateFileName, templateContent)
      
      // Create the download URL that MikroTik will fetch from
      const baseUrl = process.env.BASE_URL || 'https://api.mikropix.online'
      downloadUrl = `${baseUrl}/api/mikrotik/template/${templateFileName}`
      
            console.log('Template will be available at:', downloadUrl)

      // Execute fetch command directly via RouterOS API
      try {
        console.log('Executing fetch command directly...')
        fetchResponse = await axios.post(`${MIKROTIK_API_URL}/tools/fetch`, {
          url: downloadUrl,
          'dst-path': 'mikropix/login.html'
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
          }
        })
      } catch (fetchError) {
        console.warn('Warning: Direct fetch failed, template is available for manual download:', fetchError.message)
        fetchResponse = { 
          data: { 
            success: false, 
            error: 'Direct fetch failed, but template is hosted and can be downloaded manually',
            downloadUrl: downloadUrl
          } 
        }
      }
      
      // Clean up the cached template after some time
      setTimeout(() => {
        global.templateCache.delete(templateFileName)
      }, 300000) // Clean up after 5 minutes
    }

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
              'html_directory': '/flash/mikropix'
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
                'html_directory': '/flash/mikropix'
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
                html_directory: '/flash/mikropix',
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

    // Resposta baseada no modo usado
    if (isMultipleFiles) {
      res.json({
        success: true,
        data: {
          templateId,
          mikrotikId,
          serverProfileId,
          filesUploaded: templateFiles.length,
          fileNames: templateFiles.map(f => f.name),
          uploadResult: uploadResponse.data
        },
        message: `Template aplicado com sucesso! ${templateFiles.length} arquivo(s) enviado(s): ${templateFiles.map(f => f.name).join(', ')}`
      })
    } else {
      res.json({
        success: true,
        data: {
          downloadUrl,
          templateId,
          mikrotikId,
          serverProfileId,
          fetch: fetchResponse.data,
          templateHosted: true
        },
        message: fetchResponse.data.success !== false 
          ? 'Template aplicado com sucesso usando fetch' 
          : `Template hospedado com sucesso. Download manual disponível em: ${downloadUrl}`
      })
    }

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
    
    // Buscar chave pública do servidor WireRest
    let serverPublicKey = 'pKTynf0wxJpeuPtqiOoYMN3a44qQTYFKYwSETKhXinw='; // fallback
    try {
      const serverInfo = await getWireRestInterface();
      if (serverInfo.success && serverInfo.data.publicKey) {
        serverPublicKey = serverInfo.data.publicKey;
      }
    } catch (error) {
      console.warn('Usando chave pública padrão do servidor');
    }
    
    // Extrair IP do cliente
    const clientIP = mikrotik.wireguard_allowed_subnets?.split(',')[0] || '10.8.0.3/24';
    
    // Gerar configuração MikroTik
    const mikrotikConfig = `/interface/wireguard
add name="wg-client" private-key="${mikrotik.wireguard_private_key}" listen-port=64326 comment="Interface WireGuard cliente - Criado automaticamente"
/interface/wireguard/peers
add interface="wg-client" public-key="${serverPublicKey}" preshared-key="${mikrotik.wireguard_preshared_key || ''}" allowed-address="0.0.0.0/0,::/0" endpoint-address="193.181.208.141" endpoint-port="64326" persistent-keepalive="25s" comment="Peer servidor WireGuard - Criado automaticamente"
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

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout after 5 seconds')), 5000);
    });

    // Get only essential system information
    const response = await Promise.race([
      makeApiRequest('/system/essential-info', credentials),
      timeoutPromise
    ]);

    console.log('[ESSENTIAL-INFO] Raw API response:', JSON.stringify(response, null, 2));

    const finalResponse = {
      success: true,
      data: response.data
    };

    console.log('[ESSENTIAL-INFO] Final response:', JSON.stringify(finalResponse, null, 2));
    res.json(finalResponse);
  } catch (error) {
    console.error('[ESSENTIAL-INFO] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
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

    // Calculate memory usage percentage
    const totalMemory = parseInt(resourceData['total-memory'] || '0');
    const freeMemory = parseInt(resourceData['free-memory'] || '0');
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = totalMemory > 0 ? Math.round((usedMemory / totalMemory) * 100) : 0;

    // Extract CPU percentage
    const cpuLoad = resourceData['cpu-load'] || '0%';
    const cpuPercent = parseInt(cpuLoad.replace('%', '')) || 0;

    console.log(`[CPU-MEMORY] CPU: ${cpuPercent}%, Memory: ${memoryUsagePercent}%`);

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
  getCustomPasswordTemplate
};