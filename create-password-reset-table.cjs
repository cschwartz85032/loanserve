#!/usr/bin/env node

/**
 * Create password_reset_tokens table
 */

const { neon } = require('@neondatabase/serverless');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function createTable() {
  try {
    // Create the password_reset_tokens table
    await sql`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(token_hash)
      )
    `;
    
    console.log('✅ Created password_reset_tokens table');
    
    // Create index for faster lookups
    await sql`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id 
      ON password_reset_tokens(user_id)
    `;
    
    console.log('✅ Created index on user_id');
    
    // Create index for token lookups
    await sql`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash 
      ON password_reset_tokens(token_hash)
    `;
    
    console.log('✅ Created index on token_hash');
    
  } catch (error) {
    console.error('Error creating table:', error);
  }
}

createTable().then(() => {
  console.log('\n✅ Done');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});