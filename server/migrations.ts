import { migrate } from 'drizzle-orm/neon-http/migrator';
import { db } from './db';
import path from 'path';

export async function runMigrations() {
  console.log('[Migration] Starting database migrations...');
  
  try {
    // Run migrations in both development and production
    // Migrations are idempotent and forward-only by design
    const migrationsFolder = path.join(process.cwd(), 'migrations');
    
    await migrate(db, { 
      migrationsFolder,
      migrationsTable: '__drizzle_migrations' // Track applied migrations
    });
    
    console.log('[Migration] Database migrations completed successfully');
    
    // Verify critical tables exist
    await verifyDatabaseTables();
    
    // Run schema validation after migrations complete
    console.log('[Migration] Running schema validation...');
    const { runStartupValidations } = await import('./utils/schema-validator');
    await runStartupValidations();
    
  } catch (error) {
    console.error('[Migration] Error running migrations:', error);
    // Don't crash the app, but log the error for monitoring
    // In production, this should trigger alerts
    if (process.env.NODE_ENV === 'production') {
      console.error('[Migration] CRITICAL: Production migrations failed!');
    }
  }
}

async function verifyDatabaseTables() {
  try {
    // Verify critical audit tables exist
    const criticalTables = [
      'users',
      'roles', 
      'user_roles',
      'auth_events',
      'login_attempts',
      'user_ip_allowlist',
      'sessions'
    ];
    
    for (const table of criticalTables) {
      const result = await db.execute(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = '${table}'
        );
      `);
      
      if (!result.rows[0]?.exists) {
        console.warn(`[Migration] Warning: Table '${table}' does not exist`);
      }
    }
    
    console.log('[Migration] Database table verification completed');
  } catch (error) {
    console.error('[Migration] Error verifying tables:', error);
  }
}