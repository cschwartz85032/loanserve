-- Add begin date for IP allowlist entries
ALTER TABLE user_ip_allowlist 
ADD COLUMN IF NOT EXISTS begins_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Update existing entries to have begins_at equal to created_at
UPDATE user_ip_allowlist 
SET begins_at = created_at 
WHERE begins_at IS NULL;

-- Make begins_at not null after setting default values
ALTER TABLE user_ip_allowlist 
ALTER COLUMN begins_at SET NOT NULL;