# Overview

LoanServe Pro is a comprehensive mortgage loan servicing platform built with React and Express.js. The application provides a full-featured loan portfolio management system designed for lenders, borrowers, investors, escrow officers, and legal professionals. It offers complete loan lifecycle management including origination tracking, payment processing, document management, escrow account handling, compliance monitoring, and comprehensive reporting capabilities.

## Recent Changes (August 8, 2025)

**Document Management System - COMPLETED**
- Redesigned document management to use inline two-column layout instead of modal popups
- Left column: document list with search and filters, Right column: document viewer
- **PROFESSIONAL DOCUMENT VIEWING:**
  - PDFs display using iframe with fallback to professional interface due to browser security restrictions
  - Images display directly inline using img tags with error handling
  - Text files display inline using iframe elements  
  - Office documents use object/embed with proper fallback handling
- All document types show appropriate content or professional interface in the viewer panel
- Added elegant PDF viewer with clear "Open PDF" and "Download" buttons
- Professional user experience that handles browser limitations gracefully
- Added proper close functionality and maintained all existing features (upload, download, delete)
- Clean, minimalist design matching reference implementation

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
The client-side application is built with React 18 using TypeScript, featuring a modern component-based architecture:

- **UI Framework**: Uses Radix UI components with shadcn/ui for consistent, accessible interface elements
- **State Management**: TanStack React Query for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Styling**: Tailwind CSS with custom design system variables for theming
- **Forms**: React Hook Form with Zod validation schemas
- **Authentication**: Context-based auth system with protected routes

## Backend Architecture
The server follows a RESTful API design pattern built on Express.js:

- **Framework**: Express.js with TypeScript for type safety
- **Authentication**: Passport.js with local strategy using session-based authentication
- **Session Management**: Express sessions with PostgreSQL session store
- **API Structure**: Modular route handlers organized by feature domains (loans, payments, documents, escrow)
- **Validation**: Shared Zod schemas between client and server for consistent data validation

## Database Layer
The application uses PostgreSQL with Drizzle ORM for type-safe database operations:

- **ORM**: Drizzle ORM with Neon serverless PostgreSQL connection
- **Schema Management**: Centralized schema definitions with TypeScript types
- **Migrations**: Drizzle Kit for database schema migrations
- **Connection**: Neon serverless PostgreSQL with WebSocket support

The database schema includes comprehensive entities for:
- Users with role-based access (lender, borrower, investor, escrow_officer, legal)
- Loans with detailed property and financial information
- Payment processing and tracking
- Escrow accounts and scheduled payments
- Document management with categorization
- Audit logging for compliance
- Notification system

## File Upload and Storage
Document management capabilities are built with multiple storage options:

- **Cloud Storage**: Google Cloud Storage integration for scalable file storage
- **Upload Interface**: Uppy.js with drag-and-drop, progress tracking, and AWS S3 compatibility
- **File Processing**: Multi-format document support with metadata extraction

## Development and Build System
The project uses a modern build toolchain optimized for both development and production:

- **Build Tool**: Vite for fast development and optimized production builds
- **Development Server**: Hot module replacement with error overlay
- **TypeScript**: Full TypeScript support with strict configuration
- **Code Quality**: ESLint and Prettier integration (implied by project structure)
- **Deployment**: Single-command build process creating both client and server bundles

# External Dependencies

## Database Services
- **Neon Database**: Serverless PostgreSQL database with automatic scaling and WebSocket support
- **Drizzle Kit**: Database migration and schema management tooling

## Authentication and Security
- **Passport.js**: Authentication middleware with local strategy support
- **Express Session**: Session management with PostgreSQL store persistence

## Cloud Storage
- **Google Cloud Storage**: Primary file storage for documents and attachments
- **Uppy.js**: Advanced file upload interface with cloud storage integration

## UI and Component Libraries
- **Radix UI**: Accessible, unstyled UI primitives for complex components
- **Tailwind CSS**: Utility-first CSS framework with custom design tokens
- **Lucide React**: Consistent icon library for interface elements

## Development Tools
- **Vite**: Modern build tool with development server and hot reload
- **Replit Integration**: Development environment optimization with cartographer and error handling