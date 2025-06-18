# OpenTelemetry Payment Demo - Context Propagation

## Overview

This is a full-stack web application demonstrating OpenTelemetry context propagation in a payment processing system. The application showcases distributed tracing across a React frontend and Node.js backend, with visual trace monitoring and real-time payment processing simulation.

## System Architecture

The application follows a modern full-stack architecture with clear separation between frontend and backend concerns:

**Frontend**: React-based single-page application with TypeScript
**Backend**: Express.js REST API with TypeScript
**Storage**: In-memory demonstration data (no database required)
**UI Framework**: shadcn/ui components with Tailwind CSS
**Tracing**: OpenTelemetry instrumentation with Jaeger backend integration

## Key Components

### Frontend Architecture
- **React 18** with TypeScript for type safety
- **Vite** as the build tool and development server
- **TanStack Query** for API state management and caching
- **wouter** for lightweight client-side routing
- **shadcn/ui** component library with Radix UI primitives
- **Tailwind CSS** for styling with custom OpenTelemetry-themed colors

### Backend Architecture
- **Express.js** server with TypeScript
- **OpenTelemetry SDK** with auto-instrumentation for Node.js
- **Drizzle ORM** for database operations with PostgreSQL
- **Custom tracing utilities** for span creation and context propagation
- **Memory storage fallback** for development without database

### Database Schema
- **users**: User authentication (id, username, password)
- **payments**: Payment records with trace correlation (amount, currency, recipient, status, traceId, spanId)
- **traces**: Distributed trace metadata (traceId, rootSpanId, status, duration)
- **spans**: Individual span records (traceId, spanId, parentSpanId, operationName, serviceName, duration, tags)

### Tracing Implementation
- **Automatic instrumentation** for HTTP requests, database queries, and system calls
- **Custom span creation** for business logic operations
- **Context propagation** via HTTP headers (traceparent, tracestate)
- **Trace correlation** between frontend actions and backend operations
- **Visual trace representation** in the UI with service-specific icons and colors

## Data Flow

1. **Payment Submission**: User submits payment form in React frontend
2. **Trace Generation**: Frontend generates trace ID and span ID for request correlation
3. **HTTP Request**: Payment data sent to backend with tracing headers
4. **Span Creation**: Backend creates root span and child spans for operations
5. **Database Operations**: Payment, trace, and span records stored in PostgreSQL
6. **Response**: Payment confirmation returned with trace information
7. **UI Updates**: Frontend refreshes payment list and trace visualization
8. **Real-time Monitoring**: Automatic polling for updated traces and system metrics

## External Dependencies

### Runtime Dependencies
- **@opentelemetry/sdk-node**: Core OpenTelemetry SDK for Node.js
- **@opentelemetry/auto-instrumentations-node**: Automatic instrumentation
- **@neondatabase/serverless**: PostgreSQL driver for serverless environments
- **drizzle-orm**: TypeScript ORM for database operations
- **@tanstack/react-query**: Data fetching and caching
- **@radix-ui/react-***: Headless UI components
- **react-hook-form**: Form state management with validation

### Development Dependencies
- **Vite**: Frontend build tool and dev server
- **TypeScript**: Type checking and compilation
- **Tailwind CSS**: Utility-first CSS framework
- **drizzle-kit**: Database migration and schema management
- **tsx**: TypeScript execution for development

## Deployment Strategy

The application is configured for deployment on Replit with the following setup:

- **Development**: `npm run dev` starts both frontend and backend concurrently
- **Production Build**: `npm run build` compiles frontend and bundles backend
- **Production Server**: `npm run start` runs the compiled application
- **Database**: PostgreSQL module enabled in Replit configuration
- **Auto-scaling**: Configured for automatic scaling based on demand
- **Port Configuration**: Backend serves on port 5000, mapped to external port 80

### Environment Requirements
- **NODE_ENV**: Set to "development" or "production"
- **DATABASE_URL**: PostgreSQL connection string (required for database operations)
- **REPL_ID**: Replit environment identifier (enables development features)

## Changelog
- June 18, 2025: Added client-side span creation toggle to demonstrate Kong Gateway context injection
- June 18, 2025: Integrated Jaeger as trace backend with OpenTelemetry SDK configuration  
- June 18, 2025: Fixed Recent Payments ordering to show newest submissions first
- June 18, 2025: Removed Grafana Tempo integration, System Metrics, and Solace Queue Monitor components
- June 18, 2025: Enhanced with comprehensive JMS queue simulation using Solace message broker patterns
- June 18, 2025: Added real-time queue monitoring dashboard with message processing visualization
- June 18, 2025: Implemented multi-service trace propagation through payment processing pipeline
- June 18, 2025: Complete OpenTelemetry context propagation demonstration operational with built-in trace visualization
- June 18, 2025: Successfully implemented real Kong Gateway functionality with Admin API, plugin system, and request routing
- June 18, 2025: Kong Gateway now intercepts /kong/* routes with proper headers, rate limiting, CORS, and OpenTelemetry integration
- June 18, 2025: Enhanced trace visualization with meaningful span operation names showing complete payment journey
- June 18, 2025: Fixed trace ordering to display most recent traces first with automatic refresh functionality
- June 18, 2025: Resolved frontend query key issue preventing span data display - trace visualization now shows meaningful operation names
- June 18, 2025: Made OpenTelemetry configuration optional with Kong Gateway context injection for upstream systems without tracing
- June 18, 2025: Comprehensive OpenTelemetry context propagation demonstration fully operational with enterprise-grade tracing

## User Preferences

Preferred communication style: Simple, everyday language.