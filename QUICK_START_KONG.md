# Kong Gateway Quick Start for Authentic Spans

## Current Status
Your system is working with authentic OpenTelemetry spans for:
- ✅ HTTP requests (payments.process) 
- ✅ RabbitMQ operations (rabbitmq.publish, rabbitmq.consume)
- ❌ Kong Gateway spans (needs configuration)

## Enable Kong Gateway Spans

1. **Check Kong Gateway Status**
```bash
curl http://localhost:8001/status
```

2. **If Kong is running, configure it:**
```bash
./kong-setup-quick.sh
```

3. **Verify Kong configuration:**
```bash
curl http://localhost:8000/api/payments
```

4. **Enable Kong routing in frontend:**
Edit `client/src/lib/queryClient.ts` line 22:
```javascript
const targetUrl = url.startsWith('/api') ? `http://localhost:8000${url}` : url;
```

## Expected Result
Once Kong Gateway is configured, traces will show:
- Kong Gateway spans (proxy operations)
- Express backend spans (payment processing)  
- RabbitMQ spans (message publishing)

## Manual Kong Configuration
If automated setup fails, configure manually:

```bash
# Create service
curl -X POST http://localhost:8001/services/ \
  -d "name=payment-api" \
  -d "url=http://host.docker.internal:5000"

# Create route  
curl -X POST http://localhost:8001/services/payment-api/routes \
  -d "paths[]=/api" \
  -d "strip_path=false"

# Add CORS
curl -X POST http://localhost:8001/services/payment-api/plugins \
  -d "name=cors" \
  -d "config.origins=http://localhost:5000" \
  -d "config.credentials=true"
```

Your RabbitMQ traces are working perfectly - messages are accumulating for manual inspection as requested.