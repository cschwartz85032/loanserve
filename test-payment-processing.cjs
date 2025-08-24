const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function testPaymentProcessing() {
  const client = await pool.connect();
  
  try {
    console.log('Starting transaction...');
    await client.query('BEGIN');
    
    // Test the same query that's failing
    const paymentId = '01K3E99B6M6TSH63QRCANSY213';
    const fromState = 'validated';
    const toState = 'processing';
    
    console.log(`Testing updatePaymentState with paymentId: ${paymentId}`);
    
    // First, check if payment exists
    const checkResult = await client.query(
      'SELECT payment_id, state FROM payment_transactions WHERE payment_id = $1',
      [paymentId]
    );
    console.log('Payment exists:', checkResult.rows);
    
    // Try the UPDATE
    console.log('Running UPDATE...');
    const updateResult = await client.query(
      'UPDATE payment_transactions SET state = $1 WHERE payment_id = $2 AND state = $3',
      [toState, paymentId, fromState]
    );
    console.log('Update result:', updateResult.rowCount, 'rows updated');
    
    // Try the INSERT that's failing
    console.log('Running INSERT into payment_state_transitions...');
    const params = [paymentId, fromState, toState, 'system', `State changed from ${fromState} to ${toState}`];
    console.log('Parameters:', params);
    
    await client.query(`
      INSERT INTO payment_state_transitions (
        payment_id, previous_state, new_state, occurred_at, actor, reason
      ) VALUES ($1, $2, $3, NOW(), $4, $5)
    `, params);
    
    console.log('INSERT successful!');
    
    await client.query('ROLLBACK'); // Don't actually commit
    console.log('Transaction rolled back (test only)');
    
  } catch (error) {
    console.error('Error:', error);
    await client.query('ROLLBACK');
  } finally {
    client.release();
    pool.end();
  }
}

testPaymentProcessing().catch(console.error);