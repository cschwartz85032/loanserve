#!/usr/bin/env tsx

/**
 * Run Phase 4 migration directly
 */

import { db } from '../db';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  const migrationPath = path.join(process.cwd(), 'migrations/0030_phase4_documents_notices.sql');
  
  try {
    console.log('[Migration] Reading migration file...');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('[Migration] Running Phase 4 migration...');
    await db.execute(sql);
    
    console.log('[Migration] ✅ Phase 4 migration completed successfully');
    console.log('[Migration] Added tables:');
    console.log('  - document_template');
    console.log('  - document_artifact');
    console.log('  - notice_template_v2');
    console.log('  - notice_schedule');
    console.log('  - lender_entity');
    
  } catch (error) {
    console.error('[Migration] ❌ Error running migration:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

runMigration().catch(console.error);