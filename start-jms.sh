#!/bin/bash
# Start JMS Message Broker as separate process
echo "🚀 Starting JMS Message Broker on port 5672..."
tsx server/jms-broker.ts