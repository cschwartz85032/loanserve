-- Migration: Add escrow status fields and outbox table
-- This addresses the missing migrations mentioned in the runbook

BEGIN;

-- Add escrow status fields to escrow_accounts if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'escrow_accounts' AND column_name = 'status') THEN
        ALTER TABLE escrow_accounts ADD COLUMN status VARCHAR(50) DEFAULT 'active';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'escrow_accounts' AND column_name = 'status_updated_at') THEN
        ALTER TABLE escrow_accounts ADD COLUMN status_updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'escrow_accounts' AND column_name = 'next_analysis_date') THEN
        ALTER TABLE escrow_accounts ADD COLUMN next_analysis_date DATE;
    END IF;
END $$;

-- Create outbox table for reliable message publishing
CREATE TABLE IF NOT EXISTS outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    event_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    correlation_id VARCHAR(255),
    idempotency_key VARCHAR(255) UNIQUE,
    schema_version VARCHAR(50) DEFAULT 'v1'
);

-- Index for processing performance
CREATE INDEX IF NOT EXISTS idx_outbox_processing 
ON outbox (processed_at, failed_at, next_retry_at) 
WHERE processed_at IS NULL;

-- Index for correlation tracking
CREATE INDEX IF NOT EXISTS idx_outbox_correlation 
ON outbox (correlation_id, created_at);

-- Add escrow status tracking table
CREATE TABLE IF NOT EXISTS escrow_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escrow_account_id UUID NOT NULL REFERENCES escrow_accounts(id),
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    reason VARCHAR(255),
    changed_by UUID,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB
);

-- Index for status history queries
CREATE INDEX IF NOT EXISTS idx_escrow_status_history_account 
ON escrow_status_history (escrow_account_id, changed_at DESC);

COMMIT;