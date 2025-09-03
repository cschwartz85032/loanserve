-- Database Performance Optimization
-- Issue #5: Database Performance (Architect Review)
-- Critical indexes for LoanServe Pro mortgage servicing platform

-- ================================================================================
-- PERFORMANCE ANALYSIS SUMMARY
-- ================================================================================
-- Based on query analysis and pg_stats, the following indexes are needed:
-- 1. Foreign key lookups (loan_id, borrower_id, property_id)
-- 2. Status and date range queries 
-- 3. Document filtering and searching
-- 4. Audit log performance
-- 5. Ledger entry lookups by correlation_id and event_id
-- ================================================================================

-- ================================================================================
-- LOANS TABLE INDEXES
-- ================================================================================
-- Critical for loan dashboard, status filtering, and date range queries

-- Compound index for status-based queries with date filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loans_status_dates 
ON loans (status, status_date, created_at) 
WHERE status IS NOT NULL;

-- Loan number lookups (frequently used for search)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loans_loan_number 
ON loans (loan_number) 
WHERE loan_number IS NOT NULL;

-- Borrower information lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loans_borrower_info 
ON loans (borrower_name, borrower_ssn) 
WHERE borrower_name IS NOT NULL;

-- Property association
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loans_property_id 
ON loans (property_id) 
WHERE property_id IS NOT NULL;

-- Interest rate and payment queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loans_rates_payments 
ON loans (interest_rate, payment_amount, principal_balance);

-- Maturity date for portfolio management
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loans_maturity 
ON loans (maturity_date) 
WHERE maturity_date IS NOT NULL;

-- ================================================================================
-- DOCUMENTS TABLE INDEXES  
-- ================================================================================
-- Critical for document lookup, filtering, and association queries

-- Primary foreign key relationships
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_loan_id 
ON documents (loan_id) 
WHERE loan_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_borrower_id 
ON documents (borrower_id) 
WHERE borrower_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_property_id 
ON documents (property_id) 
WHERE property_id IS NOT NULL;

-- Document filtering and search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_category_active 
ON documents (category, is_active, created_at) 
WHERE category IS NOT NULL;

-- Document type and status queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_type_status 
ON documents (document_type, is_current_version, is_active);

-- File metadata queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_uploaded_by_date 
ON documents (uploaded_by, created_at) 
WHERE uploaded_by IS NOT NULL;

-- Document access tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_last_accessed 
ON documents (last_accessed_at, last_accessed_by) 
WHERE last_accessed_at IS NOT NULL;

-- ================================================================================
-- PAYMENTS TABLE INDEXES
-- ================================================================================
-- Critical for payment history, reconciliation, and reporting

-- Payment lookup by loan and date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_loan_date 
ON payments (loan_id, payment_date, created_at);

-- Payment status and processing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_status_type 
ON payments (status, payment_type, payment_date);

-- Amount-based queries for reporting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_amounts 
ON payments (principal_amount, interest_amount, total_amount);

-- External reference tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_external_refs 
ON payments (external_reference, transaction_id) 
WHERE external_reference IS NOT NULL;

-- ================================================================================
-- GENERAL LEDGER INDEXES
-- ================================================================================
-- Critical for accounting integrity and audit trails

-- Event-based ledger lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_entries_event_id 
ON general_ledger_entries (event_id);

-- Correlation ID for transaction tracing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_entries_correlation 
ON general_ledger_entries (correlation_id) 
WHERE correlation_id IS NOT NULL;

-- Account and date-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_entries_account_date 
ON general_ledger_entries (account_code, transaction_date);

-- Debit/Credit amount queries for reconciliation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_entries_amounts 
ON general_ledger_entries (debit_minor, credit_minor) 
WHERE debit_minor > 0 OR credit_minor > 0;

-- ================================================================================
-- AUDIT LOGS INDEXES
-- ================================================================================
-- Critical for compliance and security auditing

-- Event type and date filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_event_type_date 
ON audit_logs (event_type, created_at);

-- Resource-based audit trails
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_resource 
ON audit_logs (resource_type, resource_id) 
WHERE resource_type IS NOT NULL AND resource_id IS NOT NULL;

