-- Database-level history tables and triggers for audit safety net
-- These capture all changes even if application-level auditing fails

-- Beneficiary history (tracks changes to loan beneficiary fields)
CREATE TABLE IF NOT EXISTS beneficiary_history (
  hist_id       bigserial PRIMARY KEY,
  loan_id       bigint NOT NULL,
  old_row       jsonb,
  new_row       jsonb,
  operation     text NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  changed_at    timestamptz NOT NULL DEFAULT now(),
  changed_by    text, -- from app.actor_id setting
  correlation_id text -- from app.correlation_id setting
);

-- Investor history (tracks changes to investors table)
CREATE TABLE IF NOT EXISTS investor_history (
  hist_id       bigserial PRIMARY KEY,
  investor_db_id bigint NOT NULL,
  loan_id       bigint,
  investor_id   text,
  old_row       jsonb,
  new_row       jsonb,
  operation     text NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  changed_at    timestamptz NOT NULL DEFAULT now(),
  changed_by    text, -- from app.actor_id setting
  correlation_id text -- from app.correlation_id setting
);

-- Beneficiary history trigger function
CREATE OR REPLACE FUNCTION trg_beneficiary_history()
RETURNS trigger AS $$
DECLARE
  changed_by_val text;
  correlation_id_val text;
BEGIN
  -- Get current settings (will be NULL if not set)
  BEGIN
    changed_by_val := current_setting('app.actor_id', true);
    correlation_id_val := current_setting('app.correlation_id', true);
  EXCEPTION WHEN OTHERS THEN
    changed_by_val := NULL;
    correlation_id_val := NULL;
  END;

  IF TG_OP = 'UPDATE' THEN
    -- Only log if beneficiary fields actually changed
    IF (OLD.beneficiary_name IS DISTINCT FROM NEW.beneficiary_name OR
        OLD.beneficiary_company_name IS DISTINCT FROM NEW.beneficiary_company_name OR
        OLD.beneficiary_phone IS DISTINCT FROM NEW.beneficiary_phone OR
        OLD.beneficiary_email IS DISTINCT FROM NEW.beneficiary_email OR
        OLD.beneficiary_street_address IS DISTINCT FROM NEW.beneficiary_street_address OR
        OLD.beneficiary_city IS DISTINCT FROM NEW.beneficiary_city OR
        OLD.beneficiary_state IS DISTINCT FROM NEW.beneficiary_state OR
        OLD.beneficiary_zip_code IS DISTINCT FROM NEW.beneficiary_zip_code) THEN
      
      INSERT INTO beneficiary_history (loan_id, old_row, new_row, operation, changed_by, correlation_id)
      VALUES (
        OLD.id, 
        jsonb_build_object(
          'beneficiary_name', OLD.beneficiary_name,
          'beneficiary_company_name', OLD.beneficiary_company_name,
          'beneficiary_phone', OLD.beneficiary_phone,
          'beneficiary_email', OLD.beneficiary_email,
          'beneficiary_street_address', OLD.beneficiary_street_address,
          'beneficiary_city', OLD.beneficiary_city,
          'beneficiary_state', OLD.beneficiary_state,
          'beneficiary_zip_code', OLD.beneficiary_zip_code
        ),
        jsonb_build_object(
          'beneficiary_name', NEW.beneficiary_name,
          'beneficiary_company_name', NEW.beneficiary_company_name,
          'beneficiary_phone', NEW.beneficiary_phone,
          'beneficiary_email', NEW.beneficiary_email,
          'beneficiary_street_address', NEW.beneficiary_street_address,
          'beneficiary_city', NEW.beneficiary_city,
          'beneficiary_state', NEW.beneficiary_state,
          'beneficiary_zip_code', NEW.beneficiary_zip_code
        ),
        'UPDATE',
        changed_by_val,
        correlation_id_val
      );
    END IF;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Investor history trigger function
CREATE OR REPLACE FUNCTION trg_investor_history()
RETURNS trigger AS $$
DECLARE
  changed_by_val text;
  correlation_id_val text;
BEGIN
  -- Get current settings (will be NULL if not set)
  BEGIN
    changed_by_val := current_setting('app.actor_id', true);
    correlation_id_val := current_setting('app.correlation_id', true);
  EXCEPTION WHEN OTHERS THEN
    changed_by_val := NULL;
    correlation_id_val := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO investor_history (investor_db_id, loan_id, investor_id, old_row, new_row, operation, changed_by, correlation_id)
    VALUES (NEW.id, NEW.loan_id, NEW.investor_id, NULL, to_jsonb(NEW), 'INSERT', changed_by_val, correlation_id_val);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO investor_history (investor_db_id, loan_id, investor_id, old_row, new_row, operation, changed_by, correlation_id)
    VALUES (OLD.id, OLD.loan_id, OLD.investor_id, to_jsonb(OLD), to_jsonb(NEW), 'UPDATE', changed_by_val, correlation_id_val);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO investor_history (investor_db_id, loan_id, investor_id, old_row, new_row, operation, changed_by, correlation_id)
    VALUES (OLD.id, OLD.loan_id, OLD.investor_id, to_jsonb(OLD), NULL, 'DELETE', changed_by_val, correlation_id_val);
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trg_beneficiary_history ON loans;
CREATE TRIGGER trg_beneficiary_history
AFTER UPDATE ON loans
FOR EACH ROW EXECUTE FUNCTION trg_beneficiary_history();

DROP TRIGGER IF EXISTS trg_investor_history ON investors;
CREATE TRIGGER trg_investor_history
AFTER INSERT OR UPDATE OR DELETE ON investors
FOR EACH ROW EXECUTE FUNCTION trg_investor_history();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS beneficiary_history_loan_id_idx ON beneficiary_history(loan_id);
CREATE INDEX IF NOT EXISTS beneficiary_history_changed_at_idx ON beneficiary_history(changed_at);
CREATE INDEX IF NOT EXISTS beneficiary_history_correlation_id_idx ON beneficiary_history(correlation_id);

CREATE INDEX IF NOT EXISTS investor_history_investor_db_id_idx ON investor_history(investor_db_id);
CREATE INDEX IF NOT EXISTS investor_history_loan_id_idx ON investor_history(loan_id);
CREATE INDEX IF NOT EXISTS investor_history_changed_at_idx ON investor_history(changed_at);
CREATE INDEX IF NOT EXISTS investor_history_correlation_id_idx ON investor_history(correlation_id);