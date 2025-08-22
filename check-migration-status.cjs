#!/usr/bin/env node

/**
 * Check Migration Status
 * 
 * Verifies which migrations have been applied and identifies any issues
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

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
    console.log('Connected to database\n');

    // Check if drizzle migration table exists
    const drizzleTableResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = '__drizzle_migrations'
      )
    `);
    
    const hasDrizzleTable = drizzleTableResult.rows[0].exists;
    console.log(`Drizzle migrations table exists: ${hasDrizzleTable}`);
    
    if (hasDrizzleTable) {
      try {
        const appliedResult = await client.query(`
          SELECT id, hash, created_at 
          FROM __drizzle_migrations 
          ORDER BY created_at DESC
          LIMIT 10
        `);
        
        console.log('\nApplied migrations (from __drizzle_migrations):');
        appliedResult.rows.forEach(row => {
          console.log(`  - ${row.id}: ${new Date(row.created_at).toISOString()}`);
        });
      } catch (err) {
        console.log('  (Table check returned true but query failed - may be a false positive)');
      }
    }

    // Check journal file
    const journalPath = path.join(__dirname, 'migrations', 'meta', '_journal.json');
    if (fs.existsSync(journalPath)) {
      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
      console.log('\nMigrations in journal file:');
      journal.entries.forEach(entry => {
        console.log(`  - ${entry.tag} (idx: ${entry.idx})`);
      });
    }

    // List SQL files in migrations directory
    const migrationsDir = path.join(__dirname, 'migrations');
    const sqlFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && !f.includes('superseded'))
      .sort();
    
    console.log('\nSQL files in migrations directory:');
    sqlFiles.forEach(file => {
      console.log(`  - ${file}`);
    });

    // Check for key tables that should exist after migrations
    console.log('\nChecking for key tables:');
    const keyTables = [
      'users',
      'roles', 
      'user_roles',
      'permissions',
      'role_permissions',
      'sessions',
      'auth_events',
      'login_attempts',
      'password_reset_tokens',
      'system_settings'
    ];
    
    for (const table of keyTables) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = $1
        )
      `, [table]);
      
      const exists = result.rows[0].exists;
      console.log(`  ${exists ? '✓' : '✗'} ${table}`);
    }

    // Check sessions table structure
    console.log('\nSessions table structure:');
    const sessionsResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'sessions'
      ORDER BY ordinal_position
    `);
    
    if (sessionsResult.rows.length > 0) {
      sessionsResult.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
      });
      
      // Check if it's the old or new structure
      const hasUserId = sessionsResult.rows.some(col => col.column_name === 'user_id');
      const hasId = sessionsResult.rows.some(col => col.column_name === 'id');
      
      if (hasUserId && hasId) {
        console.log('\n  ✓ Sessions table has new audit-enabled structure');
      } else if (!hasUserId && !hasId) {
        console.log('\n  ⚠ Sessions table has old express-session structure');
      }
    }

    // Check for superseded files
    const supersededFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.includes('superseded'));
    
    if (supersededFiles.length > 0) {
      console.log('\nSuperseded migration files (not applied):');
      supersededFiles.forEach(file => {
        console.log(`  - ${file}`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);