-- Actor-based audit queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_actor 
ON audit_logs (actor_type, actor_id, created_at) 
WHERE actor_id IS NOT NULL;

-- Loan-specific audit trails
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_loan_id 
ON audit_logs (loan_id, created_at) 
WHERE loan_id IS NOT NULL;

-- IP address tracking for security
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_ip_addr 
ON audit_logs (ip_addr, created_at) 
WHERE ip_addr IS NOT NULL;

-- ================================================================================
-- BORROWERS TABLE INDEXES
-- ================================================================================
-- Critical for borrower lookup and CRM functions

-- Primary borrower identification
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_borrowers_ssn 
ON borrowers (ssn) 
WHERE ssn IS NOT NULL;

-- Name-based searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_borrowers_name_search 
ON borrowers (last_name, first_name) 
WHERE last_name IS NOT NULL;

-- Email and phone lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_borrowers_contact_info 
ON borrowers (email, phone) 
WHERE email IS NOT NULL OR phone IS NOT NULL;

-- ================================================================================
-- ESCROW AND INVESTOR INDEXES
-- ================================================================================
-- Critical for escrow management and investor reporting

-- Escrow account lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_escrow_accounts_loan_id 
ON escrow_accounts (loan_id) 
WHERE loan_id IS NOT NULL;

-- Investor position tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_investor_positions_loan_investor 
ON investor_positions (loan_id, investor_id);

-- Escrow disbursements by date and type
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_escrow_disbursements_date_type 
ON escrow_disbursements (disbursement_date, disbursement_type);

-- ================================================================================
-- TEXT SEARCH INDEXES (GIN)
-- ================================================================================
-- For full-text search capabilities

-- Document title and description search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_text_search 
ON documents USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- Loan notes and metadata search  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loans_text_search 
ON loans USING GIN (to_tsvector('english', COALESCE(notes, '') || ' ' || COALESCE(metadata::text, '')))
WHERE notes IS NOT NULL OR metadata IS NOT NULL;

-- ================================================================================
-- PARTIAL INDEXES FOR EFFICIENCY
-- ================================================================================
-- Only index active/relevant records to save space

-- Active loans only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loans_active_status 
ON loans (status, created_at) 
WHERE status IN ('active', 'current', 'performing');

-- Recent documents only (last 2 years)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_recent 
ON documents (loan_id, category, created_at) 
WHERE created_at >= CURRENT_DATE - INTERVAL '2 years';

-- Failed payments for retry processing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_failed 
ON payments (status, created_at, loan_id) 
WHERE status IN ('failed', 'pending', 'processing');

-- ================================================================================
-- PERFORMANCE MONITORING VIEWS
-- ================================================================================

-- Create view to monitor index usage
CREATE OR REPLACE VIEW v_index_usage_stats AS
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan,
    CASE 
        WHEN idx_scan = 0 THEN 'UNUSED'
        WHEN idx_scan < 10 THEN 'LOW_USAGE'
        WHEN idx_scan < 100 THEN 'MODERATE_USAGE'
        ELSE 'HIGH_USAGE'
    END as usage_level
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Create view to monitor table scan ratios
CREATE OR REPLACE VIEW v_table_scan_ratios AS
SELECT 
    schemaname,
    tablename,
    seq_scan,
    seq_tup_read,
    idx_scan,
    idx_tup_fetch,
    CASE 
        WHEN seq_scan + idx_scan = 0 THEN 0
        ELSE ROUND(100.0 * seq_scan / (seq_scan + idx_scan), 2)
    END as seq_scan_ratio
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
ORDER BY seq_scan_ratio DESC;

-- ================================================================================
-- INDEX MAINTENANCE COMMANDS
-- ================================================================================

-- To check index bloat (run periodically):
-- SELECT schemaname, tablename, indexname, 
--        pg_size_pretty(pg_relation_size(indexrelid)) as index_size
-- FROM pg_stat_user_indexes 
-- WHERE schemaname = 'public' 
-- ORDER BY pg_relation_size(indexrelid) DESC;

-- To reindex if needed:
-- REINDEX INDEX CONCURRENTLY idx_name;

-- To analyze table statistics after index creation:
-- ANALYZE loans, documents, payments, general_ledger_entries, audit_logs, borrowers;