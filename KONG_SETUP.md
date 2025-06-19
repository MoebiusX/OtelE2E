# Kong Gateway Setup for Authentic Spans

Run these commands locally to configure Kong and see Kong spans in your traces:

## 1. Configure Kong Gateway
```bash
# Run the setup script
./setup-kong.sh
```

## 2. Test Kong Gateway Routing
```bash
# Route payment through Kong Gateway (will generate Kong spans)
curl -X POST http://localhost:8000/api/payments \
  -H "Content-Type: application/json" \
  -d '{"amount": 2500, "currency": "USD", "recipient": "kong@example.com", "description": "Kong Gateway Test"}'
```

## 3. Expected Spans
After routing through Kong, you should see these authentic spans:
- **kong-gateway span**: Kong proxy operation
- **http span**: Express API operation  
- **rabbitmq publish span**: AMQP message publishing
- **rabbitmq consume span**: AMQP message consumption

## 4. Direct vs Kong Comparison
```bash
# Direct to Express (only HTTP + RabbitMQ spans)
curl -X POST http://localhost:5000/api/payments \
  -H "Content-Type: application/json" \
  -d '{"amount": 1500, "currency": "USD", "recipient": "direct@example.com"}'

# Via Kong Gateway (HTTP + Kong + RabbitMQ spans)  
curl -X POST http://localhost:8000/api/payments \
  -H "Content-Type: application/json" \
  -d '{"amount": 2500, "currency": "USD", "recipient": "kong@example.com"}'
```

The traces window will show authentic OpenTelemetry spans from real Kong Gateway operations.