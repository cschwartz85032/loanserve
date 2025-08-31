/**
 * Phase 10 Migration Runner
 * Executes Phase 10 database migrations in order
 */

import { pool } from '../db';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const migrations = [
  '0010_phase10_extensions.sql',
  '0011_phase10_rbac_abac.sql', 
  '0012_phase10_immutable_audit.sql',
  '0013_phase10_document_store.sql',
  '0014_phase10_consent_mgmt.sql',
  '0015_phase10_retention_policies.sql',
  '0016_phase10_encryption_keys.sql'
];

interface MigrationResult {
  name: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
  executionTime?: number;
}

async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  const results: MigrationResult[] = [];

  try {
    console.log('🚀 Starting Phase 10 database migrations...\n');

    // Create migration tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS phase10_migrations (
        migration_name TEXT PRIMARY KEY,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        execution_time_ms INTEGER,
        checksum TEXT
      )
    `);

    for (const migration of migrations) {
      const startTime = Date.now();
      
      try {
        console.log(`📄 Processing ${migration}...`);

        // Check if migration already executed
        const existingResult = await client.query(
          'SELECT migration_name FROM phase10_migrations WHERE migration_name = $1',
          [migration]
        );

        if (existingResult.rows.length > 0) {
          console.log(`⏭️  Skipping ${migration} (already executed)`);
          results.push({
            name: migration,
            status: 'skipped',
            message: 'Already executed'
          });
          continue;
        }

        // Read migration file
        const migrationPath = join(__dirname, '../../db/migrations', migration);
        const migrationSql = readFileSync(migrationPath, 'utf-8');

        // Calculate checksum
        const checksum = createHash('sha256').update(migrationSql).digest('hex');

        // Execute migration in transaction
        await client.query('BEGIN');
        
        try {
          await client.query(migrationSql);
          
          // Record successful migration
          await client.query(
            `INSERT INTO phase10_migrations (migration_name, execution_time_ms, checksum) 
             VALUES ($1, $2, $3)`,
            [migration, Date.now() - startTime, checksum]
          );
          
          await client.query('COMMIT');

          const executionTime = Date.now() - startTime;
          console.log(`✅ Completed ${migration} (${executionTime}ms)`);
          
          results.push({
            name: migration,
            status: 'success',
            message: 'Executed successfully',
            executionTime
          });
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      } catch (error) {
        const executionTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        console.error(`❌ Failed ${migration}: ${errorMessage}`);
        
        results.push({
          name: migration,
          status: 'error',
          message: errorMessage,
          executionTime
        });

        // Continue with other migrations instead of stopping
        console.log('⚠️  Continuing with remaining migrations...\n');
      }
    }

    // Print summary
    console.log('\n📊 Migration Summary:');
    console.log('─'.repeat(60));
    
    const successful = results.filter(r => r.status === 'success');
    const skipped = results.filter(r => r.status === 'skipped');
    const failed = results.filter(r => r.status === 'error');

    console.log(`✅ Successful: ${successful.length}`);
    console.log(`⏭️  Skipped: ${skipped.length}`);
    console.log(`❌ Failed: ${failed.length}`);

    if (successful.length > 0) {
      console.log('\n✅ Successfully executed:');
      successful.forEach(result => {
        console.log(`   ${result.name} (${result.executionTime}ms)`);
      });
    }

    if (failed.length > 0) {
      console.log('\n❌ Failed migrations:');
      failed.forEach(result => {
        console.log(`   ${result.name}: ${result.message}`);
      });
    }

    // Verify Phase 10 installation
    await verifyPhase10Installation(client);

    console.log('\n🎉 Phase 10 migration process completed!');
    
    if (failed.length > 0) {
      console.log('⚠️  Some migrations failed. Please review the errors above.');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n💥 Migration process failed:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

/**
 * Verify Phase 10 installation
 */
async function verifyPhase10Installation(client: any): Promise<void> {
  console.log('\n🔍 Verifying Phase 10 installation...');

  const checks = [
    {
      name: 'Extensions',
      query: "SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto', 'uuid-ossp')",
      expected: 2
    },
    {
      name: 'Security Tables',
      query: "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'security_%' AND table_schema = 'public'",
      expected: 6
    },
    {
      name: 'Audit Tables', 
      query: "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'phase10_audit%' AND table_schema = 'public'",
      expected: 2
    },
    {
      name: 'Document Tables',
      query: "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'phase10_%document%' AND table_schema = 'public'",
      expected: 4
    },
    {
      name: 'Consent Tables',
      query: "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'phase10_%consent%' OR table_name LIKE 'phase10_%communication%' AND table_schema = 'public'",
      expected: 3
    },
    {
      name: 'Retention Tables',
      query: "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'phase10_%retention%' OR table_name LIKE 'phase10_%deletion%' OR table_name LIKE 'phase10_%legal%' AND table_schema = 'public'",
      expected: 4
    },
    {
      name: 'Audit Functions',
      query: "SELECT routine_name FROM information_schema.routines WHERE routine_name IN ('add_phase10_audit_event', 'verify_audit_chain') AND routine_schema = 'public'",
      expected: 2
    },
    {
      name: 'Consent Functions',
      query: "SELECT routine_name FROM information_schema.routines WHERE routine_name IN ('grant_consent', 'revoke_consent') AND routine_schema = 'public'",
      expected: 2
    }
  ];

  let allChecksPass = true;

  for (const check of checks) {
    try {
      const result = await client.query(check.query);
      const actual = result.rows.length;
      
      if (actual >= check.expected) {
        console.log(`   ✅ ${check.name}: ${actual}/${check.expected}`);
      } else {
        console.log(`   ❌ ${check.name}: ${actual}/${check.expected} (insufficient)`);
        allChecksPass = false;
      }
    } catch (error) {
      console.log(`   ❌ ${check.name}: Error checking - ${error}`);
      allChecksPass = false;
    }
  }

  if (allChecksPass) {
    console.log('\n✅ Phase 10 verification passed! All components are properly installed.');
  } else {
    console.log('\n⚠️  Phase 10 verification found issues. Some components may not be fully functional.');
  }
}

// Run migrations automatically (ESM compatible)
runMigrations().catch(console.error);

export { runMigrations };