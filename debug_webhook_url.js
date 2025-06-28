require('dotenv').config();

console.log('🔍 Debug webhook URL...\n');

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const webhookUrl = `${baseUrl}/api/webhook/mercadopago`;

console.log('BASE_URL:', process.env.BASE_URL);
console.log('Webhook URL:', webhookUrl);
console.log('URL length:', webhookUrl.length);
console.log('URL is valid:', isValidUrl(webhookUrl));
console.log('URL encode:', encodeURIComponent(webhookUrl));

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Testar diferentes variações
const variations = [
    baseUrl + '/api/webhook/mercadopago',
    'https://api.mikropix.online/api/webhook/mercadopago',
    'https://api.mikropix.online/webhook/mercadopago',
    'https://webhook.site/unique-id' // Para teste
];

console.log('\n🧪 Testando variações:');
variations.forEach((url, index) => {
    console.log(`${index + 1}. ${url} (${isValidUrl(url) ? '✅' : '❌'})`);
});