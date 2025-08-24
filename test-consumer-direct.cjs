const { Pool } = require('pg');

async function testConsumerDirectly() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    // Start a transaction
    await client.query('BEGIN');
    
    // Update payment state to processing
    const updateResult = await client.query(
      "UPDATE payment_transactions SET state = 'processing' WHERE payment_id = '01K3E8QFPN6PHMDZYEGC0EG03Z' RETURNING *"
    );
    console.log('Updated payment state:', updateResult.rows[0]?.state);
    
    // Try the allocation query with correct columns
    const balanceResult = await client.query(`
      SELECT 
        COALESCE(principal_balance, 0) as scheduled_principal
      FROM loans
      WHERE id = 17
    `);
    console.log('Principal balance:', balanceResult.rows[0]);
    
    // Check interest accruals
    const interestResult = await client.query(`
      SELECT COALESCE(SUM(accrued_amount), 0) as accrued_interest
      FROM interest_accruals
      WHERE loan_id = 17
    `);
    console.log('Accrued interest:', interestResult.rows[0]);
    
    // Check late fees
    const feeResult = await client.query(`
      SELECT COALESCE(SUM(fee_amount), 0) as late_fees
      FROM loan_fees
      WHERE loan_id = 17 AND fee_type = 'late_fee'
    `);
    console.log('Late fees:', feeResult.rows[0]);
    
    // Check escrow
    const escrowResult = await client.query(`
      SELECT 
        COALESCE(shortage_amount, 0) as shortage,
        COALESCE(target_balance - current_balance, 0) as current_due
      FROM escrow_accounts
      WHERE loan_id = 17
    `);
    console.log('Escrow accounts:', escrowResult.rows.length, 'rows');
    
    // Check if loan_ledger table exists and structure
    const ledgerCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'loan_ledger' 
      ORDER BY ordinal_position
      LIMIT 5
    `);
    console.log('Loan ledger columns:', ledgerCheck.rows);
    
    await client.query('ROLLBACK');
    console.log('Transaction rolled back');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error.message);
    console.error('Error code:', error.code);
    console.error('Error detail:', error.detail);
  } finally {
    client.release();
    pool.end();
  }
}

testConsumerDirectly();
