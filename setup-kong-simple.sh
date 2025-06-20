#!/bin/bash

echo "Setting up Kong Gateway for payment API..."

# Wait for Kong to be ready
echo "Waiting for Kong Gateway to start..."
until curl -s http://localhost:8001/status > /dev/null 2>&1; do
  echo "Kong not ready yet, waiting..."
  sleep 3
done

echo "Kong Gateway is ready, configuring services..."

# Create payment service
echo "Creating payment-api service..."
curl -i -X POST http://localhost:8001/services/ \
  --data "name=payment-api" \
  --data "url=http://host.docker.internal:5000"

# Create route for the service
echo "Creating route for payment API..."
curl -i -X POST http://localhost:8001/services/payment-api/routes \
  --data "paths[]=/api" \
  --data "strip_path=false"

# Enable CORS plugin
echo "Adding CORS plugin..."
curl -i -X POST http://localhost:8001/services/payment-api/plugins \
  --data "name=cors" \
  --data "config.origins=*" \
  --data "config.methods=GET,POST,PUT,DELETE,OPTIONS" \
  --data "config.headers=Accept,Accept-Version,Content-Length,Content-MD5,Content-Type,Date,X-Auth-Token,x-trace-id,x-span-id,traceparent" \
  --data "config.exposed_headers=X-Auth-Token" \
  --data "config.credentials=true" \
  --data "config.max_age=3600"

echo "Kong Gateway configuration complete!"
echo "Test with: curl http://localhost:8000/api/payments"