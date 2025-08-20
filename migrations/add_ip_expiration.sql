-- Add expiration date field to IP allowlist
ALTER TABLE user_ip_allowlist 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Add an index for efficient expiration queries
CREATE INDEX IF NOT EXISTS idx_user_ip_allowlist_expires_at 
ON user_ip_allowlist(expires_at) 
WHERE expires_at IS NOT NULL;