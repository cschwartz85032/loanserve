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

## Recent Fixes (August 22, 2025)

### Critical Production Sessions Table Fix
Fixed production deployment error where sessions table had wrong schema:
- **Issue**: Production sessions table was missing required express-session columns (sid, sess, expire)
- **Solution**: Created proper express-session compatible table structure with sid as primary key
- **Migration**: Old sessions table renamed to sessions_old, new table created with correct schema
- **Impact**: Resolved "column sid does not exist" errors in production deployment

### Payment Breakdown UI Improvements
Enhanced payment breakdown display for better clarity:
- **Separated Principal and Interest**: Now shown as distinct line items instead of combined
- **Zero-Value Hiding**: Lines with zero values are automatically hidden
- **Complete Fee Display**: Added HOA, PMI, Servicing Fee, and Other fees when present

### Critical Database Transaction Fixes
Implemented proper database transactions for multi-table operations to ensure data integrity:
- **Loan Creation Transaction**: Now atomically creates loan, initial escrow account (if needed), and initial ledger entry. All succeed or rollback together.
- **Loan Deletion Transaction**: All related records (documents, borrowers, payments, escrow, ledger entries, fees) are now deleted atomically. No more orphaned records on partial failure.
- **Escrow Disbursement Transaction**: Payment recording, ledger entry creation, and escrow balance updates now happen atomically to prevent inconsistent states.

### Critical Authentication & Session Fixes
Fixed critical issues identified in code analysis:
- **Session Authentication Fix**: Updated `/api/user` endpoint to check both `req.user?.id` (Passport) and `req.session.userId` (new auth) to prevent 401 errors
- **User Deletion Cache Fix**: Modified delete mutation to properly invalidate all user list query variations with `exact: false` and added cache-busting headers
- **Date Timezone Fixes**: Fixed prepayment expiration date display using `parseISO` to prevent timezone shifting (1/1/1929 showing as 12/31/1928)
- **Loan Table Date Display**: Updated `formatDate` function to use UTC methods to avoid timezone conversion

### Known Issues to Address
- **Session userId Type Mismatch**: sessions.userId is varchar(255) but users.id is integer - requires migration to fix
- **Permission Resolution**: role_permissions table structure is correct, contrary to initial analysis

## Recent Achievements (August 21, 2025)

### Database Performance Optimization
Created 28 missing database indexes for significant performance improvements:
- **Foreign Key Indexes**: Added indexes on all foreign key columns (loans.investor_id, loans.lender_id, payments.processed_by, etc.)
- **Composite Indexes**: Created multi-column indexes for frequently joined queries (loan_id + date combinations)
- **Query Optimization**: Added indexes on commonly filtered columns (status, loan_number, maturity_date)
- **Statistics Updated**: Ran ANALYZE on key tables to update query planner statistics
- **Expected Improvements**: 50-90% faster query performance for loan searches, payment history, document listing, and permission checks

### Rate Limiter Memory Management Fix
Fixed memory leak in rate limiting system:
- **Auto-cleanup**: Rate limiter now automatically cleans up during request processing (every 30 seconds or when bucket count exceeds 10,000)
- **Hard Limit**: Enforced maximum of 10,000 buckets to prevent unbounded memory growth
- **Improved Cleanup**: Extended expiry to 2x window for safety, forcefully removes oldest entries when limit exceeded
- **Process Handling**: Added proper SIGINT/SIGTERM handlers to clear cleanup intervals on exit
- **Monitoring**: Added getBucketCount() method and periodic logging for memory monitoring

## Previous Achievements (August 21, 2025)

### Data Governance & Migration System
Implemented proper forward-only, idempotent database migration system:
- **Migration Runner**: Replaced placeholder with actual migration executor using drizzle-orm migrate
- **Migration Tracking**: Added `__drizzle_migrations` table to track applied migrations
- **Environment Coverage**: Migrations now run in both development and production for consistency
- **Table Verification**: Added post-migration verification of critical tables
- **Manual Migration Tool**: Created `run-migrations.cjs` for immediate migration testing
- **Audit Tables Active**: Confirmed all audit tables are actively used:
  - `auth_events` - logs authentication events
  - `login_attempts` - tracks failed login attempts
  - `user_ip_allowlist` - manages IP allowlist functionality
  - `system_settings` - stores system configuration

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