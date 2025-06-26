const fs = require('fs');
const https = require('https');

// Read the SQL file
const sqlContent = fs.readFileSync('./supabase_payment_schema.sql', 'utf8');

// Split SQL into individual statements
const statements = sqlContent
  .split(';')
  .map(stmt => stmt.trim())
  .filter(stmt => stmt && !stmt.startsWith('--'))
  .map(stmt => stmt + ';');

const SUPABASE_URL = 'https://uyxmptrxgycuybtdthtb.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5eG1wdHJ4Z3ljdXlidGR0aHRiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDg2NDE4MywiZXhwIjoyMDY2NDQwMTgzfQ.S8B_7OkwiVZYwjed201IM-FlAUVpfLyhsWnQU9Ppldw';

async function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    
    const options = {
      hostname: 'uyxmptrxgycuybtdthtb.supabase.co',
      port: 443,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(responseData);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

async function applySchema() {
  console.log(`Applying ${statements.length} SQL statements...`);
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    console.log(`\n[${i + 1}/${statements.length}] Executing:`, statement.substring(0, 100) + '...');
    
    try {
      const result = await executeSQL(statement);
      console.log('✓ Success');
    } catch (error) {
      console.error('✗ Error:', error.message);
      // Continue with next statement even if one fails
    }
  }
  
  console.log('\nSchema application completed!');
}

applySchema().catch(console.error);