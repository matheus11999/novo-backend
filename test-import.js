console.log('Testing imports...');

try {
  const controller = require('./src/controllers/subscriptionController');
  console.log('Controller loaded successfully');
  console.log('Methods:', Object.getOwnPropertyNames(controller));
  console.log('createPayment type:', typeof controller.createPayment);
  console.log('getPaymentStatus type:', typeof controller.getPaymentStatus);
  console.log('processWebhook type:', typeof controller.processWebhook);
} catch(e) {
  console.error('Import error:', e.message);
  console.error('Stack:', e.stack);
} 