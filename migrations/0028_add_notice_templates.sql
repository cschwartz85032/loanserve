-- Create email template folders table
CREATE TABLE IF NOT EXISTS email_template_folders (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  parent_id INTEGER REFERENCES email_template_folders(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create email templates table
CREATE TABLE IF NOT EXISTS email_templates (
  id SERIAL PRIMARY KEY,
  folder_id INTEGER REFERENCES email_template_folders(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  subject TEXT,
  body TEXT,
  is_shared BOOLEAN DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create notice templates table for Word documents
CREATE TABLE IF NOT EXISTS notice_templates (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL, -- late, insurance, nsf, payoff, hud, arm, other
  subcategory VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  filename VARCHAR(255),
  file_url TEXT,
  file_size INTEGER,
  mime_type VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create notice settings table for auto-notice configurations
CREATE TABLE IF NOT EXISTS notice_settings (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  setting_key VARCHAR(100) NOT NULL,
  setting_value JSONB,
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(category, setting_key)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_email_template_folders_parent ON email_template_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_folder ON email_templates(folder_id);
CREATE INDEX IF NOT EXISTS idx_notice_templates_category ON notice_templates(category);
CREATE INDEX IF NOT EXISTS idx_notice_settings_category ON notice_settings(category);