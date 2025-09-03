-- Fix authentication for FNM testing
-- Create a test user with a simple argon2 hash for "test123"

-- First, let's see current users
SELECT id, username, email, substring(password, 1, 50) as password_hash FROM users;

-- Insert or update a test user with known argon2 hash
-- Password: "test123" 
-- Hash: $argon2id$v=19$m=65536,t=3,p=4$randomsalt$hash
INSERT INTO users (
  username, 
  email, 
  password, 
  first_name, 
  last_name, 
  is_active, 
  email_verified, 
  status
) VALUES (
  'testuser2',
  'test@loanserve.com',
  '$argon2id$v=19$m=65536,t=3,p=4$4M5rs/z1Xo78OD+4aup8Rw$0EnE115Nursjs5kMgoIeS+MPQMuQN1tgR9gJ0TaZD44',
  'Test',
  'User',
  true,
  true,
  'active'
) ON CONFLICT (email) DO UPDATE SET 
  password = EXCLUDED.password,
  is_active = true;

-- Alternatively, update existing loanatik user with proper argon2 hash
UPDATE users 
SET password = '$argon2id$v=19$m=65536,t=3,p=4$4M5rs/z1Xo78OD+4aup8Rw$0EnE115Nursjs5kMgoIeS+MPQMuQN1tgR9gJ0TaZD44'
WHERE username = 'loanatik';

-- Check the update
SELECT username, email, substring(password, 1, 50) as password_start 
FROM users 
WHERE username IN ('loanatik', 'testuser2');