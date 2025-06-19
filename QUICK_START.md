# Quick Start: Kong Gateway and RabbitMQ Spans

Since you have Docker services running locally, here's the complete setup to see Kong Gateway and RabbitMQ spans in your traces window.

## 1. Configure Kong Gateway (Run Locally)

```bash
# Configure Kong to route to your Express API
curl -X POST http://localhost:8001/services/ \
  -d "name=payment-api" \
  -d "url=http://host.docker.internal:5000"

curl -X POST http://localhost:8001/services/payment-api/routes \
  -d "paths[]=/api" \
  -d "strip_path=false"
```

## 2. Test Kong Gateway Routing

```bash
# Generate authentic Kong Gateway spans
curl -X POST http://localhost:8000/api/payments \
  -H "Content-Type: application/json" \
  -d '{"amount": 3000, "currency": "USD", "recipient": "kong-test@example.com", "description": "Kong Gateway Span Test"}'
```

## 3. Expected Authentic Spans

After Kong configuration, you'll see these real spans in your traces window:

- **Kong Gateway HTTP Span**: Authentic Kong proxy operation
- **Express API HTTP Span**: Backend processing 
- **RabbitMQ Publish Span**: AMQP message publishing (already working)
- **RabbitMQ Consume Span**: AMQP message consumption (already working)

## 4. Compare Direct vs Kong

```bash
# Direct to Express (HTTP + RabbitMQ spans)
curl -X POST http://localhost:5000/api/payments \
  -H "Content-Type: application/json" \
  -d '{"amount": 1500, "currency": "USD", "recipient": "direct@example.com"}'

# Via Kong Gateway (Kong + HTTP + RabbitMQ spans)
curl -X POST http://localhost:8000/api/payments \
  -H "Content-Type: application/json" \
  -d '{"amount": 3000, "currency": "USD", "recipient": "kong@example.com"}'
```

This demonstrates authentic OpenTelemetry context propagation through real Kong Gateway and RabbitMQ services.