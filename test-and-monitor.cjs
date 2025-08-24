const { Pool } = require('pg');

async function testAndMonitor() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    // Get a validated payment
    const result = await client.query(
      "SELECT payment_id, loan_id, amount_cents FROM payment_transactions WHERE state = 'validated' LIMIT 1"
    );
    
    if (result.rows.length === 0) {
      console.log('No validated payments found');
      return;
    }
    
    const payment = result.rows[0];
    console.log('\n=== Testing Payment Processing ===');
    console.log('Payment ID:', payment.payment_id);
    console.log('Loan ID:', payment.loan_id);
    console.log('Amount:', payment.amount_cents / 100);
    
    // Clear any old outbox messages
    await client.query("DELETE FROM outbox WHERE aggregate_id = $1", [payment.payment_id]);
    
    // Create fresh outbox entry
    const outboxResult = await client.query(`
      INSERT INTO outbox (
        aggregate_type, aggregate_id, schema, routing_key, 
        payload, headers, created_at
      ) VALUES (
        'payment', $1, 'loanserve.payment.v1.validated', 'payment.validated', 
        $2, '{}', NOW()
      ) RETURNING id
    `, [
      payment.payment_id,
      JSON.stringify({
        payment_id: payment.payment_id,
        loan_id: payment.loan_id,
        amount_cents: payment.amount_cents,
        validation_timestamp: new Date().toISOString()
      })
    ]);
    
    console.log('\n✓ Created outbox entry:', outboxResult.rows[0].id);
    console.log('⏳ Message will be processed within 5 seconds...\n');
    console.log('Watch the server logs above for processing messages...');
    
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    // Check final state
    const checkResult = await client.query(
      "SELECT state FROM payment_transactions WHERE payment_id = $1",
      [payment.payment_id]
    );
    
    console.log('\n=== Result ===');
    console.log('Final payment state:', checkResult.rows[0]?.state);
    
    if (checkResult.rows[0]?.state === 'validated') {
      console.log('❌ Payment still in validated state - processing failed');
      console.log('\nCheck the server logs above for any error messages');
    } else {
      console.log('✓ Payment successfully processed!');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    pool.end();
  }
}

testAndMonitor();
