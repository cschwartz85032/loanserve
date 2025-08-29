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

# Recent Database Changes (January 2025)

## Completed Database Remediation Steps

### Added Double-Entry Ledger Tables
- `general_ledger_events` - Transaction headers with event tracking
- `general_ledger_entries` - Double-entry line items with BIGINT minor units
- Replaces single-entry `loan_ledger` with proper accounting

### Added Missing Core Tables
- `loan_terms` - Time-bounded loan pricing and structural terms
- `loan_balances` - Fast snapshot table for dashboard queries  
- `escrow_forecasts` - Deterministic monthly projections

### Added Banking/Cash Management Tables
- `bank_accounts` - Financial institution accounts
- `bank_txn` - Imported bank transactions (canonical, replaces bank_transactions)
- `bank_statement_files` - Track imported statements with deduplication
- `ach_batch`, `ach_entry`, `ach_returns` - ACH transaction management
- `cash_match_candidates`, `recon_exceptions` - Reconciliation support

### Key Principles Applied
- All monetary values stored as BIGINT in minor units (cents)
- Proper double-entry accounting with invariant checks
- Append-only audit trail
- UUID primary keys for new financial tables

### Queue Versioning Strategy
- Implemented versioned queues (.v2 suffix) to avoid CloudAMQP conflicts
- Updated consumers to use new queue names (q.forecast.v2, q.schedule.disbursement.v2)
- Created safe channel operations to prevent topology failures

### Existing Tables Preserved
- `audit_logs` (not audit_log) - Current audit system retained
- `escrow_analysis`, `investor_positions`, `remittance_cycle` - Already exist in DB
- Existing ID columns unchanged to avoid breaking migrations

## Critical Ledger Integrity Remediation (August 2025)

### Problem Identified
- Some CRM and escrow operations bypassed double-entry ledger system
- Direct balance updates violated accounting integrity principles
- Inconsistent audit logging for monetary operations
- Mix of decimal and minor unit handling

### Solution Implemented

#### 1. Ledger-Only Operations Service
- **Created**: `server/services/ledger-only-operations.ts`
- **Purpose**: Enforces ALL monetary effects go through ledger exclusively
- **Features**: 
  - Prohibits direct balance updates
  - Automatic audit logging with correlation IDs
  - Derived balance calculations from ledger entries only
  - Support for escrow disbursements, payment allocations, fee assessments

#### 2. Enhanced Audit Compliance
- **Updated**: `server/domain/posting.ts` - Added automatic audit logging to every `postEvent`
- **Added**: `ACCOUNTING.*` event types to compliance audit taxonomy
- **Ensures**: Every ledger operation has corresponding audit trail for Phase 9 compliance

#### 3. Direct Balance Update Elimination
- **Fixed**: `server/escrow/disbursement-service.ts` - Removed direct `escrow_accounts.balance` updates
- **Principle**: Balance fields are now derived views only, never directly written
- **Impact**: Maintains double-entry integrity for all escrow operations

#### 4. Database Constraints and Triggers
- **Added**: `server/db/ledger-constraints.sql`
- **Enforces**: 
  - `SUM(debit_minor) = SUM(credit_minor)` for each event
  - No negative amounts in ledger entries
  - Unique correlation IDs across events
  - Monitoring triggers for direct balance update attempts

#### 5. Comprehensive Testing
- **Created**: `server/test/ledger-integrity.test.ts`
- **Tests**: Golden loan scenarios with balanced ledger verification
- **Validates**: Payment allocations, escrow disbursements, constraint enforcement

### Compliance Impact
- **Phase 9 Audit Ready**: All monetary operations have complete audit trails
- **Regulatory Compliance**: Proper double-entry accounting with invariant enforcement  
- **Data Integrity**: Eliminates balance drift and ensures ledger consistency
- **Tamper Evidence**: All financial mutations trackable via correlation IDs