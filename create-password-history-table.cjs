const { neon } = require('@neondatabase/serverless');

const databaseUrl = process.env.DATABASE_URL;
const sql = neon(databaseUrl);

async function createPasswordHistoryTable() {
  try {
    console.log('Creating password_history table...');
    
    // Create password_history table
    await sql`
      CREATE TABLE IF NOT EXISTS password_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, password_hash)
      )
    `;
    
    console.log('✅ Created password_history table');
    
    // Create indexes for better performance
    await sql`
      CREATE INDEX IF NOT EXISTS password_history_user_id_idx ON password_history (user_id)
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS password_history_created_at_idx ON password_history (created_at DESC)
    `;
    
    console.log('✅ Created indexes on password_history table');
    
    // Verify table was created
    const tables = await sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename = 'password_history'
    `;
    
    if (tables.length > 0) {
      console.log('✅ Verified password_history table exists');
      
      // Get table structure
      const columns = await sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'password_history'
        ORDER BY ordinal_position
      `;
      
      console.log('\nTable structure:');
      columns.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
      });
    }
    
  } catch (error) {
    console.error('Error creating password_history table:', error);
  }
}

createPasswordHistoryTable();