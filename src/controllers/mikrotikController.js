const axios = require('axios');
const supabase = require('../config/database');

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

  return {
    ip: mikrotik.ip,
    username: mikrotik.username,
    password: mikrotik.password,
    port: mikrotik.port || 8728,
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
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    const [hotspotStats, systemInfo] = await Promise.all([
      makeApiRequest('/hotspot/stats', credentials),
      makeApiRequest('/system/info', credentials)
    ]);

    res.json({
      success: true,
      data: {
        mikrotik: credentials.mikrotik,
        hotspot: hotspotStats.data,
        system: systemInfo.data
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
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

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
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

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
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    const response = await makeApiRequest('/hotspot/profiles', credentials);

    res.json({
      success: true,
      data: response.data,
      count: response.count
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

    const response = await makeApiRequest('/hotspot/profiles', credentials, 'POST', req.body);

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

    const response = await makeApiRequest(`/hotspot/profiles?id=${profileId}`, credentials, 'PUT', req.body);

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

const restartSystem = async (req, res) => {
  try {
    const { mikrotikId } = req.params;
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

    const response = await makeApiRequest('/system/restart', credentials, 'POST');

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
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

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
    const credentials = await getMikrotikCredentials(mikrotikId, req.user.id);

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
  restartSystem,
  getHotspotServers,
  createHotspotServer,
  updateHotspotServer,
  deleteHotspotServer,
  getHotspotServerProfiles,
  createHotspotServerProfile,
  updateHotspotServerProfile,
  deleteHotspotServerProfile
};