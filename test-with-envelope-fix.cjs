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
    console.log('\n🎯 Testing Payment Processing with Fixed Envelope');
    console.log('=' .repeat(50));
    console.log('Payment ID:', payment.payment_id);
    console.log('Loan ID:', payment.loan_id);
    console.log('Amount: $' + (payment.amount_cents / 100).toFixed(2));
    
    // Clear any old outbox messages
    await client.query("DELETE FROM outbox WHERE aggregate_id = $1", [payment.payment_id]);
    
    // Create outbox entry with correct routing key pattern (3 segments)
    const outboxResult = await client.query(`
      INSERT INTO outbox (
        aggregate_type, aggregate_id, schema, routing_key, 
        payload, headers, created_at
      ) VALUES (
        'payment', $1, 'loanserve.payment.v1.validated', 'payment.processing.validated', 
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
    
    console.log('\n✓ Created outbox entry #' + outboxResult.rows[0].id);
    console.log('  Routing key: payment.processing.validated (matches pattern payment.*.validated)');
    console.log('\n⏳ Waiting for processing...\n');
    
    // Monitor state changes
    let lastState = 'validated';
    let checkCount = 0;
    
    for (let i = 0; i < 15; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      checkCount++;
      
      const checkResult = await client.query(
        "SELECT state FROM payment_transactions WHERE payment_id = $1",
        [payment.payment_id]
      );
      
      const newState = checkResult.rows[0]?.state;
      
      if (newState !== lastState) {
        console.log(`✅ State changed: ${lastState} → ${newState}`);
        lastState = newState;
        
        if (newState === 'posted_pending_settlement' || newState === 'settled') {
          // Check ledger entries
          const ledgerResult = await client.query(
            "SELECT COUNT(*) as count FROM loan_ledger WHERE transaction_id LIKE $1",
            [`PAYMENT-${payment.payment_id}-%`]
          );
          
          console.log('\n🎉 SUCCESS! Payment fully processed!');
          console.log('  Final state:', newState);
          console.log('  Ledger entries created:', ledgerResult.rows[0].count);
          
          // Check loan balance update
          const loanResult = await client.query(
            "SELECT principal_balance FROM loans WHERE id = $1",
            [payment.loan_id]
          );
          console.log('  Updated principal balance: $' + parseFloat(loanResult.rows[0].principal_balance).toFixed(2));
          
          break;
        }
      }
      
      if (i % 3 === 0) {
        process.stdout.write('.');
      }
    }
    
    if (lastState === 'validated') {
      console.log(`\n❌ Payment still stuck in validated state after ${checkCount} checks`);
      console.log('Check the server logs above for any error messages');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    pool.end();
  }
}

testPaymentProcessing();
