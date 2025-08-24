#!/usr/bin/env node

/**
 * Fix password_reset_tokens table structure
 */

const { neon } = require('@neondatabase/serverless');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function fixTable() {
  try {
    // Drop the existing table and recreate with correct structure
    console.log('Dropping and recreating password_reset_tokens table...');
    
    await sql`DROP TABLE IF EXISTS password_reset_tokens CASCADE`;
    
    await sql`
      CREATE TABLE password_reset_tokens (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;
    
    console.log('✅ Created password_reset_tokens table with correct structure');
    
    // Create indexes
    await sql`
      CREATE UNIQUE INDEX unique_user_token 
      ON password_reset_tokens(user_id, token_hash)
    `;
    
    await sql`
      CREATE INDEX idx_password_reset_tokens_user_id 
      ON password_reset_tokens(user_id)
    `;
    
    await sql`
      CREATE INDEX idx_password_reset_tokens_token_hash 
      ON password_reset_tokens(token_hash)
    `;
    
    console.log('✅ Created indexes');
    
  } catch (error) {
    console.error('Error fixing table:', error);
  }
}

fixTable().then(() => {
  console.log('\n✅ Done');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});