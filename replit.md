# Overview

LoanServe Pro is a comprehensive mortgage loan servicing platform built with React and Express.js. It offers a full-featured loan portfolio management system for lenders, borrowers, investors, escrow officers, and legal professionals. The platform provides complete loan lifecycle management, including origination tracking, payment processing, document management, escrow account handling, compliance monitoring, comprehensive reporting, and investor management with ownership percentage tracking. A key capability is AI-powered document analysis for automated loan creation and data extraction from financial documents. The system also includes a robust Daily Servicing Cycle feature for automated loan processing, interest accrual, payment matching, fee assessment, and investor distribution calculations, designed for auditability and detailed logging.

# User Preferences

Preferred communication style: Simple, everyday language.

## Debugging Protocol
When encountering database or field-related errors:
1. **Check production database schema FIRST** - compare columns with development
2. **Look for patterns** - intermittent failures usually mean data-dependent issues
3. **Trust user instincts** - when user says "something else must be wrong", reconsider approach
4. **Use diagnostic scripts** - run `node debug-db-schema.cjs [table] [search]` to quickly check columns
5. **Avoid overcomplicating** - check simple causes (duplicate columns, mismatched schemas) before complex theories (build issues, caching)

## Critical Architecture Decisions
### Role Management System (August 21, 2025)
- **SINGLE ROLE SYSTEM**: Application uses RBAC (Role-Based Access Control) exclusively via `roles` and `user_roles` tables
- **NO ENUM ROLES**: The `users.role` enum field is deprecated and must NOT be used for authorization
- **UUID ROLE IDS**: All role IDs are UUIDs (strings), never integers
- **Policy Engine**: Updated to check RBAC roles only, not the legacy enum field
- The system has 7 predefined roles: admin, lender, borrower, investor, escrow_officer, legal, servicer

## Recent Achievements (August 21, 2025)

### Dual Role System Elimination
Successfully consolidated to single RBAC system:
- **Policy Engine**: Now uses ONLY the RBAC roles/user_roles tables, ignoring legacy users.role enum
- **Auth Service**: Removed default enum role assignments for new users
- **Type Safety**: Confirmed all roleId values are correctly handled as UUID strings, not integers
- **Consistent Authorization**: All permission checks now flow through the unified RBAC system

### Session Management & IP Allowlist Fix
Fixed critical database schema mismatches:
- **Sessions Table**: Now properly tracks user_id, ip, and user_agent for audit logging
- **IP Allowlist**: Fixed to populate required ipAddress field alongside optional cidr field
- **Field Removals**: Eliminated all references to non-existent assignedAt/assignedBy fields
- **Custom Session Store**: Properly integrates with enhanced session tracking

### Permission & Role System Comprehensive Fix
Fixed critical mismatches between database schema and application code:
- **role_permissions table**: Fixed to use denormalized structure (resource and permission stored directly, not as foreign keys)
- **userRoles table**: Removed non-existent assignedAt/assignedBy columns, using created_at/updated_at instead
- **sessions table**: Aligned with express-session structure (sid, sess, expire columns)
- **userIpAllowlist table**: Fixed column names (ip_address required, cidr optional, description instead of label)
- **Policy Engine**: Updated queries to work with denormalized role_permissions structure
- **Admin Routes**: Fixed all permission queries to match actual database structure

## Previous Achievements (August 20, 2025)
Successfully implemented and tested user activation flow:
- Fixed authentication event type constraints (changed 'account_activated' to 'user_updated')
- Resolved status field database schema mismatch issues
- Implemented proper token validation without consuming tokens during validation checks
- Successfully activated invited user with username 'loanserve' (Corey Schwartz)

# System Architecture

## UI/UX Decisions
The application features a modern, component-based UI designed for clarity and ease of use. Key UI/UX decisions include tab-based navigation for logical information grouping, a strict principle of displaying extracted or user-corrected data without assumed calculations, comprehensive contact management for all parties, and a detailed investor management system with ownership percentages and banking information. A dedicated fee management system, integrated PDF viewer, and a unified loan creation dialog supporting both AI analysis and manual entry are also core to the UI/UX. The Admin panel features a collapsible sidebar navigation for managing documents, escrow, users, and settings.

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

### AI Integration
- **Document Analysis**: Utilizes Grok AI for extracting loan data from PDFs (e.g., borrower details, loan amounts, dates, trustee/beneficiary info, credit scores, escrow company details, servicing settings).
- **Granular Extraction**: Configured for detailed extraction of address components and prepayment expiration dates.
- **Data Flow**: Extracted data populates loan creation forms and the database.
- **Error Handling**: Robust handling of AI responses, including streaming JSON and warnings against placeholder data.
- **Document Linking**: AI-uploaded documents are stored and linked to loans.

### File Upload and Storage
- **File Upload Interface**: Uppy.js for drag-and-drop.
- **File Storage**: Scalable cloud storage for documents.

## User Management System
An enterprise user management subsystem with role-based access control, living under Admin -> Users. It supports defined roles (admin, title, legal, lender, borrower, investor, regulator) with granular permission levels (none, read, write, admin) across various resources (Users, Loans, Payments, Escrow, Investor Positions, Reports, Settings, Audit Logs). Features include a robust password policy, account lockout, non-restrictive IP tracking (allows login from any IP while maintaining audit trail of trusted IPs), and secure invitation/password reset flows. All actions are auditable.

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