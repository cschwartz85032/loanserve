const { neonConfig, Pool } = require('@neondatabase/serverless');
const ws = require('ws');
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fixSessionsTable() {
  const client = await pool.connect();
  
  try {
    console.log('Starting production sessions table fix...\n');
    
    // Start transaction
    await client.query('BEGIN');
    
    // 1. Check if old sessions table exists
    const oldTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'sessions'
      )
    `);
    
    if (oldTableExists.rows[0].exists) {
      console.log('Renaming existing sessions table to sessions_old...');
      await client.query('ALTER TABLE sessions RENAME TO sessions_old');
      console.log('✓ Renamed sessions to sessions_old\n');
    }
    
    // 2. Create new sessions table with express-session schema
    console.log('Creating new sessions table with express-session schema...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid VARCHAR NOT NULL COLLATE "default",
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL,
        PRIMARY KEY (sid)
      )
    `);
    console.log('✓ Created sessions table\n');
    
    // 3. Create index on expire column for cleanup
    console.log('Creating index on expire column...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_expire 
      ON sessions (expire)
    `);
    console.log('✓ Created expire index\n');
    
    // Commit transaction
    await client.query('COMMIT');
    console.log('✅ Successfully fixed production sessions table!');
    console.log('\nThe old sessions table has been renamed to sessions_old');
    console.log('The new sessions table is ready for express-session');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error fixing sessions table:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the fix
fixSessionsTable().catch(console.error);