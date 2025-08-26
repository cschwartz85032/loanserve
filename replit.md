# Overview

LoanServe Pro is a comprehensive enterprise mortgage loan servicing platform built with a modern full-stack architecture. The system manages the complete loan lifecycle including payment processing, escrow management, investor distributions, document management, and borrower communications. It features advanced document analysis capabilities using AI, real-time PDF processing, comprehensive audit trails, and a sophisticated permission system.

The platform is designed for scalability and regulatory compliance, supporting multiple loan types, complex investor ownership structures, and automated servicing workflows. It integrates with external banking services and provides both web-based interfaces and API endpoints for loan management operations.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **React/TypeScript SPA**: Built with Vite for development and production builds
- **UI Framework**: Shadcn/ui components with Radix UI primitives and Tailwind CSS
- **State Management**: TanStack Query for server state management and caching
- **Form Handling**: React Hook Form with Zod validation resolvers
- **PDF Rendering**: Custom PDF.js integration for document viewing with zoom, rotation, and multi-page support
- **File Upload**: React Dropzone for drag-and-drop file handling

## Backend Architecture
- **Express.js Server**: RESTful API with TypeScript, ESM modules
- **Database Layer**: 
  - PostgreSQL with Drizzle ORM for type-safe database operations
  - Neon serverless database provider (@neondatabase/serverless)
  - Schema-first approach with shared types between frontend and backend
- **Authentication**: Session-based authentication with custom session store
- **Document Processing**: 
  - PDF processing with pdf2pic for image conversion
  - AI document analysis using X.AI Grok API
  - Google Cloud Storage integration for file storage
- **Message Queue**: RabbitMQ integration with topology management for async processing
- **Observability**: OpenTelemetry instrumentation for tracing, metrics, and monitoring

## Database Design
- **Core Entities**: Users, loans, borrowers, properties, payments, escrow accounts
- **Document Management**: Hierarchical folder structure with file metadata and version tracking
- **Audit System**: Comprehensive event logging with user attribution and timestamps
- **Permission System**: Role-based access control (RBAC) with granular permissions
- **Financial Data**: Precise decimal handling for monetary calculations with proper scaling

## Document Management System
- **Hierarchical Organization**: Folder-based structure with parent-child relationships
- **File Processing**: Multi-format support (PDF, images, documents) with OCR capabilities
- **Version Control**: Document versioning with access logging
- **AI Analysis**: Automated document classification and data extraction
- **Secure Storage**: Cloud-based storage with hash verification and access controls

## Payment Processing Architecture
- **Multi-Channel Support**: ACH, wire transfers, checks, cards, and manual payments
- **Waterfall Allocation**: Configurable payment allocation rules (fees, interest, principal, escrow)
- **Investor Distributions**: Pro-rata calculations with precise rounding and audit trails
- **Escrow Management**: Automated disbursements with shortage detection and advance handling
- **Exception Handling**: Comprehensive error handling with retry mechanisms and manual intervention workflows

## Testing Strategy
- **Vitest Configuration**: Multiple test configurations for different scenarios
- **Database Testing**: Isolated test database setup with proper cleanup
- **Coverage Reporting**: Comprehensive test coverage with exclusions for generated code
- **Integration Testing**: Full-stack testing with real database transactions

# External Dependencies

## Core Infrastructure
- **Database**: Neon PostgreSQL serverless database
- **Cloud Storage**: Google Cloud Storage for document artifacts
- **Message Broker**: CloudAMQP (RabbitMQ as a Service)
- **CDN/Assets**: PDF.js worker from CDNJS

## AI/ML Services
- **Document Analysis**: X.AI Grok API for intelligent document processing and classification
- **OCR Processing**: Integrated PDF text extraction with fallback image processing

## Development Tools
- **Build System**: Vite with React plugin and TypeScript support
- **Code Quality**: ESLint, TypeScript compiler, Prettier (implied)
- **Database Migrations**: Drizzle Kit for schema management
- **Process Management**: TSX for development server with hot reload

## Monitoring and Observability
- **Telemetry**: OpenTelemetry SDK with multiple exporters (Jaeger, Prometheus, OTLP)
- **Logging**: Structured logging with request/response tracking
- **Health Checks**: Application health monitoring endpoints
- **Error Tracking**: Custom error handling with detailed logging

## Security and Compliance
- **Session Management**: Custom session store with PostgreSQL persistence
- **Rate Limiting**: Built-in rate limiting for API endpoints
- **Data Validation**: Comprehensive input validation and sanitization
- **Audit Trails**: Complete activity logging for regulatory compliance