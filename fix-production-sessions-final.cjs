const { neon } = require('@neondatabase/serverless');

// Using the production database URL
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

async function fixSessionsTable() {
  console.log('Starting final production sessions table fix...\n');
  
  const sql = neon(DATABASE_URL);
  
  try {
    // First, check what tables exist
    console.log('Checking existing tables...');
    const tables = await sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('sessions', 'sessions_old', 'sessions_backup')
    `;
    console.log('Found tables:', tables.map(t => t.tablename).join(', '));
    
    // Drop old backup tables if they exist
    console.log('\nCleaning up old backup tables...');
    await sql`DROP TABLE IF EXISTS sessions_backup CASCADE`;
    await sql`DROP TABLE IF EXISTS sessions_old CASCADE`;
    console.log('✅ Old backup tables removed');
    
    // Drop the current sessions table if it exists
    console.log('\nDropping existing sessions table...');
    await sql`DROP TABLE IF EXISTS sessions CASCADE`;
    console.log('✅ Sessions table dropped');
    
    // Create the new sessions table with the correct structure
    console.log('\nCreating new sessions table with correct express-session structure...');
    await sql`
      CREATE TABLE sessions (
        sid VARCHAR(255) PRIMARY KEY,
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL
      )
    `;
    console.log('✅ Sessions table created with correct structure');
    
    // Create index on expire column for cleanup queries
    console.log('\nCreating index on expire column...');
    await sql`CREATE INDEX idx_sessions_expire ON sessions (expire)`;
    console.log('✅ Index created');
    
    // Verify the table structure
    console.log('\nVerifying table structure...');
    const columns = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'sessions'
      ORDER BY ordinal_position
    `;
    
    console.log('\nFinal sessions table structure:');
    columns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    
    console.log('\n✅ Sessions table successfully fixed!');
    console.log('The table now has the correct express-session structure.');
    
  } catch (error) {
    console.error('❌ Error fixing sessions table:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

fixSessionsTable().then(() => {
  console.log('\n✅ Script completed successfully');
  process.exit(0);
}).catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});