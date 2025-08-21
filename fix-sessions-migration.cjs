const { Pool } = require('pg');

async function runMigration() {
  // Fix DATABASE_URL if it has incorrect sslmode
  let connectionString = process.env.DATABASE_URL;
  if (connectionString && connectionString.includes('sslmode=requir')) {
    connectionString = connectionString.replace('sslmode=requir', 'sslmode=require');
  }
  
  const pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('Running sessions table migration...');
    
    // Drop the old session table created by connect-pg-simple if it exists
    await pool.query('DROP TABLE IF EXISTS session CASCADE');
    console.log('✓ Dropped old session table if it existed');
    
    // Add missing columns to sessions table
    const checks = [
      {
        column: 'sid',
        add: async () => {
          await pool.query(`
            ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sid VARCHAR(255) UNIQUE
          `);
          await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_sessions_sid ON sessions(sid)
          `);
        }
      },
      {
        column: 'sess',
        add: async () => {
          await pool.query(`
            ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sess JSON NOT NULL DEFAULT '{}'
          `);
        }
      },
      {
        column: 'expire',
        add: async () => {
          await pool.query(`
            ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expire TIMESTAMP WITH TIME ZONE
          `);
          await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire)
          `);
        }
      }
    ];
    
    // Check and add columns
    for (const check of checks) {
      const result = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'sessions' AND column_name = $1
      `, [check.column]);
      
      if (result.rows.length === 0) {
        await check.add();
        console.log(`✓ Added column: ${check.column}`);
      } else {
        console.log(`✓ Column exists: ${check.column}`);
      }
    }
    
    // Check if user_id is text and needs conversion
    const userIdCheck = await pool.query(`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'sessions' AND column_name = 'user_id'
    `);
    
    if (userIdCheck.rows.length > 0 && userIdCheck.rows[0].data_type === 'text') {
      console.log('Converting user_id from text to integer...');
      
      // Drop the foreign key constraint if it exists
      await pool.query(`
        ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_user_id_users_id_fk
      `);
      
      // Convert user_id from text to integer
      await pool.query(`
        ALTER TABLE sessions ALTER COLUMN user_id TYPE INTEGER USING user_id::INTEGER
      `);
      
      // Re-add the foreign key constraint
      await pool.query(`
        ALTER TABLE sessions ADD CONSTRAINT sessions_user_id_users_id_fk 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      `);
      
      console.log('✓ Converted user_id to integer');
    } else {
      console.log('✓ user_id is already correct type');
    }
    
    // Add indexes if they don't exist
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_revoked_at ON sessions(revoked_at)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_last_seen_at ON sessions(last_seen_at)
    `);
    console.log('✓ Created indexes');
    
    // Update any existing sessions to have sid if they don't have one
    await pool.query(`
      UPDATE sessions 
      SET sid = 'sess:' || id::TEXT 
      WHERE sid IS NULL
    `);
    console.log('✓ Updated existing sessions with sid');
    
    // Make sid NOT NULL after updating existing records
    await pool.query(`
      ALTER TABLE sessions ALTER COLUMN sid SET NOT NULL
    `);
    console.log('✓ Made sid column NOT NULL');
    
    console.log('\n✅ Migration completed successfully!');
    console.log('The sessions table is now properly configured for the custom session store.');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();