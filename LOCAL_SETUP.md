# Complete Local Setup for Kong Gateway and RabbitMQ Spans

Since you have Docker services running locally, here's the complete setup to see Kong Gateway and RabbitMQ spans in your traces window.

## Step 1: Configure Kong Gateway

Run this command to configure Kong to route to your Express API:

```bash
# Configure Kong service and route
curl -X POST http://localhost:8001/services/ \
  --data name="payment-api" \
  --data url="http://host.docker.internal:5000"

curl -X POST http://localhost:8001/services/payment-api/routes \
  --data paths[]="/api" \
  --data strip_path=false
```

## Step 2: Test Kong Gateway Routing

```bash
# This will generate authentic Kong Gateway spans
curl -X POST http://localhost:8000/api/payments \
  -H "Content-Type: application/json" \
  -d '{"amount": 2500, "currency": "USD", "recipient": "kong-test@example.com", "description": "Kong Gateway Span Test"}'
```

## Step 3: Expected Span Flow

When routing through Kong, you should see these authentic spans in the traces window:

1. **Kong Gateway Span**: Proxy operation from Kong
2. **HTTP Span**: Express API processing  
3. **RabbitMQ Publish Span**: Message publishing to queue
4. **RabbitMQ Consume Span**: Message consumption from queue

## Step 4: Compare Direct vs Kong

```bash
# Direct (HTTP + RabbitMQ spans only)
curl -X POST http://localhost:5000/api/payments \
  -H "Content-Type: application/json" \
  -d '{"amount": 1500, "currency": "USD", "recipient": "direct@example.com"}'

# Via Kong (Kong + HTTP + RabbitMQ spans)
curl -X POST http://localhost:8000/api/payments \
  -H "Content-Type: application/json" \
  -d '{"amount": 2500, "currency": "USD", "recipient": "kong@example.com"}'
```

## Troubleshooting

If Kong routing fails, try the Docker gateway IP instead:
```bash
curl -X POST http://localhost:8001/services/ \
  --data name="payment-api" \
  --data url="http://172.17.0.1:5000"
```

The traces window will now show authentic OpenTelemetry spans from real Kong Gateway and RabbitMQ operations.