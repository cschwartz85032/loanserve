-- Add new columns to email_templates table for enhanced template management
ALTER TABLE email_templates
ADD COLUMN IF NOT EXISTS template_key VARCHAR(100) UNIQUE,
ADD COLUMN IF NOT EXISTS format VARCHAR(20) DEFAULT 'markdown',
ADD COLUMN IF NOT EXISTS flags JSONB,
ADD COLUMN IF NOT EXISTS trigger JSONB,
ADD COLUMN IF NOT EXISTS tokens JSONB,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Create index on template_key for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_templates_key ON email_templates(template_key);

-- Create index on is_active for filtering active templates
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active);