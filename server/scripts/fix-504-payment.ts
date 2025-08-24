/**
 * Direct fix for the stuck $504 payment
 */

import { pool } from '../db';
import { v4 as uuidv4 } from 'uuid';

async function fixStuckPayment() {
  console.log('='.repeat(60));
  console.log('FIXING STUCK $504 PAYMENT');
  console.log('='.repeat(60));
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get the stuck payment from CRM
    const crmResult = await client.query(`
      SELECT 
        id,
        loan_id,
        activity_data->>'payment_id' as payment_id,
        activity_data->>'amount' as amount,
        activity_data->>'wire_ref' as wire_ref,
        activity_data->>'effective_date' as effective_date,
        created_at
      FROM crm_activity
      WHERE id = 41
    `);
    
    if (crmResult.rows.length === 0) {
      console.log('Payment not found in CRM');
      return;
    }
    
    const payment = crmResult.rows[0];
    console.log(`\nFound payment in CRM:`);
    console.log(`  Payment ID: ${payment.payment_id}`);
    console.log(`  Amount: $${payment.amount}`);
    console.log(`  Loan ID: ${payment.loan_id}`);
    console.log(`  Wire Ref: ${payment.wire_ref}`);
    
    // Check if already in ledger
    const ledgerCheck = await client.query(`
      SELECT COUNT(*) as count
      FROM loan_ledger
      WHERE loan_id = $1
        AND transaction_id = $2
    `, [payment.loan_id, payment.wire_ref]);
    
    if (parseInt(ledgerCheck.rows[0].count) > 0) {
      console.log('\n✅ Payment already exists in ledger!');
      await client.query('COMMIT');
      return;
    }
    
    console.log('\n❌ Payment NOT in ledger - Creating ledger entry...');
    
    // Get current balance
    const balanceResult = await client.query(`
      SELECT running_balance 
      FROM loan_ledger 
      WHERE loan_id = $1 
      ORDER BY transaction_date DESC, id DESC 
      LIMIT 1
    `, [payment.loan_id]);
    
    const currentBalance = balanceResult.rows.length > 0 
      ? parseFloat(balanceResult.rows[0].running_balance) 
      : 0;
    
    const newBalance = currentBalance - parseFloat(payment.amount);
    
    // Create the ledger entry
    await client.query(`
      INSERT INTO loan_ledger (
        loan_id, transaction_date, transaction_id, description,
        transaction_type, category, credit_amount, running_balance,
        principal_balance, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      )
    `, [
      payment.loan_id,
      payment.effective_date || payment.created_at,
      payment.wire_ref,
      `Payment recovery: $${payment.amount} via WIRE`,
      'payment',
      'principal',
      parseFloat(payment.amount),
      newBalance,
      newBalance,
      'posted'
    ]);
    
    console.log(`\n✅ Created ledger entry for payment ${payment.wire_ref}`);
    
    // Log to audit
    await client.query(`
      INSERT INTO audit_logs (
        user_id, action, entity_type, entity_id,
        details, created_at
      ) VALUES (
        1, 'payment_recovery', 'payment', $1,
        $2, NOW()
      )
    `, [
      payment.payment_id,
      JSON.stringify({
        message: 'Recovered stuck payment from CRM to ledger',
        payment_id: payment.payment_id,
        amount: payment.amount,
        loan_id: payment.loan_id,
        ledger_id: ledgerId
      })
    ]);
    
    await client.query('COMMIT');
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ SUCCESS: Payment recovered and synchronized!');
    console.log('   CRM and Ledger are now consistent.');
    console.log('='.repeat(60));
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ ERROR:', error);
    throw error;
    
  } finally {
    client.release();
  }
  
  process.exit(0);
}

// Run the fix
fixStuckPayment().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});