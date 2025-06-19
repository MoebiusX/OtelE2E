#!/usr/bin/env tsx
// Start Kong Gateway as separate process
import { KongGateway } from './server/infrastructure/kong-gateway';

const gateway = new KongGateway();
gateway.start();