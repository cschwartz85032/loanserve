#!/usr/bin/env node

/**
 * Fix Sessions Migration Script
 * 
 * This script migrates the sessions table from the old express-session
 * structure (sid, sess, expire) to the new audit-enabled structure with
 * proper user tracking, IP address, user agent, and revocation support.
 */

const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }
  
  const client = new Client({
    connectionString: connectionString,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Check current table structure
    const checkResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'sessions'
      ORDER BY ordinal_position
    `);
    
    const columns = checkResult.rows.map(row => row.column_name);
    console.log('Current sessions columns:', columns);

    // Check if we need to migrate
    const hasOldStructure = columns.includes('sid') && 
                            !columns.includes('id') && 
                            !columns.includes('user_id');
    
    const hasNewStructure = columns.includes('id') && 
                            columns.includes('user_id') && 
                            columns.includes('ip');

    if (hasNewStructure) {
      console.log('✓ Table already has new audit-enabled structure');
      return;
    }

    if (hasOldStructure) {
      console.log('Found old express-session structure, migrating to new structure...');
      
      // Begin transaction
      await client.query('BEGIN');

      try {
        // 1. Rename old table
        await client.query('ALTER TABLE sessions RENAME TO sessions_old');
        console.log('Renamed old table to sessions_old');

        // 2. Create new table with audit-enabled structure
        await client.query(`
          CREATE TABLE sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            sid VARCHAR(255) UNIQUE,
            sess JSON NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ip TEXT,
            user_agent TEXT,
            revoked_at TIMESTAMPTZ,
            revoke_reason TEXT,
            expire TIMESTAMP(6) NOT NULL
          )
        `);
        console.log('Created new sessions table with audit fields');

        // 3. Create indexes (if they don't exist)
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id) WHERE revoked_at IS NULL;
          CREATE INDEX IF NOT EXISTS idx_sessions_last_seen_at ON sessions(last_seen_at DESC);
          CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_sid ON sessions(sid);
          CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
        `);
        console.log('Created indexes');

        // 4. Migrate data from old table
        const migrationResult = await client.query(`
          INSERT INTO sessions (sid, sess, expire, user_id, ip, user_agent, created_at, last_seen_at)
          SELECT 
            s.sid,
            s.sess,
            s.expire,
            CASE 
              WHEN s.sess::jsonb ? 'userId' THEN (s.sess::jsonb->>'userId')::integer
              WHEN s.sess::jsonb->'passport'->>'user' IS NOT NULL THEN (s.sess::jsonb->'passport'->>'user')::integer
              ELSE NULL
            END as user_id,
            s.sess::jsonb->>'ip' as ip,
            s.sess::jsonb->>'userAgent' as user_agent,
            NOW() as created_at,
            NOW() as last_seen_at
          FROM sessions_old s
          WHERE s.expire > NOW()
        `);
        console.log(`Migrated ${migrationResult.rowCount} active sessions`);

        // 5. Drop old table
        await client.query('DROP TABLE sessions_old CASCADE');
        console.log('Dropped old sessions table');

        // Commit transaction
        await client.query('COMMIT');
        console.log('✓ Successfully migrated to new sessions structure');
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } else {
      console.log('Table structure is unclear, manual inspection required');
      console.log('Columns found:', columns);
    }

    // Verify final structure
    const finalCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'sessions'
      ORDER BY ordinal_position
    `);
    console.log('\nFinal table structure:');
    finalCheck.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

    // Check data
    const countResult = await client.query('SELECT COUNT(*) FROM sessions');
    console.log(`\nTotal sessions: ${countResult.rows[0].count}`);

    // Check user tracking
    const userCountResult = await client.query('SELECT COUNT(*) FROM sessions WHERE user_id IS NOT NULL');
    console.log(`Sessions with user_id: ${userCountResult.rows[0].count}`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);