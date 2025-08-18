-- Add new fields to escrow_disbursements table for enhanced payment tracking
-- Migration: 0007_add_escrow_disbursement_fields.sql

-- Add type-specific fields
ALTER TABLE escrow_disbursements 
  ADD COLUMN parcel_number TEXT,
  ADD COLUMN policy_number TEXT;

-- Add separate routing number fields for ACH and wire transfers
ALTER TABLE escrow_disbursements 
  ADD COLUMN bank_account_number TEXT,
  ADD COLUMN ach_routing_number TEXT,
  ADD COLUMN wire_routing_number TEXT;

-- Update the comment on the account_number field to clarify its purpose
COMMENT ON COLUMN escrow_disbursements.account_number IS 'For taxes - property tax account number';
COMMENT ON COLUMN escrow_disbursements.bank_account_number IS 'Bank account number for ACH/wire transfers (encrypted)';
COMMENT ON COLUMN escrow_disbursements.ach_routing_number IS 'ACH routing number for electronic transfers';
COMMENT ON COLUMN escrow_disbursements.wire_routing_number IS 'Wire routing number for wire transfers';
COMMENT ON COLUMN escrow_disbursements.parcel_number IS 'Property parcel number for tax payments';
COMMENT ON COLUMN escrow_disbursements.policy_number IS 'Insurance policy number';