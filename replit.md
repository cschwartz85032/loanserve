# Overview

LoanServe Pro is a comprehensive mortgage loan servicing platform built with React and Express.js. It offers a full-featured loan portfolio management system for lenders, borrowers, investors, escrow officers, and legal professionals. The platform provides complete loan lifecycle management, including origination tracking, payment processing, document management, escrow account handling, compliance monitoring, comprehensive reporting, and investor management with ownership percentage tracking. A key capability is AI-powered document analysis for automated loan creation and data extraction from financial documents. The system also includes a robust Daily Servicing Cycle feature for automated loan processing, interest accrual, payment matching, fee assessment, and investor distribution calculations, designed for auditability and detailed logging.

# User Preferences

Preferred communication style: Simple, everyday language.

When encountering database or field-related errors:
1. **Check production database schema FIRST** - compare columns with development
2. **Look for patterns** - intermittent failures usually mean data-dependent issues
3. **Trust user instincts** - when user says "something else must be wrong", reconsider approach
4. **Use diagnostic scripts** - run `node debug-db-schema.cjs [table] [search]` to quickly check columns
5. **Avoid overcomplicating** - check simple causes (duplicate columns, mismatched schemas) before complex theories (build issues, caching)

# System Architecture

## UI/UX Decisions
The application features a modern, component-based UI designed for clarity and ease of use. Key UI/UX decisions include tab-based navigation for logical information grouping, a strict principle of displaying extracted or user-corrected data without assumed calculations, comprehensive contact management for all parties, and a detailed investor management system with ownership percentages and banking information. A dedicated fee management system, integrated PDF viewer, and a unified loan creation dialog supporting both AI analysis and manual entry are also core to the UI/UX. The Admin panel features a collapsible sidebar navigation for managing documents, escrow, users, and settings. The Settings page includes a three-tab interface for Security, Templates (email templates with rich text editor and merge fields), and Auto Notice (Word document templates for automated notices).

## Technical Implementations

### Frontend
- **Framework**: React 18 with TypeScript
- **UI Framework**: Radix UI components with shadcn/ui
- **State Management**: TanStack React Query
- **Routing**: Wouter
- **Styling**: Tailwind CSS
- **Forms**: React Hook Form with Zod validation
- **Authentication**: Context-based system

### Backend
- **Framework**: Express.js with TypeScript (RESTful API)
- **Authentication**: Passport.js with local strategy and session-based authentication
- **Validation**: Shared Zod schemas

### Database Layer
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Schema Management**: Drizzle Kit
- **Migration System**: Forward-only, idempotent database migration system using `drizzle-orm migrate` for consistency across environments. Includes audit tables (`auth_events`, `login_attempts`, `user_ip_allowlist`, `system_settings`).
- **Performance Optimization**: Extensive indexing on foreign keys and frequently queried columns for improved query performance.

### AI Integration
- **Document Analysis**: Utilizes Grok AI for extracting granular loan data from PDFs (e.g., borrower details, loan amounts, dates, trustee/beneficiary info, credit scores, escrow company details, servicing settings, address components, prepayment expiration dates).
- **Data Flow**: Extracted data populates loan creation forms and the database.
- **Error Handling**: Robust handling of AI responses, including streaming JSON and warnings against placeholder data.
- **Document Linking**: AI-uploaded documents are stored and linked to loans.

### File Upload and Storage
- **File Upload Interface**: Uppy.js for drag-and-drop.
- **File Storage**: Scalable cloud storage for documents.

### User Management System
An enterprise user management subsystem with Role-Based Access Control (RBAC), supporting predefined roles (admin, lender, borrower, investor, escrow_officer, legal, servicer) and granular permission levels (none, read, write, admin) across various resources. The system uses a **SINGLE ROLE SYSTEM** via `roles` and `user_roles` tables; the `users.role` enum field is deprecated. All role IDs are UUIDs. Features include a robust password policy, account lockout, non-restrictive IP tracking, and secure invitation/password reset flows. All actions are auditable.

### System Design Choices
- **Database Transactions**: Multi-table operations (loan creation, loan deletion, escrow disbursement) are managed atomically using database transactions to ensure data integrity.
- **Session Management**: Enhanced session tracking for audit logging, properly tracking user_id, ip, and user_agent.
- **Rate Limiting**: Implemented with auto-cleanup and a hard limit to prevent memory leaks.
- **Payment Breakdown Display**: Principal and Interest are shown as distinct line items; zero-value lines are hidden; all fees (HOA, PMI, Servicing Fee, Other) are displayed when present.
- **Date Handling**: Consistent use of UTC methods and `parseISO` to prevent timezone issues in date displays.

# External Dependencies

## Database Services
- **Neon Database**: Serverless PostgreSQL.
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
- **pdfjs-dist**: PDF rendering.
- **pdf2pic**: PDF page to image conversion.

## Development Tools
- **Vite**: Build tool and development server.