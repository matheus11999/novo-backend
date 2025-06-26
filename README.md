# MikroTik Payment Backend

Backend system for managing MikroTik payment plans with MercadoPago PIX integration.

## Features

- 🔐 Secure API with token-based authentication
- 💳 MercadoPago PIX payment integration
- 📊 Real-time payment status tracking
- 🔄 Webhook handling for payment notifications
- 💰 Automatic commission calculation
- 📝 Transaction history tracking
- 🛡️ Rate limiting and security measures

## Requirements

- Node.js 16+ 
- Supabase account
- MercadoPago account

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Edit the `.env` file with your credentials.

4. Set up the database by running the SQL schema in `database_schema.sql` in your Supabase SQL editor.

## Configuration

### Environment Variables

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key
- `MERCADOPAGO_ACCESS_TOKEN`: Your MercadoPago access token
- `WEBHOOK_BASE_URL`: Base URL for webhook callbacks
- `PORT`: Server port (default: 3000)

### Database Setup

Run the SQL schema provided in `database_schema.sql` in your Supabase SQL editor to create the required tables.

## API Endpoints

### Authentication

All endpoints require authentication via `X-API-Token` header or `Authorization: Bearer <token>` header.

### Payment Endpoints

- `GET /api/payment/plans` - Get available plans
- `POST /api/payment/create` - Create a new payment
- `GET /api/payment/status/:payment_id` - Get payment status

### Webhook Endpoints

- `POST /api/webhook/mercadopago` - MercadoPago payment webhook

## Usage

1. Start the server:
   ```bash
   npm start
   ```
   
   For development:
   ```bash
   npm run dev
   ```

2. The server will start on the configured port (default: 3000)

3. Check health status: `GET /health`

## API Token Authentication

Each MikroTik in the database has a unique token. Use this token in the `X-API-Token` header for authentication.

## Payment Flow

1. Client requests available plans
2. Client selects a plan and creates payment
3. System generates MercadoPago PIX payment
4. Client pays via PIX
5. MercadoPago sends webhook notification
6. System processes payment and creates MikroTik user
7. System records transaction history

## Security Features

- Rate limiting on all endpoints
- API token authentication
- Helmet security headers
- Input validation
- Secure error handling

## Development

The project structure:
```
src/
├── config/         # Configuration files
├── controllers/    # Route controllers
├── middleware/     # Custom middleware
├── models/         # Database models
├── routes/         # API routes
├── utils/          # Utility functions
└── server.js       # Main server file
```

## Environment Files

- `.env` - Main environment file
- `.env.local` - Local development overrides
- `.env.example` - Example environment variables

## License

ISC