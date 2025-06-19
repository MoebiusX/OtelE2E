#!/bin/bash

echo "🔧 Configuring Kong Gateway for authentic spans..."

# Wait for Kong to be ready
until curl -s http://localhost:8001/status > /dev/null; do
  echo "⏳ Waiting for Kong Gateway..."
  sleep 2
done

echo "✅ Kong Gateway ready"

# Configure payment service
echo "🔧 Creating payment-api service..."
curl -s -X POST http://localhost:8001/services/ \
  -d "name=payment-api" \
  -d "url=http://host.docker.internal:5000" \
  -d "connect_timeout=60000" \
  -d "write_timeout=60000" \
  -d "read_timeout=60000"

# Configure route
echo "🔧 Creating payment route..."
curl -s -X POST http://localhost:8001/services/payment-api/routes \
  -d "paths[]=/api" \
  -d "strip_path=false" \
  -d "preserve_host=false"

# Test configuration
echo "🧪 Testing Kong Gateway routing..."
TEST_PAYMENT='{"amount":9999,"currency":"USD","recipient":"kong-test@example.com","description":"Kong Gateway Configuration Test"}'

RESPONSE=$(curl -s -X POST http://localhost:8000/api/payments \
  -H "Content-Type: application/json" \
  -d "$TEST_PAYMENT")

if echo "$RESPONSE" | grep -q "success"; then
  echo "✅ Kong Gateway configured successfully!"
  echo "📊 Kong spans will now appear in traces when routing through http://localhost:8000"
else
  echo "❌ Kong Gateway routing test failed"
  echo "Response: $RESPONSE"
fi

echo ""
echo "🎯 To see Kong Gateway spans, use:"
echo "curl -X POST http://localhost:8000/api/payments -H 'Content-Type: application/json' -d '{\"amount\":2500,\"currency\":\"USD\",\"recipient\":\"kong@example.com\",\"description\":\"Kong Gateway Test\"}'"