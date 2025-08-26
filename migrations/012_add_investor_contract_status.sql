-- Add status column to investor_contract table
ALTER TABLE investor_contract 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- Add constraint to ensure valid status values
ALTER TABLE investor_contract 
ADD CONSTRAINT check_contract_status 
CHECK (status IN ('active', 'inactive', 'suspended'));