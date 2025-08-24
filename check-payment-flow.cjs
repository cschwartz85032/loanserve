const { Pool } = require('pg');

async function checkPaymentFlow() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking Payment Flow for $502 Payment\n');
    console.log('=' .repeat(60));
    
    // Find the $502 payment
    const payment = await client.query(
      "SELECT * FROM payment_transactions WHERE amount_cents = 50200 ORDER BY created_at DESC LIMIT 1"
    );
    
    if (payment.rows.length > 0) {
      const p = payment.rows[0];
      console.log('✓ Payment found in database:');
      console.log('  Payment ID:', p.payment_id);
      console.log('  Loan ID:', p.loan_id);
      console.log('  Amount: $' + (p.amount_cents / 100).toFixed(2));
      console.log('  State:', p.state);
      console.log('  Source:', p.source);
      console.log('');
      
      // Check if it has ledger entries
      const ledger = await client.query(
        "SELECT COUNT(*) as count FROM loan_ledger WHERE transaction_id LIKE $1",
        [`PAYMENT-${p.payment_id}-%`]
      );
      
      console.log('Ledger entries:', ledger.rows[0].count);
      
      // Check outbox messages
      const outbox = await client.query(
        "SELECT * FROM outbox WHERE aggregate_id = $1 ORDER BY created_at DESC",
        [p.payment_id]
      );
      
      console.log('Outbox messages:', outbox.rows.length);
      
      if (outbox.rows.length > 0) {
        console.log('\nLatest outbox message:');
        const msg = outbox.rows[0];
        console.log('  Schema:', msg.schema);
        console.log('  Routing key:', msg.routing_key);
        console.log('  Payload sample:', JSON.stringify(JSON.parse(msg.payload)).substring(0, 200));
      }
      
      // Check idempotency records
      const idemp = await client.query(
        "SELECT * FROM payment_idempotency WHERE message_id = $1",
        [p.payment_id]
      );
      
      console.log('\nIdempotency records:', idemp.rows.length);
      if (idemp.rows.length > 0) {
        console.log('  Consumer:', idemp.rows[0].consumer_id);
        console.log('  Status:', idemp.rows[0].status);
        console.log('  Attempts:', idemp.rows[0].retry_count);
      }
    } else {
      console.log('❌ $502 payment not found in database');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    pool.end();
  }
}

checkPaymentFlow();
