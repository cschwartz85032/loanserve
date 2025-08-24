/**
 * Payment Recovery Script
 * Recovers payments that are in CRM but not in accounting ledger
 */

import { pool } from '../db';
import { TransactionalPaymentProcessor } from '../services/transactional-payment-processor';

async function main() {
  console.log('='.repeat(60));
  console.log('PAYMENT RECOVERY PROCESS');
  console.log('='.repeat(60));
  
  try {
    // First, let's check what payments are stuck
    const checkResult = await pool.query(`
      SELECT DISTINCT
        ca.metadata->>'payment_id' as payment_id,
        ca.entity_id as loan_id,
        CAST(ca.metadata->>'amount' AS DECIMAL) as amount,
        ca.metadata->>'source' as source,
        ca.metadata->>'reference' as reference_number,
        ca.created_at
      FROM crm_activities ca
      WHERE ca.activity_type = 'payment_received'
        AND ca.created_at > NOW() - INTERVAL '24 hours'
        AND NOT EXISTS (
          SELECT 1 FROM loan_ledger ll
          WHERE ll.loan_id = CAST(ca.entity_id AS INTEGER)
            AND ll.reference_number = ca.metadata->>'reference'
            AND ll.transaction_type = 'payment'
        )
      ORDER BY ca.created_at DESC
    `);
    
    console.log(`\nFound ${checkResult.rows.length} stuck payments:`);
    for (const payment of checkResult.rows) {
      console.log(`  - Payment ${payment.payment_id}: $${payment.amount} for loan ${payment.loan_id}`);
    }
    
    if (checkResult.rows.length === 0) {
      console.log('\nNo stuck payments found. System is in sync! ✅');
      process.exit(0);
    }
    
    // Run the recovery
    console.log('\nStarting recovery process...');
    const processor = TransactionalPaymentProcessor.getInstance();
    const results = await processor.reprocessStuckPayments();
    
    console.log('\n' + '='.repeat(60));
    console.log('RECOVERY RESULTS');
    console.log('='.repeat(60));
    console.log(`✅ Successfully recovered: ${results.processed} payments`);
    console.log(`❌ Failed to recover: ${results.failed} payments`);
    
    if (results.errors.length > 0) {
      console.log('\nErrors encountered:');
      results.errors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err}`);
      });
    }
    
    // Verify the fix
    console.log('\n' + '='.repeat(60));
    console.log('VERIFICATION');
    console.log('='.repeat(60));
    
    const verifyResult = await pool.query(`
      SELECT COUNT(*) as still_stuck
      FROM crm_activities ca
      WHERE ca.activity_type = 'payment_received'
        AND ca.created_at > NOW() - INTERVAL '24 hours'
        AND NOT EXISTS (
          SELECT 1 FROM loan_ledger ll
          WHERE ll.loan_id = CAST(ca.entity_id AS INTEGER)
            AND ll.reference_number = ca.metadata->>'reference'
            AND ll.transaction_type = 'payment'
        )
    `);
    
    const stillStuck = parseInt(verifyResult.rows[0].still_stuck);
    if (stillStuck === 0) {
      console.log('✅ SUCCESS: All payments are now synchronized!');
      console.log('   CRM activity and accounting ledger are consistent.');
    } else {
      console.log(`⚠️  WARNING: ${stillStuck} payments still stuck after recovery`);
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ RECOVERY FAILED:', error);
    process.exit(1);
  }
}

// Run the recovery
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});