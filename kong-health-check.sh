#!/bin/bash

echo "Checking Kong Gateway health..."

# Check if Kong Gateway is accessible
if curl -s -f http://localhost:8001/status > /dev/null 2>&1; then
    echo "Kong Gateway is running"
    
    # Configure Kong Gateway
    echo "Configuring Kong Gateway for payment API..."
    
    # Delete existing service if present
    curl -s -X DELETE http://localhost:8001/services/payment-api > /dev/null 2>&1
    
    # Create service
    curl -s -X POST http://localhost:8001/services/ \
      -d "name=payment-api" \
      -d "url=http://host.docker.internal:5000" \
      -d "connect_timeout=60000" \
      -d "write_timeout=60000" \
      -d "read_timeout=60000"
    
    # Create route
    curl -s -X POST http://localhost:8001/services/payment-api/routes \
      -d "paths[]=/api" \
      -d "strip_path=false" \
      -d "preserve_host=false"
    
    # Add CORS plugin
    curl -s -X POST http://localhost:8001/services/payment-api/plugins \
      -d "name=cors" \
      -d "config.origins=*" \
      -d "config.methods=GET,POST,PUT,DELETE,OPTIONS" \
      -d "config.headers=Accept,Accept-Version,Content-Length,Content-MD5,Content-Type,Date,X-Auth-Token,x-trace-id,x-span-id,traceparent" \
      -d "config.credentials=true" \
      -d "config.max_age=3600"
    
    # Test the configuration
    echo "Testing Kong Gateway routing..."
    if curl -s -f http://localhost:8000/api/payments > /dev/null 2>&1; then
        echo "Kong Gateway configuration successful!"
        echo "Frontend should now route through Kong Gateway at localhost:8000"
    else
        echo "Kong Gateway routing test failed"
    fi
else
    echo "Kong Gateway is not accessible at localhost:8001"
    echo "Make sure Docker services are running: docker-compose -f docker-compose.external.yml up -d"
fi