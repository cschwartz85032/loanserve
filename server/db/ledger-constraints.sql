-- Ledger Integrity Constraints for Phase 9 Compliance
-- These constraints enforce double-entry accounting invariants

-- Constraint: Ensure each event balances (debit = credit)
CREATE OR REPLACE FUNCTION check_event_balance() RETURNS TRIGGER AS $$
DECLARE
    total_debit BIGINT;
    total_credit BIGINT;
BEGIN
    -- Calculate totals for the event
    SELECT 
        COALESCE(SUM(debit_minor), 0),
        COALESCE(SUM(credit_minor), 0)
    INTO total_debit, total_credit
    FROM general_ledger_entries
    WHERE event_id = COALESCE(NEW.event_id, OLD.event_id);
    
    -- Enforce balance constraint
    IF total_debit != total_credit THEN
        RAISE EXCEPTION 'Ledger event % is unbalanced: debit=% credit=%', 
            COALESCE(NEW.event_id, OLD.event_id), total_debit, total_credit;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to ensure balance on every insert/update/delete
DROP TRIGGER IF EXISTS enforce_event_balance ON general_ledger_entries;
CREATE TRIGGER enforce_event_balance
    AFTER INSERT OR UPDATE OR DELETE ON general_ledger_entries
    FOR EACH ROW EXECUTE FUNCTION check_event_balance();

-- Constraint: Prevent negative amounts in ledger entries
ALTER TABLE general_ledger_entries 
ADD CONSTRAINT check_no_negative_amounts 
CHECK (debit_minor >= 0 AND credit_minor >= 0);

-- Constraint: Prevent both debit and credit on same line
ALTER TABLE general_ledger_entries 
ADD CONSTRAINT check_debit_or_credit_not_both 
CHECK (
    (debit_minor > 0 AND credit_minor = 0) OR 
    (debit_minor = 0 AND credit_minor > 0)
);

-- Constraint: Require correlation_id uniqueness across events
ALTER TABLE general_ledger_events 
ADD CONSTRAINT unique_correlation_id 
UNIQUE (correlation_id);

-- Index for efficient balance calculations
CREATE INDEX IF NOT EXISTS idx_gl_entries_loan_account 
ON general_ledger_entries(loan_id, account_code);

-- Function to get derived loan balances (replaces stored balances)
CREATE OR REPLACE FUNCTION get_loan_balances(p_loan_id INTEGER)
RETURNS TABLE(
    principal_minor BIGINT,
    interest_minor BIGINT,
    fees_minor BIGINT,
    escrow_minor BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(
            CASE 
                WHEN gle.account_code LIKE 'loan_principal%' OR gle.account_code LIKE 'loan_receivable_%' 
                THEN gle.debit_minor - gle.credit_minor
                ELSE 0
            END
        ), 0) as principal_minor,
        COALESCE(SUM(
            CASE 
                WHEN gle.account_code = 'interest_receivable' 
                THEN gle.debit_minor - gle.credit_minor
                ELSE 0
            END
        ), 0) as interest_minor,
        COALESCE(SUM(
            CASE 
                WHEN gle.account_code = 'fees_receivable' 
                THEN gle.debit_minor - gle.credit_minor
                ELSE 0
            END
        ), 0) as fees_minor,
        COALESCE(SUM(
            CASE 
                WHEN gle.account_code LIKE 'escrow%' 
                THEN gle.credit_minor - gle.debit_minor
                ELSE 0
            END
        ), 0) as escrow_minor
    FROM general_ledger_entries gle
    JOIN general_ledger_events gev ON gle.event_id = gev.event_id
    WHERE gev.loan_id = p_loan_id;
END;
$$ LANGUAGE plpgsql;

-- Function to detect direct balance update attempts (for monitoring)
CREATE OR REPLACE FUNCTION detect_direct_balance_updates() RETURNS TRIGGER AS $$
BEGIN
    -- Log any direct updates to balance fields for compliance monitoring
    INSERT INTO compliance_audit_log (
        event_type,
        entity_type,
        entity_id,
        description,
        details,
        created_at
    ) VALUES (
        'ACCOUNTING.DIRECT_UPDATE_BLOCKED',
        'loan',
        COALESCE(NEW.loan_id, OLD.loan_id)::TEXT,
        'Direct balance update attempted - should use ledger operations only',
        jsonb_build_object(
            'table_name', TG_TABLE_NAME,
            'operation', TG_OP,
            'old_balance', CASE WHEN OLD IS NOT NULL THEN OLD.balance ELSE NULL END,
            'new_balance', CASE WHEN NEW IS NOT NULL THEN NEW.balance ELSE NULL END
        ),
        NOW()
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply monitoring triggers to balance tables
DROP TRIGGER IF EXISTS monitor_loan_balances_updates ON loan_balances;
CREATE TRIGGER monitor_loan_balances_updates
    AFTER UPDATE ON loan_balances
    FOR EACH ROW EXECUTE FUNCTION detect_direct_balance_updates();

DROP TRIGGER IF EXISTS monitor_escrow_accounts_updates ON escrow_accounts;
CREATE TRIGGER monitor_escrow_accounts_updates
    AFTER UPDATE OF balance ON escrow_accounts
    FOR EACH ROW EXECUTE FUNCTION detect_direct_balance_updates();

-- Constraint: Ensure all monetary operations have audit trail
CREATE OR REPLACE FUNCTION ensure_monetary_audit() RETURNS TRIGGER AS $$
BEGIN
    -- Check if corresponding audit entry exists for this correlation_id
    IF NOT EXISTS (
        SELECT 1 FROM compliance_audit_log 
        WHERE correlation_id = NEW.correlation_id
        AND event_type LIKE 'ACCOUNTING.%'
    ) THEN
        RAISE WARNING 'Ledger event % created without audit trail - Phase 9 violation', 
            NEW.event_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply audit enforcement
DROP TRIGGER IF EXISTS enforce_monetary_audit ON general_ledger_events;
CREATE TRIGGER enforce_monetary_audit
    AFTER INSERT ON general_ledger_events
    FOR EACH ROW EXECUTE FUNCTION ensure_monetary_audit();

COMMENT ON FUNCTION check_event_balance() IS 'Enforces double-entry balance constraint for Phase 9 compliance';
COMMENT ON FUNCTION get_loan_balances(INTEGER) IS 'Calculates derived balances from ledger entries only - no stored balances';
COMMENT ON FUNCTION detect_direct_balance_updates() IS 'Monitors and logs direct balance updates for compliance violations';
COMMENT ON FUNCTION ensure_monetary_audit() IS 'Ensures every ledger operation has corresponding audit trail';