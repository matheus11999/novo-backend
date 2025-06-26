# API Usage Examples

## Authentication

All API requests require authentication using the MikroTik token in the header:

```bash
curl -H "X-API-Token: b56334f7-cd50-4e70-bd8b-d30acdb821a5" \
     http://localhost:3000/api/payment/plans
```

## 1. Get Available Plans

```bash
curl -X GET \
  -H "X-API-Token: b56334f7-cd50-4e70-bd8b-d30acdb821a5" \
  http://localhost:3000/api/payment/plans
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "plan-uuid",
      "name": "1hora",
      "session_timeout": "1h",
      "rate_limit": "5M/5M",
      "preco": 5.00,
      "ativo": true
    }
  ]
}
```

## 2. Create Payment

```bash
curl -X POST \
  -H "X-API-Token: b56334f7-cd50-4e70-bd8b-d30acdb821a5" \
  -H "Content-Type: application/json" \
  -d '{"plano_id": "plan-uuid"}' \
  http://localhost:3000/api/payment/create
```

Response:
```json
{
  "success": true,
  "data": {
    "payment_id": "generated-uuid",
    "mercadopago_payment_id": "mp-payment-id",
    "qr_code": "base64-qr-code-image",
    "pix_code": "pix-copy-paste-code",
    "amount": 5.00,
    "expires_at": "2025-06-26T20:30:00Z",
    "status": "pending"
  }
}
```

## 3. Check Payment Status

```bash
curl -X GET \
  -H "X-API-Token: b56334f7-cd50-4e70-bd8b-d30acdb821a5" \
  http://localhost:3000/api/payment/status/generated-uuid
```

Response:
```json
{
  "success": true,
  "data": {
    "payment_id": "generated-uuid",
    "status": "completed",
    "mercadopago_status": "approved",
    "amount": 5.00,
    "plan": {
      "name": "1hora",
      "session_timeout": "1h",
      "preco": 5.00
    },
    "usuario_criado": "user_1703123456789",
    "senha_usuario": "generated-password",
    "expires_at": "2025-06-26T20:30:00Z",
    "paid_at": "2025-06-26T20:15:30Z",
    "created_at": "2025-06-26T20:00:00Z"
  }
}
```

## Webhook URL

MercadoPago will send notifications to:
```
POST http://your-domain.com/api/webhook/mercadopago
```

## Error Responses

All endpoints return consistent error format:
```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

Common HTTP status codes:
- 200: Success
- 400: Bad Request (invalid data)
- 401: Unauthorized (invalid/missing token)
- 404: Not Found
- 429: Too Many Requests (rate limited)
- 500: Internal Server Error