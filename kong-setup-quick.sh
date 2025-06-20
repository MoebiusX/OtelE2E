#!/bin/bash

# Quick Kong Gateway setup for payment API with CORS
echo "Configuring Kong Gateway..."

# Create service
curl -X POST http://localhost:8001/services/ \
  -d "name=payment-api" \
  -d "url=http://host.docker.internal:5000" 2>/dev/null

# Create route
curl -X POST http://localhost:8001/services/payment-api/routes \
  -d "paths[]=/api" \
  -d "strip_path=false" 2>/dev/null

# Add CORS plugin
curl -X POST http://localhost:8001/services/payment-api/plugins \
  -d "name=cors" \
  -d "config.origins=http://localhost:5000" \
  -d "config.methods=GET,POST,PUT,DELETE,OPTIONS" \
  -d "config.headers=Content-Type,Authorization,x-trace-id,x-span-id,traceparent" \
  -d "config.credentials=true" 2>/dev/null

echo "Kong Gateway configured for payment API"