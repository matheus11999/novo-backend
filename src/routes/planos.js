const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const authenticateUser = require('../middleware/auth');

router.use(authenticateUser);

// Função para obter credenciais do MikroTik
const getMikrotikCredentials = async (mikrotikId, userId) => {
  const { data: mikrotik, error } = await supabase
    .from('mikrotiks')
    .select('*')
    .eq('id', mikrotikId)
    .eq('user_id', userId)
    .single();

  if (error || !mikrotik) {
    throw new Error('MikroTik não encontrado ou sem permissão');
  }

  return {
    ip: mikrotik.ip,
    username: mikrotik.username,
    password: mikrotik.password,
    port: mikrotik.port || 8728
  };
};

// Função para fazer requisições à API do MikroTik
const makeApiRequest = async (endpoint, credentials, method = 'GET', data = null) => {
  const axios = require('axios');
  
  const params = new URLSearchParams({
    ip: credentials.ip,
    username: credentials.username,
    password: credentials.password,
    port: credentials.port
  });

  const config = {
    method,
    url: `${process.env.MIKROTIK_API_URL}${endpoint}?${params}`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MIKROTIK_API_TOKEN || ''}`
    }
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    config.data = data;
  }

  const response = await axios(config);
  return response.data;
};

// Criar plano (salva no Supabase E cria profile no MikroTik)
router.post('/', async (req, res) => {
  try {
    const { mikrotik_id, nome, descricao, valor, minutos, velocidade_download, velocidade_upload, limite_dados, ativo, visivel, ordem, rate_limit, session_timeout, idle_timeout, sync_only } = req.body;
    
    // Validar dados obrigatórios
    if (!mikrotik_id || !nome || !valor) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios: mikrotik_id, nome, valor'
      });
    }
    
    let mikrotikResponse = null;
    
    // Se sync_only for true, apenas salva no Supabase (para sincronização)
    if (!sync_only) {
      // 1. Criar profile no MikroTik primeiro (apenas se não for sincronização)
      const credentials = await getMikrotikCredentials(mikrotik_id, req.user.id);
      
      const mikrotikProfileData = {
        name: nome,
        'rate-limit': rate_limit || `${velocidade_upload || '1M'}/${velocidade_download || '1M'}`,
        'session-timeout': session_timeout || (minutos ? `${minutos * 60}` : '3600'),
        'idle-timeout': idle_timeout || '300'
      };
      
      mikrotikResponse = await makeApiRequest('/hotspot/profiles', credentials, 'POST', mikrotikProfileData);
    }
    
    // 2. Salvar no Supabase
    const { data, error } = await supabase
      .from('planos')
      .insert({
        mikrotik_id,
        nome,
        descricao: descricao || `Plano ${nome}`,
        valor: parseFloat(valor),
        minutos: minutos ? parseInt(minutos) : null,
        velocidade_download: velocidade_download || rate_limit?.split('/')[1] || '1M',
        velocidade_upload: velocidade_upload || rate_limit?.split('/')[0] || '1M',
        rate_limit: rate_limit || `${velocidade_upload || '1M'}/${velocidade_download || '1M'}`,
        session_timeout: session_timeout || (minutos ? `${minutos * 60}` : '3600'),
        idle_timeout: idle_timeout || '300',
        limite_dados,
        ativo: ativo !== false,
        visivel: visivel !== false,
        ordem: ordem || 0,
        mikrotik_profile_id: sync_only ? nome : (mikrotikResponse?.data?.['.id'] || null), // Use nome se for sync
        shared_users: 1,
        add_mac_cookie: true,
        mac_cookie_timeout: '1d',
        keepalive_timeout: '2m',
        status_autorefresh: '1m'
      })
      .select()
      .single();
    
    if (error) {
      console.error('Erro ao salvar plano no Supabase:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao salvar plano no banco de dados'
      });
    }
    
    res.json({
      success: true,
      data: {
        plano: data,
        mikrotik_profile: mikrotikResponse?.data || null
      },
      message: sync_only ? 'Plano sincronizado com sucesso' : 'Plano criado com sucesso'
    });
    
  } catch (error) {
    console.error('Erro ao criar/sincronizar plano:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota específica para sincronização (apenas salva no Supabase)
router.post('/sync', async (req, res) => {
  try {
    const { mikrotik_id, nome, descricao, valor, minutos, velocidade_download, velocidade_upload, limite_dados, ativo, visivel, ordem, rate_limit, session_timeout, idle_timeout, mikrotik_profile_id } = req.body;
    
    // Validar dados obrigatórios
    if (!mikrotik_id || !nome || !valor) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios: mikrotik_id, nome, valor'
      });
    }
    
    // Verificar se já existe um plano com o mesmo nome
    const { data: existingPlan } = await supabase
      .from('planos')
      .select('id')
      .eq('mikrotik_id', mikrotik_id)
      .eq('nome', nome)
      .single();
    
    if (existingPlan) {
      return res.status(409).json({
        success: false,
        error: 'Plano já existe no banco de dados'
      });
    }
    
    // Salvar no Supabase apenas (sem criar no MikroTik)
    const { data, error } = await supabase
      .from('planos')
      .insert({
        mikrotik_id,
        nome,
        descricao: descricao || `Plano ${nome}`,
        valor: parseFloat(valor),
        minutos: minutos ? parseInt(minutos) : null,
        velocidade_download: velocidade_download || rate_limit?.split('/')[1] || '1M',
        velocidade_upload: velocidade_upload || rate_limit?.split('/')[0] || '1M',
        rate_limit: rate_limit || `${velocidade_upload || '1M'}/${velocidade_download || '1M'}`,
        session_timeout: session_timeout || (minutos ? `${minutos * 60}` : '3600'),
        idle_timeout: idle_timeout || '300',
        limite_dados,
        ativo: ativo !== false,
        visivel: visivel !== false,
        ordem: ordem || 0,
        mikrotik_profile_id: mikrotik_profile_id || nome, // Use o ID do MikroTik ou nome
        shared_users: 1,
        add_mac_cookie: true,
        mac_cookie_timeout: '1d',
        keepalive_timeout: '2m',
        status_autorefresh: '1m'
      })
      .select()
      .single();
    
    if (error) {
      console.error('Erro ao sincronizar plano no Supabase:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao sincronizar plano no banco de dados'
      });
    }
    
    res.json({
      success: true,
      data: data,
      message: 'Plano sincronizado com sucesso'
    });
    
  } catch (error) {
    console.error('Erro ao sincronizar plano:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Atualizar plano (atualiza no Supabase E no MikroTik)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { mikrotik_id, nome, descricao, valor, minutos, velocidade_download, velocidade_upload, limite_dados, ativo, visivel, ordem, rate_limit, session_timeout, idle_timeout } = req.body;
    
    console.log('Updating plan:', { id, nome, valor, rate_limit, session_timeout, idle_timeout });
    
    // Buscar plano existente
    const { data: planoExistente, error: planoError } = await supabase
      .from('planos')
      .select('*')
      .eq('id', id)
      .single();
    
    if (planoError || !planoExistente) {
      console.error('Plan not found:', planoError);
      return res.status(404).json({
        success: false,
        error: 'Plano não encontrado'
      });
    }
    
    // Atualizar profile no MikroTik se existir mikrotik_profile_id
    if (planoExistente.mikrotik_profile_id && mikrotik_id) {
      try {
        const credentials = await getMikrotikCredentials(mikrotik_id, req.user.id);
        
        const mikrotikProfileData = {
          name: nome,
          'rate-limit': rate_limit || `${velocidade_upload || '1M'}/${velocidade_download || '1M'}`,
          'session-timeout': session_timeout || (minutos ? `${minutos * 60}` : '3600'),
          'idle-timeout': idle_timeout || '300'
        };
        
        console.log('Updating MikroTik profile:', { profileId: planoExistente.mikrotik_profile_id, data: mikrotikProfileData });
        
        // Use the profile name instead of ID for the API call
        await makeApiRequest(`/hotspot/profiles?name=${planoExistente.nome}`, credentials, 'PUT', mikrotikProfileData);
        
        console.log('MikroTik profile updated successfully');
      } catch (mikrotikError) {
        console.warn('Failed to update MikroTik profile, continuing with database update:', mikrotikError.message);
        // Continue with database update even if MikroTik update fails
      }
    }
    
    // Atualizar no Supabase
    const { data, error } = await supabase
      .from('planos')
      .update({
        nome: nome || planoExistente.nome,
        descricao: descricao || planoExistente.descricao,
        valor: valor ? parseFloat(valor) : planoExistente.valor,
        minutos: minutos ? parseInt(minutos) : planoExistente.minutos,
        velocidade_download: velocidade_download || rate_limit?.split('/')[1] || planoExistente.velocidade_download,
        velocidade_upload: velocidade_upload || rate_limit?.split('/')[0] || planoExistente.velocidade_upload,
        rate_limit: rate_limit || `${velocidade_upload || planoExistente.velocidade_upload}/${velocidade_download || planoExistente.velocidade_download}`,
        session_timeout: session_timeout || (minutos ? `${minutos * 60}` : planoExistente.session_timeout),
        idle_timeout: idle_timeout || planoExistente.idle_timeout,
        limite_dados: limite_dados || planoExistente.limite_dados,
        ativo: ativo !== undefined ? ativo : planoExistente.ativo,
        visivel: visivel !== undefined ? visivel : planoExistente.visivel,
        ordem: ordem !== undefined ? ordem : planoExistente.ordem,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Erro ao atualizar plano no Supabase:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao atualizar plano no banco de dados'
      });
    }
    
    console.log('Plan updated successfully in database:', data.nome);
    
    res.json({
      success: true,
      data,
      message: 'Plano atualizado com sucesso'
    });
    
  } catch (error) {
    console.error('Erro ao atualizar plano:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Listar planos
router.get('/', async (req, res) => {
  try {
    const { mikrotik_id } = req.query;
    
    let query = supabase
      .from('planos')
      .select('*')
      .order('ordem', { ascending: true });
    
    if (mikrotik_id) {
      query = query.eq('mikrotik_id', mikrotik_id);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Erro ao buscar planos:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar planos'
      });
    }
    
    res.json({
      success: true,
      data,
      count: data.length
    });
    
  } catch (error) {
    console.error('Erro ao listar planos:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Buscar plano por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('planos')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) {
      return res.status(404).json({
        success: false,
        error: 'Plano não encontrado'
      });
    }
    
    res.json({
      success: true,
      data
    });
    
  } catch (error) {
    console.error('Erro ao buscar plano:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Deletar plano
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Buscar plano para obter mikrotik_profile_id
    const { data: plano, error: planoError } = await supabase
      .from('planos')
      .select('*')
      .eq('id', id)
      .single();
    
    if (planoError || !plano) {
      return res.status(404).json({
        success: false,
        error: 'Plano não encontrado'
      });
    }
    
    // Deletar profile do MikroTik se existir
    if (plano.mikrotik_profile_id && plano.mikrotik_id) {
      try {
        const credentials = await getMikrotikCredentials(plano.mikrotik_id, req.user.id);
        // Para deletar, precisamos passar o ID via query parameter
        await makeApiRequest(`/hotspot/profiles?id=${plano.mikrotik_profile_id}`, credentials, 'DELETE');
      } catch (mikrotikError) {
        console.warn('Erro ao deletar profile do MikroTik:', mikrotikError.message);
        // Continua mesmo se falhar no MikroTik
      }
    }
    
    // Deletar do Supabase
    const { error } = await supabase
      .from('planos')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Erro ao deletar plano do Supabase:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao deletar plano do banco de dados'
      });
    }
    
    res.json({
      success: true,
      message: 'Plano deletado com sucesso'
    });
    
  } catch (error) {
    console.error('Erro ao deletar plano:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router; 