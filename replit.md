# Overview

LoanServe Pro is a comprehensive mortgage loan servicing platform built with React and Express.js. It provides a full-featured loan portfolio management system for lenders, borrowers, investors, escrow officers, and legal professionals. The platform offers complete loan lifecycle management, including origination tracking, payment processing, document management, escrow account handling, compliance monitoring, comprehensive reporting capabilities, and investor management with ownership percentage tracking. A key capability is AI-powered document analysis for automated loan creation and data extraction from financial documents.

## Recent Changes (January 2025 - Latest: January 23, 2025)
- Added dedicated Escrows tab to loan edit interface with comprehensive escrow account management
- Fixed fee dropdown to display all 33 configured fees from fee management schedule instead of limited loan-specific fees
- Added escrow number field to escrow company section with database schema update
- Implemented fee selection dropdown in accounting transactions - when transaction type is "fee", users can select from the loan's fee schedule
- Fixed investor and loan update errors by properly handling timestamp fields in backend
- Enhanced security for sensitive data (SSN/EIN, account/routing numbers) with password field eye toggle visibility
- Updated AI document extraction to include escrow number from loan documents
- Made investor ID and Name fields clickable with blue underlined styling
- Changed "Doc Management" tab to "Docs" for brevity
- Fixed Payment Breakdown escrow totals showing $0.00 - now correctly calculates from actual escrow disbursements data (January 20, 2025)
- Added Daily Servicing Cycle feature (January 21, 2025) - comprehensive automated loan processing system with:
  - Interest accrual calculations with day-by-day tracking
  - Payment processing from inbox with matching algorithms
  - Fee assessment and late fee generation based on grace periods
  - Escrow disbursement processing with scheduled payments
  - Investor distribution calculations based on ownership percentages
  - Exception management with severity levels (low/medium/high/critical)
  - Dry run/live modes for safe testing
  - Extremely detailed event logging capturing every single decision made (positive or negative) including:
    * Every check performed and its outcome
    * Every condition evaluated with data considered
    * All calculations with formulas and results
    * Every decision point with reasons for actions taken or not taken
    * Comprehensive logging for debugging and audit purposes
- Enhanced AI Document Analysis tab in loan creation dialog (January 21, 2025):
  - Added all extractable fields as editable inputs: credit scores (all 3 bureaus), co-borrower details, trustee info, beneficiary details, escrow company information
  - Fixed database schema to include all necessary columns for AI-extracted data
  - Made all AI-extracted fields editable before loan creation
  - Properly mapped all form fields to database columns including borrowerCompanyName and trusteeCompanyName
  - Added comprehensive Escrow Company section with full contact details
- Fixed critical issues with loan display and AI extraction (January 22, 2025):
  - Corrected loan amount field mapping (originalAmount to loanAmount) in loan edit form
  - Enhanced AI prompt for credit reports to ONLY extract SSN, current address, and credit scores
  - Prevented credit report servicer information from overwriting legitimate beneficiary data
  - Fixed document upload category enum validation error in Docs tab
- Updated loan portfolio table display (January 23, 2025):
  - Removed redundant columns (By Last Name, First Name, MI, Last Name) from loan table
  - Fixed borrower name display to show the actual borrowerName field from loan data
  - Simplified table structure for cleaner, more efficient data presentation
  - Fixed document upload loan selection issue using useRef to maintain state persistence
- Implemented Admin Navigation System (January 23, 2025):
  - Created AdminLayout component with collapsible left sidebar navigation
  - Moved Documents and Escrow management to dedicated admin pages
  - Admin sidebar includes: Documents, Escrow Management, Users, Settings
  - Admin Documents page features: document browsing, filtering, categorization, upload management, and storage metrics
  - Admin Escrow page features: account management, disbursement scheduling, payment tracking, and 90-day payment schedule view
  - Routes updated: /admin/documents for document management, /admin/escrow for escrow management
  - Added "Admin" navigation item with gear icon (Settings) to main sidebar, linking to /admin/documents
  - Removed "Documents" from main navigation as it's now under Admin section
  - Added LoanServe Pro branding and Enterprise Edition subtitle to admin panel
  - Included Active Role selector in admin sidebar matching main application
  - Fixed admin panel alignment to match main application layout structure
  - Added collapsible sidebar functionality with toggle button
  - Added "Return to Main" button with arrow icon above Documents in admin navigation for easy navigation back to main dashboard

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## UI/UX Decisions
The application features a modern, component-based UI designed for clarity and ease of use. Key UI/UX decisions include:
- **Tab-based Navigation**: Logical grouping of information with 7 tabs: Overview, Contacts, Beneficiary, Escrows, Docs, Accounting, Audit Trail. Investors are integrated within the Beneficiaries tab for better organization.
- **Data Display Principle**: System must display exactly what was extracted from loan documents or user corrections; no assumed calculations. This is particularly critical for financial data like loan payments.
- **Comprehensive Contact Management**: All contacts (borrower, trustee, beneficiary) include both individual and company names, phone, email, and full street addresses.
- **Investor Management**: Comprehensive investor tracking with ownership percentages, banking information (bank name/address, account/routing numbers), SSN/EIN tracking, and entity types. Investment amounts are automatically calculated based on ownership percentage and loan amount. Investment date defaults to loan origination date. Visual validation shows green at 100% ownership, flashing red when incorrect. Each investor has unique ID and supports add/edit/delete operations.
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