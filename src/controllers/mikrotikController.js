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

    // Adicionar token da API MikroTik
    config.headers['Authorization'] = `Bearer ${process.env.MIKROTIK_API_TOKEN || 'a7f8e9d2c1b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0'}`;

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
    const [hotspotStats, systemInfo, systemResource] = await Promise.allSettled([
      makeApiRequest('/hotspot/stats', credentials),
      makeApiRequest('/system/info', credentials),
      makeApiRequest('/system/resource', credentials)
    ]);

    // Extract successful results or provide defaults
    const hotspotData = hotspotStats.status === 'fulfilled' ? hotspotStats.value : { data: {} };
    const systemData = systemInfo.status === 'fulfilled' ? systemInfo.value : { data: {} };
    const resourceData = systemResource.status === 'fulfilled' ? systemResource.value : { data: {} };

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

    // Combine system info and resource data for comprehensive stats
    const combinedSystemData = {
      ...systemData.data,
      resource: resourceData.data
    };

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
        resourceFailed: systemResource.status === 'rejected'
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

    const response = await makeApiRequest('/hotspot/users', credentials);

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

    // Create profile in MikroTik first
    const response = await makeApiRequest('/hotspot/profiles', credentials, 'POST', req.body);
    
    // If successful and we have additional data for database, create database record
    if (response.success && req.body.createInDatabase) {
      const profileId = response.data?.['.id'];
      
      const { data: dbPlan, error: dbError } = await supabase
        .from('planos')
        .insert({
          mikrotik_id: mikrotikId,
          nome: req.body.name,
          mikrotik_profile_id: profileId,
          valor: req.body.valor || 0,
          descricao: req.body.descricao || `Plano ${req.body.name}`,
          rate_limit: req.body['rate-limit'],
          session_timeout: req.body['session-timeout'],
          idle_timeout: req.body['idle-timeout'],
          velocidade_upload: req.body['rate-limit']?.split('/')[0],
          velocidade_download: req.body['rate-limit']?.split('/')[1],
          minutos: req.body['session-timeout'] ? Math.floor(parseInt(req.body['session-timeout']) / 60) : null
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

    // Update profile in MikroTik - add profileId to request body
    const profileData = {
      ...req.body,
      id: profileId
    };
    const response = await makeApiRequest('/hotspot/profiles', credentials, 'PUT', profileData);

    // If successful and we have a database plan, update it too
    if (response.success && req.body.updateInDatabase) {
      const { data: dbPlan, error: findError } = await supabase
        .from('planos')
        .select('*')
        .eq('mikrotik_profile_id', profileId)
        .eq('mikrotik_id', mikrotikId)
        .single();

      if (!findError && dbPlan) {
        const { error: updateError } = await supabase
          .from('planos')
          .update({
            nome: req.body.name,
            valor: req.body.valor || dbPlan.valor,
            rate_limit: req.body['rate-limit'],
            session_timeout: req.body['session-timeout'],
            idle_timeout: req.body['idle-timeout'],
            velocidade_upload: req.body['rate-limit']?.split('/')[0],
            velocidade_download: req.body['rate-limit']?.split('/')[1],
            minutos: req.body['session-timeout'] ? Math.floor(parseInt(req.body['session-timeout']) / 60) : null,
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
      templateContent, 
      variables, 
      mikrotikParams 
    } = req.body

    // Get MikroTik credentials
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id)

    // Generate unique filename for this template
    const templateFileName = `template_${mikrotikId}_${Date.now()}.html`
    
    // Store the processed template content temporarily (in memory for now)
    global.templateCache = global.templateCache || new Map()
    global.templateCache.set(templateFileName, templateContent)
    
    // Create the download URL that MikroTik will fetch from
    const baseUrl = process.env.BASE_URL || 'https://api.mikropix.online'
    const downloadUrl = `${baseUrl}/api/mikrotik/template/${templateFileName}`
    
    console.log('Template will be available at:', downloadUrl)

    // Execute fetch command directly via RouterOS API
    let fetchResponse;
    try {
      console.log('Executing fetch command directly...')
      fetchResponse = await axios.post(`${MIKROTIK_API_URL}/tools/fetch`, {
        url: downloadUrl,
        'dst-path': 'flash/mikropix/login.html'
      }, {
        params: {
          ip: credentials.ip,
          username: credentials.username,
          password: credentials.password,
          port: credentials.port
        },
        headers: {
          'Authorization': `Bearer ${process.env.MIKROTIK_API_TOKEN || 'a7f8e9d2c1b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0'}`
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
              'Authorization': `Bearer ${process.env.MIKROTIK_API_TOKEN || 'a7f8e9d2c1b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0'}`
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
                'Authorization': `Bearer ${process.env.MIKROTIK_API_TOKEN || 'a7f8e9d2c1b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0'}`
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
                  'Authorization': `Bearer ${process.env.MIKROTIK_API_TOKEN || 'a7f8e9d2c1b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0'}`
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
                  'Authorization': `Bearer ${process.env.MIKROTIK_API_TOKEN || 'a7f8e9d2c1b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0'}`
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

  } catch (error) {
    console.error('Error applying template:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    })
  }
}

// ==================== WIREGUARD FUNCTIONS ====================

const createWireGuardConfig = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    const userId = req.user.id;

    // Verificar se o usuário tem acesso ao MikroTik
    const credentials = await getMikrotikCredentials(mikrotikId, userId);
    
    console.log('Creating WireGuard config for MikroTik:', mikrotikId);

    // Criar cliente WireGuard na API VPS2
    const response = await axios.post(`${MIKROTIK_API_URL}/wireguard/clients`, {
      clientName: `mikrotik-${mikrotikId}`,
      mikrotikId: mikrotikId
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.MIKROTIK_API_TOKEN}`
      }
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Falha ao criar configuração WireGuard');
    }

    const wireguardData = response.data.data;

    // Gerar configuração MikroTik
    const configResponse = await axios.get(`${MIKROTIK_API_URL}/wireguard/clients/${wireguardData.client.clientName}/mikrotik-config/${mikrotikId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.MIKROTIK_API_TOKEN}`
      }
    });

    // Salvar informações WireGuard no banco de dados
    const { error: updateError } = await supabase
      .from('mikrotiks')
      .update({
        wireguard_client_name: `mikrotik-${mikrotikId}`,
        wireguard_config_generated: true,
        wireguard_created_at: new Date().toISOString()
      })
      .eq('id', mikrotikId)
      .eq('user_id', userId);

    if (updateError) {
      console.warn('Warning: Failed to save WireGuard info to database:', updateError.message);
    }

    res.json({
      success: true,
      data: {
        ...wireguardData,
        mikrotikConfig: configResponse.data.data.mikrotikConfig
      },
      message: 'Configuração WireGuard criada com sucesso'
    });

  } catch (error) {
    console.error('Error creating WireGuard config:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Erro ao criar configuração WireGuard'
    });
  }
};

const getWireGuardConfig = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    const userId = req.user.id;

    // Verificar se o usuário tem acesso ao MikroTik
    const credentials = await getMikrotikCredentials(mikrotikId, userId);
    
    console.log('Getting WireGuard config for MikroTik:', mikrotikId);

    // Obter/recriar configuração WireGuard
    const response = await axios.post(`${MIKROTIK_API_URL}/wireguard/recreate-config`, {
      mikrotikId: mikrotikId
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.MIKROTIK_API_TOKEN}`
      }
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Falha ao obter configuração WireGuard');
    }

    // Atualizar informações no banco se necessário
    if (response.data.data.isNewClient) {
      const { error: updateError } = await supabase
        .from('mikrotiks')
        .update({
          wireguard_client_name: `mikrotik-${mikrotikId}`,
          wireguard_config_generated: true,
          wireguard_created_at: new Date().toISOString()
        })
        .eq('id', mikrotikId)
        .eq('user_id', userId);

      if (updateError) {
        console.warn('Warning: Failed to save WireGuard info to database:', updateError.message);
      }
    }

    res.json({
      success: true,
      data: response.data.data,
      message: response.data.message
    });

  } catch (error) {
    console.error('Error getting WireGuard config:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Erro ao obter configuração WireGuard'
    });
  }
};

const deleteWireGuardConfig = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    const userId = req.user.id;

    // Verificar se o usuário tem acesso ao MikroTik
    const credentials = await getMikrotikCredentials(mikrotikId, userId);
    
    console.log('Deleting WireGuard config for MikroTik:', mikrotikId);

    // Deletar cliente WireGuard na API VPS2
    const clientName = `mikrotik-${mikrotikId}`;
    const response = await axios.delete(`${MIKROTIK_API_URL}/wireguard/clients/${clientName}`, {
      headers: {
        'Authorization': `Bearer ${process.env.MIKROTIK_API_TOKEN}`
      }
    });

    // Limpar informações WireGuard no banco de dados
    const { error: updateError } = await supabase
      .from('mikrotiks')
      .update({
        wireguard_client_name: null,
        wireguard_config_generated: false,
        wireguard_created_at: null
      })
      .eq('id', mikrotikId)
      .eq('user_id', userId);

    if (updateError) {
      console.warn('Warning: Failed to clear WireGuard info from database:', updateError.message);
    }

    res.json({
      success: true,
      data: response.data,
      message: 'Configuração WireGuard removida com sucesso'
    });

  } catch (error) {
    console.error('Error deleting WireGuard config:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Erro ao remover configuração WireGuard'
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
  createWireGuardConfig,
  getWireGuardConfig,
  deleteWireGuardConfig
};