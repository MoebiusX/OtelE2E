#!/bin/bash

# Configure Kong Gateway for the Payment API
echo "Configuring Kong Gateway..."

# Wait for Kong to be ready
echo "Waiting for Kong Gateway to be ready..."
until curl -f http://localhost:8001/status > /dev/null 2>&1; do
  echo "Kong not ready yet, waiting..."
  sleep 2
done

echo "Kong Gateway is ready!"

# Create the payment service
echo "Creating payment service..."
curl -i -X POST http://localhost:8001/services/ \
  --data name="payment-api" \
  --data url="http://host.docker.internal:5000" \
  --data connect_timeout=60000 \
  --data write_timeout=60000 \
  --data read_timeout=60000

# Create route for the payment service
echo "Creating payment route..."
curl -i -X POST http://localhost:8001/services/payment-api/routes \
  --data paths[]="/api" \
  --data strip_path=false \
  --data preserve_host=false

# Enable OpenTelemetry plugin for tracing
echo "Enabling OpenTelemetry plugin..."
curl -i -X POST http://localhost:8001/plugins/ \
  --data name="opentelemetry" \
  --data config.endpoint="http://jaeger:14268/api/traces" \
  --data config.service_name="kong-gateway" \
  --data config.resource_attributes.service.name="kong-gateway" \
  --data config.resource_attributes.service.version="1.0.0"

# Enable request tracing plugin
echo "Enabling request tracing..."
curl -i -X POST http://localhost:8001/plugins/ \
  --data name="correlation-id" \
  --data config.header_name="x-trace-id" \
  --data config.generator="uuid#counter" \
  --data config.echo_downstream=true

echo "Kong Gateway configuration complete!"
echo ""
echo "Test the setup:"
echo "curl -X POST http://localhost:8000/api/payments \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"amount\": 1500, \"currency\": \"USD\", \"recipient\": \"kong@example.com\", \"description\": \"Kong Gateway Test\"}'"