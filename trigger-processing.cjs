const { Pool } = require('pg');

async function triggerProcessing() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    // Get a validated payment
    const result = await client.query(
      "SELECT payment_id, loan_id, amount_cents, metadata FROM payment_transactions WHERE state = 'validated' LIMIT 1"
    );
    
    if (result.rows.length === 0) {
      console.log('No validated payments found');
      return;
    }
    
    const payment = result.rows[0];
    console.log('Found validated payment:', payment.payment_id);
    
    // Insert into outbox to trigger processing
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
    
    console.log('Created outbox entry:', outboxResult.rows[0].id);
    console.log('Payment should be picked up by outbox processor within 5 seconds');
    
    // Wait a bit and check if state changed
    await new Promise(resolve => setTimeout(resolve, 7000));
    
    const checkResult = await client.query(
      "SELECT state FROM payment_transactions WHERE payment_id = $1",
      [payment.payment_id]
    );
    
    console.log('Payment state after wait:', checkResult.rows[0]?.state);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    pool.end();
  }
}

triggerProcessing();
