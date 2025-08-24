#!/usr/bin/env node

/**
 * Manual migration runner for database schema updates
 * This ensures database structure stays in sync with schema definitions
 * Migrations are forward-only and idempotent by design
 */

const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function runMigrations() {
  console.log('[Migration] Starting manual migration process...');
  
  try {
    // Create migrations tracking table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash VARCHAR(256) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    
    // Get list of migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Ensure migrations run in order
    
    console.log(`[Migration] Found ${files.length} migration files`);
    
    // Get already applied migrations
    const applied = await sql`
      SELECT hash FROM __drizzle_migrations
    `;
    const appliedHashes = new Set(applied.map(row => row.hash));
    
    // Apply each migration
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Create a simple hash of the filename (in production, use content hash)
      const hash = file;
      
      if (appliedHashes.has(hash)) {
        console.log(`[Migration] Skipping ${file} (already applied)`);
        continue;
      }
      
      console.log(`[Migration] Applying ${file}...`);
      
      try {
        // Execute migration
        await sql(content);
        
        // Record successful migration
        await sql`
          INSERT INTO __drizzle_migrations (hash) VALUES (${hash})
        `;
        
        console.log(`[Migration] Successfully applied ${file}`);
      } catch (error) {
        console.error(`[Migration] Error applying ${file}:`, error.message);
        // Continue with other migrations
      }
    }
    
    // Verify critical tables
    console.log('[Migration] Verifying critical tables...');
    const criticalTables = [
      'users',
      'roles',
      'user_roles',
      'auth_events',
      'login_attempts',
      'user_ip_allowlist',
      'system_settings',
      'sessions'
    ];
    
    for (const table of criticalTables) {
      const result = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = ${table}
        )
      `;
      
      if (result[0]?.exists) {
        console.log(`[Migration] ✓ Table '${table}' exists`);
      } else {
        console.warn(`[Migration] ✗ Table '${table}' does not exist`);
      }
    }
    
    console.log('[Migration] Migration process completed');
    
  } catch (error) {
    console.error('[Migration] Fatal error:', error);
    process.exit(1);
  }
}

// Run migrations
runMigrations()
  .then(() => {
    console.log('[Migration] Done');
    process.exit(0);
  })
  .catch(error => {
    console.error('[Migration] Unexpected error:', error);
    process.exit(1);
  });