#!/bin/bash
# Start Kong Gateway as separate process
echo "🦍 Starting Kong Gateway on port 3001..."
tsx server/kong-gateway.ts