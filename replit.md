# Overview

LoanServe Pro is a comprehensive mortgage loan servicing platform built with React and Express.js. It provides a full-featured loan portfolio management system for lenders, borrowers, investors, escrow officers, and legal professionals. The platform offers complete loan lifecycle management, including origination tracking, payment processing, document management, escrow account handling, compliance monitoring, comprehensive reporting capabilities, and investor management with ownership percentage tracking. A key capability is AI-powered document analysis for automated loan creation and data extraction from financial documents.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## UI/UX Decisions
The application features a modern, component-based UI designed for clarity and ease of use. Key UI/UX decisions include:
- **Tab-based Navigation**: Logical grouping of information with 7 tabs: Edit Loan Details, Contacts, Beneficiaries, Investors, Documents, Accounting, Audit Trail. Beneficiary and Investor information have dedicated tabs for improved organization.
- **Data Display Principle**: System must display exactly what was extracted from loan documents or user corrections; no assumed calculations. This is particularly critical for financial data like loan payments.
- **Comprehensive Contact Management**: All contacts (borrower, trustee, beneficiary) include both individual and company names, phone, email, and full street addresses.
- **Investor Management**: Comprehensive investor tracking with ownership percentages, banking information (bank name/address, account/routing numbers), and entity types. Visual validation shows green at 100% ownership, flashing red when incorrect. Each investor has unique ID and supports add/edit/delete operations.
- **Fee Management System**: Dedicated module with templates, tracking (paid/unpaid/waived), and categorization for various loan fees.
- **Document Viewer**: Integrated PDF viewer with canvas rendering for inline viewing, zoom, rotation, and reset controls. AI extraction data is displayed alongside documents for review.
- **Unified Loan Creation Dialog**: Supports both AI document analysis (drag-and-drop) and manual entry, with real-time status and auto-population of fields.

## Technical Implementations

### Frontend
- **Framework**: React 18 with TypeScript
- **UI Framework**: Radix UI components with shadcn/ui
- **State Management**: TanStack React Query
- **Routing**: Wouter
- **Styling**: Tailwind CSS with custom design system variables
- **Forms**: React Hook Form with Zod validation schemas
- **Authentication**: Context-based system with protected routes

### Backend
- **Framework**: Express.js with TypeScript, following RESTful API design.
- **Authentication**: Passport.js with local strategy and session-based authentication using Express sessions and PostgreSQL session store.
- **API Structure**: Modular route handlers by feature domain (loans, payments, documents, escrow).
- **Validation**: Shared Zod schemas for consistent client/server data validation.

### Database Layer
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM for type-safe operations
- **Schema Management**: Drizzle Kit for migrations and centralized TypeScript schema definitions.

### AI Integration
- **Document Analysis**: Utilizes Grok AI (with fallback to `grok-4-0709`, `grok-3`, `grok-2-1212`) for extracting real loan data from PDFs (e.g., borrower names, addresses, loan amounts, dates, trustee/beneficiary info).
- **Granular Extraction**: AI is configured for detailed extraction of address components (street, city, state, zip) and distinguishes between borrower mailing and property addresses. It also extracts prepayment expiration dates.
- **Data Flow**: Extracted data seamlessly populates loan creation forms and the database.
- **Error Handling**: Robust handling of AI responses, including streaming JSON and explicit warnings against placeholder data.
- **Document Linking**: AI-uploaded documents are automatically stored and linked to loans.

### File Upload and Storage
- **File Upload Interface**: Uppy.js for drag-and-drop with progress tracking.
- **File Storage**: Scalable cloud storage for documents.
- **File Processing**: Multi-format document support with metadata extraction.

# External Dependencies

## Database Services
- **Neon Database**: Serverless PostgreSQL database.
- **Drizzle Kit**: Database migration and schema management.

## Authentication and Security
- **Passport.js**: Authentication middleware.
- **Express Session**: Session management.

## Cloud Storage
- **Google Cloud Storage**: Primary file storage.
- **Uppy.js**: File upload interface.

## AI Services
- **Grok AI (via Groq API)**: Core AI engine for document analysis.

## UI and Component Libraries
- **Radix UI**: Accessible UI primitives.
- **Tailwind CSS**: Utility-first CSS framework.
- **Lucide React**: Icon library.
- **pdfjs-dist**: PDF rendering in the browser.
- **pdf2pic**: PDF page to image conversion.

## Development Tools
- **Vite**: Build tool and development server.