-- Fix sessions table to work with both our schema and the session store
-- This migration ensures the sessions table has all required columns

-- First, drop the old session table created by connect-pg-simple if it exists
DROP TABLE IF EXISTS session CASCADE;

-- Add missing columns to sessions table if they don't exist
DO $$
BEGIN
    -- Add sid column for session store compatibility
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sessions' AND column_name = 'sid') THEN
        ALTER TABLE sessions ADD COLUMN sid VARCHAR(255) UNIQUE;
        CREATE INDEX idx_sessions_sid ON sessions(sid);
    END IF;

    -- Add sess column for session data
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sessions' AND column_name = 'sess') THEN
        ALTER TABLE sessions ADD COLUMN sess JSON NOT NULL DEFAULT '{}';
    END IF;

    -- Add expire column for session expiration
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sessions' AND column_name = 'expire') THEN
        ALTER TABLE sessions ADD COLUMN expire TIMESTAMP WITH TIME ZONE;
        CREATE INDEX idx_sessions_expire ON sessions(expire);
    END IF;

    -- Ensure user_id column is integer type (not text)
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'sessions' AND column_name = 'user_id' 
               AND data_type = 'text') THEN
        -- First remove the foreign key constraint if it exists
        ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_user_id_users_id_fk;
        
        -- Convert user_id from text to integer
        ALTER TABLE sessions ALTER COLUMN user_id TYPE INTEGER USING user_id::INTEGER;
        
        -- Re-add the foreign key constraint
        ALTER TABLE sessions ADD CONSTRAINT sessions_user_id_users_id_fk 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    -- Add index on user_id if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_indexes 
                   WHERE tablename = 'sessions' AND indexname = 'idx_sessions_user_id') THEN
        CREATE INDEX idx_sessions_user_id ON sessions(user_id);
    END IF;

    -- Add index on revoked_at for efficient queries
    IF NOT EXISTS (SELECT 1 FROM pg_indexes 
                   WHERE tablename = 'sessions' AND indexname = 'idx_sessions_revoked_at') THEN
        CREATE INDEX idx_sessions_revoked_at ON sessions(revoked_at);
    END IF;
END $$;

-- Update any existing sessions to have sid if they don't have one
UPDATE sessions 
SET sid = 'sess:' || id::TEXT 
WHERE sid IS NULL;

-- Make sid NOT NULL after updating existing records
ALTER TABLE sessions ALTER COLUMN sid SET NOT NULL;