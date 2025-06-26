const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');

const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

if (!accessToken) {
    throw new Error('Missing MercadoPago access token. Please check your environment variables.');
}

const client = new MercadoPagoConfig({
    accessToken: accessToken,
    options: {
        timeout: 5000,
        idempotencyKey: 'abc'
    }
});

const payment = new Payment(client);
const preference = new Preference(client);

module.exports = {
    client,
    payment,
    preference
};