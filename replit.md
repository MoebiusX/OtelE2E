# OpenTelemetry Payment PoC - Authentic Instrumentation Only

## Core Principle
**AUTHENTIC OPENTELEMETRY ONLY - NO SIMULATION, NO FAKE DATA, NO SYNTHETIC SPANS**

## Overview

This is a full-stack web application demonstrating authentic OpenTelemetry instrumentation in an enterprise payment processing system. The application showcases real distributed tracing with genuine HTTP spans captured by OpenTelemetry's auto-instrumentation - exactly what production systems generate.

## System Architecture

The application follows clean architecture principles with clear separation of concerns:

**Frontend**: React-based SPA with TypeScript and shadcn/ui components
**Backend**: Express.js REST API with clean layered architecture
**Storage**: In-memory data store with full CRUD operations
**Tracing**: Pure OpenTelemetry auto-instrumentation for HTTP requests

### Optional External Services (Docker)
**Kong Gateway**: Real API Gateway for proxy spans (requires Docker setup)
**RabbitMQ**: Real AMQP message broker for queue spans (requires Docker setup)
**Jaeger**: Real trace collection and visualization (optional Docker setup)

## Clean Architecture Implementation

### Layer Structure
```
server/
├── api/                    # API Routes & Controllers
│   └── routes.ts          # Clean HTTP endpoint definitions
├── core/                  # Business Logic Layer
│   └── payment-service.ts # Payment processing service
├── services/               # External Service Clients
│   ├── kong-client.ts     # Kong Gateway proxy integration
│   └── rabbitmq-client.ts # RabbitMQ AMQP messaging
├── storage.ts             # Data persistence layer
└── otel.ts                # OpenTelemetry configuration
```

### Key Components

**API Layer**: Clean REST endpoints with proper error handling and validation
**Business Logic**: Payment processing with authentic trace generation
**External Services**: Real Kong Gateway and RabbitMQ clients (optional Docker setup)
**Storage**: In-memory data store with full CRUD operations
**OpenTelemetry**: Authentic auto-instrumentation for HTTP requests only

## Data Flow Options

### Core Flow (Always Available)
1. **Payment Submission**: User submits payment form in React frontend
2. **HTTP Request**: Payment data sent to Express backend
3. **OpenTelemetry**: Captures authentic HTTP spans automatically
4. **Storage**: Payment stored in in-memory data store
5. **Response**: Payment confirmation with trace information returned
6. **UI Updates**: Frontend refreshes payment list and trace visualization

### Extended Flow (With Docker Services)
1. **Kong Gateway**: Proxy requests through real Kong (authentic Kong spans)
2. **Express API**: Process payments with trace context propagation
3. **RabbitMQ**: Publish payment messages to real AMQP queue (authentic AMQP spans)
4. **Consumer**: Listen for messages and log to console (authentic consumer spans)
5. **Jaeger**: Collect and visualize all traces in real Jaeger UI

## Local Docker Environment

### Quick Setup
```bash
# Start all external services
docker-compose -f docker-compose.external.yml up -d

# Verify services are running
docker-compose -f docker-compose.external.yml ps
```

### Services Available
- **Kong Gateway**: http://localhost:8000 (proxy), http://localhost:8001 (admin)
- **RabbitMQ**: amqp://localhost:5672, http://localhost:15672 (management)
- **Jaeger**: http://localhost:16686 (traces UI)

### Environment Variables for External Services
```bash
KONG_GATEWAY_URL=http://localhost:8000
KONG_ADMIN_URL=http://localhost:8001
RABBITMQ_URL=amqp://admin:admin123@localhost:5672
JAEGER_ENDPOINT=http://localhost:4318/v1/traces
```

## Runtime Dependencies

### Core Application
- **@opentelemetry/sdk-node**: Core OpenTelemetry SDK for Node.js
- **@opentelemetry/auto-instrumentations-node**: Automatic HTTP instrumentation
- **@tanstack/react-query**: Data fetching and caching
- **@radix-ui/react-***: Headless UI components
- **react-hook-form**: Form state management with validation

### External Services Integration
- **http-proxy-middleware**: Kong Gateway proxy functionality
- **amqplib**: RabbitMQ AMQP messaging client
- **@types/amqplib**: TypeScript definitions for AMQP

### Development Tools
- **Vite**: Frontend build tool and dev server
- **TypeScript**: Type checking and compilation
- **Tailwind CSS**: Utility-first CSS framework
- **tsx**: TypeScript execution for development

## Deployment Strategy

### Replit Deployment
- **Development**: `npm run dev` starts both frontend and backend concurrently
- **Production**: Backend serves on port 5000 with static frontend assets
- **Storage**: In-memory data store (resets on restart)
- **Tracing**: Authentic OpenTelemetry HTTP auto-instrumentation only

### Local Development with Docker
- **External Services**: Use `docker-compose.external.yml` for Kong, RabbitMQ, Jaeger
- **Full Tracing**: Authentic spans from real Kong Gateway and AMQP message broker
- **Persistence**: RabbitMQ and Kong data persisted in Docker volumes

## Recent Changes

- June 20, 2025: **GRAFANA TEMPO & JAEGER INTEGRATION** - Added Grafana Tempo for trace storage with Jaeger UI visualization and Grafana dashboards
- June 20, 2025: **PROPER FLOW ENFORCEMENT** - Fixed CLIENT → KONG → BACKEND → JMS flow, all requests now route through Kong Gateway at localhost:8000  
- June 19, 2025: **EXTERNAL SERVICES INTEGRATION** - Added Docker Compose setup for real Kong Gateway and RabbitMQ with authentic OpenTelemetry spans
- June 19, 2025: **KONG GATEWAY PROXY** - Integrated Kong Gateway proxy with trace context propagation  
- June 19, 2025: **RABBITMQ MESSAGE QUEUE** - Added real AMQP message publishing and consumption with OpenTelemetry instrumentation
- June 19, 2025: **CLEAN ARCHITECTURE** - Established proper layer separation: API → Core → Services → Storage
- June 19, 2025: **AUTHENTIC HTTP SPANS ONLY** - System shows only genuine OpenTelemetry auto-instrumentation

## User Preferences

**CORE PRINCIPLE**: AUTHENTIC OPENTELEMETRY ONLY - NO SIMULATION, NO FAKE DATA, NO SYNTHETIC SPANS
Preferred communication style: Simple, everyday language.