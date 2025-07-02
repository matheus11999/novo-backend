// Test if subscription controller can be imported
require('dotenv').config();

console.log('Environment variables loaded:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Not set');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Not set');
console.log('MERCADOPAGO_ACCESS_TOKEN:', process.env.MERCADOPAGO_ACCESS_TOKEN ? 'Set' : 'Not set');

try {
    console.log('\nTrying to import subscription controller...');
    const subscriptionController = require('./src/controllers/subscriptionController');
    console.log('✅ Import successful!');
    console.log('Controller methods:', Object.keys(subscriptionController));
} catch (error) {
    console.error('❌ Import failed:', error.message);
    console.error('Stack:', error.stack);
} Bcdedit.exe -set TESTSIGNING ON