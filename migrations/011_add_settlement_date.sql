-- Add settlement_date to remittance_cycle table
ALTER TABLE remittance_cycle 
ADD COLUMN IF NOT EXISTS settlement_date date;