const { Pool } = require('pg');

async function checkPaymentFlow() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking Payment Flow for $502 Payment\n');
    console.log('=' .repeat(60));
    
    // Find the $502 payment
    const payment = await client.query(
      "SELECT * FROM payment_transactions WHERE amount_cents = 50200 ORDER BY submission_time DESC LIMIT 1"
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
      
      console.log('📊 Ledger entries created:', ledger.rows[0].count);
      
      // Check outbox messages for this payment
      const outbox = await client.query(
        "SELECT * FROM outbox WHERE aggregate_id = $1 ORDER BY created_at DESC",
        [p.payment_id]
      );
      
      console.log('📨 Outbox messages:', outbox.rows.length);
      
      if (outbox.rows.length > 0) {
        console.log('\nLatest outbox message:');
        const msg = outbox.rows[0];
        console.log('  Schema:', msg.schema);
        console.log('  Routing key:', msg.routing_key);
        const payload = JSON.parse(msg.payload);
        console.log('  Has payment_id?:', payload.payment_id ? 'YES' : 'NO');
        console.log('  Has data.payment_id?:', payload.data?.payment_id ? 'YES' : 'NO');
        console.log('  Payload structure:', Object.keys(payload).join(', '));
        if (payload.data) {
          console.log('  Data structure:', Object.keys(payload.data).join(', '));
        }
      }
      
      // Check idempotency records
      const idemp = await client.query(
        "SELECT * FROM payment_idempotency WHERE message_id = $1",
        [p.payment_id]
      );
      
      console.log('\n🔄 Processing status:');
      if (idemp.rows.length > 0) {
        console.log('  Consumer:', idemp.rows[0].consumer_id);
        console.log('  Status:', idemp.rows[0].status);
        console.log('  Attempts:', idemp.rows[0].retry_count);
        if (idemp.rows[0].error) {
          console.log('  Error:', idemp.rows[0].error);
        }
      } else {
        console.log('  Not yet processed by any consumer');
      }
      
      console.log('\n❌ ISSUE FOUND: Payment is stuck in "' + p.state + '" state');
      console.log('   Expected flow: received → validated → processing → posted');
      
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
