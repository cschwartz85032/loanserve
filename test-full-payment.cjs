const { Pool } = require('pg');

async function testPaymentProcessing() {
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
    console.log('Testing payment:', payment.payment_id);
    console.log('Loan ID:', payment.loan_id);
    console.log('Amount:', payment.amount_cents / 100);
    
    // Create outbox entry to trigger processing
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
    console.log('Waiting for processing...');
    
    // Wait for processing
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const checkResult = await client.query(
        "SELECT state FROM payment_transactions WHERE payment_id = $1",
        [payment.payment_id]
      );
      
      const newState = checkResult.rows[0]?.state;
      console.log(`Check ${i+1}: State is ${newState}`);
      
      if (newState !== 'validated') {
        console.log('✓ Payment state changed to:', newState);
        
        // Check if ledger entries were created
        const ledgerResult = await client.query(
          "SELECT COUNT(*) as count FROM loan_ledger WHERE transaction_id LIKE $1",
          [`PAYMENT-${payment.payment_id}-%`]
        );
        console.log('✓ Ledger entries created:', ledgerResult.rows[0].count);
        
        break;
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    pool.end();
  }
}

testPaymentProcessing();
