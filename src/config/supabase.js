const { createClient } = require('@supabase/supabase-js');
const logger = require('./logger');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL é obrigatório');
}

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY é obrigatório');
}

// Cliente otimizado com configurações de performance
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'x-client-info': 'mikropix-backend/1.0.0'
    }
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Wrapper para logging automático de queries
const createQueryLogger = (originalMethod, methodName) => {
  return function(...args) {
    const startTime = Date.now();
    const result = originalMethod.apply(this, args);
    
    // Se é uma Promise, logar quando completar
    if (result && typeof result.then === 'function') {
      return result.then(
        (data) => {
          const duration = Date.now() - startTime;
          logger.performance(`Supabase query completed: ${methodName}`, {
            component: 'SUPABASE',
            method: methodName,
            duration,
            success: true
          });
          return data;
        },
        (error) => {
          const duration = Date.now() - startTime;
          logger.error(`Supabase query failed: ${methodName}`, {
            component: 'SUPABASE',
            method: methodName,
            duration,
            error: error.message
          });
          throw error;
        }
      );
    }
    
    return result;
  };
};

// Wrapping métodos principais para logging
const originalFrom = supabase.from.bind(supabase);
supabase.from = (tableName) => {
  const table = originalFrom(tableName);
  
  // Wrapper para select
  const originalSelect = table.select.bind(table);
  table.select = createQueryLogger(originalSelect, `SELECT from ${tableName}`);
  
  // Wrapper para insert
  const originalInsert = table.insert.bind(table);
  table.insert = createQueryLogger(originalInsert, `INSERT into ${tableName}`);
  
  // Wrapper para update
  const originalUpdate = table.update.bind(table);
  table.update = createQueryLogger(originalUpdate, `UPDATE ${tableName}`);
  
  // Wrapper para delete
  const originalDelete = table.delete.bind(table);
  table.delete = createQueryLogger(originalDelete, `DELETE from ${tableName}`);
  
  return table;
};

// Query optimization helpers
const queryOptimizer = {
  // Batch queries para reduzir round trips
  async batchQueries(queries) {
    const startTime = Date.now();
    
    try {
      const results = await Promise.all(queries);
      const duration = Date.now() - startTime;
      
      logger.performance('Batch queries completed', {
        component: 'SUPABASE',
        queryCount: queries.length,
        duration
      });
      
      return results;
    } catch (error) {
      logger.error('Batch queries failed', {
        component: 'SUPABASE',
        queryCount: queries.length,
        error: error.message
      });
      throw error;
    }
  },

  // Query com retry automático
  async queryWithRetry(queryFn, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await queryFn();
      } catch (error) {
        lastError = error;
        
        // Não tentar novamente para erros de validação
        if (error.code === 'PGRST116' || error.code === '42P01') {
          throw error;
        }
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          logger.warn(`Query retry attempt ${attempt}/${maxRetries}`, {
            component: 'SUPABASE',
            error: error.message,
            retryDelay: delay
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  },

  // Paginação otimizada
  async paginatedQuery(table, pageSize = 100, startId = null) {
    let query = table
      .select('*')
      .order('created_at', { ascending: false })
      .limit(pageSize);
    
    if (startId) {
      query = query.gt('id', startId);
    }
    
    return query;
  }
};

module.exports = {
  supabase,
  queryOptimizer
};