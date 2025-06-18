#!/bin/bash

# Quick OpenTelemetry PoC Test - Essential validation only
# Use this for rapid testing during development

BASE_URL="http://localhost:5000"

echo "OpenTelemetry PoC - Quick Test"
echo "==============================="

# Basic health check
echo -n "Server health: "
if curl -s "$BASE_URL" > /dev/null; then
    echo "✓ OK"
else
    echo "✗ FAILED - Server not responding"
    exit 1
fi

# Context injection test
echo -n "Kong context injection: "
response=$(curl -s -X POST "$BASE_URL/api/payments" \
    -H "Content-Type: application/json" \
    -d '{"amount": 10000, "currency": "USD", "recipient": "quick-test@example.com"}')

if echo "$response" | grep -q '"traceId"'; then
    echo "✓ OK"
else
    echo "✗ FAILED - No trace ID in response"
fi

# Trace data verification
echo -n "Distributed tracing: "
sleep 1
traces=$(curl -s "$BASE_URL/api/traces")
if echo "$traces" | grep -q "Kong" && echo "$traces" | grep -q "Solace"; then
    echo "✓ OK - Kong and Solace spans found"
else
    echo "✗ FAILED - Missing expected spans"
fi

# Client header test
echo -n "Trace continuation: "
response=$(curl -s -X POST "$BASE_URL/api/payments" \
    -H "Content-Type: application/json" \
    -H "x-trace-id: test-trace-123" \
    -H "x-span-id: test-span-456" \
    -d '{"amount": 15000, "currency": "EUR", "recipient": "continuation-test@example.com"}')

if echo "$response" | grep -q "test-trace-123"; then
    echo "✓ OK - Client trace ID preserved"
else
    echo "✗ FAILED - Client trace ID not preserved"
fi

echo ""
echo "Quick test complete. Run ./run-tests.sh for comprehensive validation."