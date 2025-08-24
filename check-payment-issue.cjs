const { Pool } = require('pg');

async function checkPaymentIssue() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    console.log('🔍 Investigating $502 Payment Processing Issue\n');
    console.log('=' .repeat(60));
    
    // Get table structure first
    const cols = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'payment_transactions'"
    );
    
    const hasCreatedAt = cols.rows.some(r => r.column_name === 'created_at');
    const orderBy = hasCreatedAt ? 'created_at' : 'payment_id';
    
    // Find the $502 payment
    const payment = await client.query(
      `SELECT * FROM payment_transactions WHERE amount_cents = 50200 ORDER BY ${orderBy} DESC LIMIT 1`
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
      
      // Check outbox for validation message
      const validationOutbox = await client.query(
        "SELECT * FROM outbox WHERE aggregate_id = $1 AND schema LIKE '%validated%' ORDER BY id DESC LIMIT 1",
        [p.payment_id]
      );
      
      if (validationOutbox.rows.length > 0) {
        const msg = validationOutbox.rows[0];
        console.log('📨 Validation message in outbox:');
        const payload = JSON.parse(msg.payload);
        
        // Check the payload structure
        console.log('  Payload type:', typeof payload);
        console.log('  Top-level keys:', Object.keys(payload).join(', '));
        
        // The issue: payment_id might be nested or missing
        if (payload.payment_id) {
          console.log('  ✓ payment_id at top level:', payload.payment_id);
        } else if (payload.data?.payment_id) {
          console.log('  ✓ payment_id in data:', payload.data.payment_id);
        } else {
          console.log('  ❌ payment_id MISSING from payload!');
          console.log('  Full payload:', JSON.stringify(payload, null, 2));
        }
      }
      
      // Check processing errors
      const idemp = await client.query(
        "SELECT * FROM payment_idempotency WHERE message_id = $1 AND consumer_id = 'payment-processing'",
        [p.payment_id]
      );
      
      if (idemp.rows.length > 0 && idemp.rows[0].error) {
        console.log('\n❌ Processing error found:');
        console.log(idemp.rows[0].error);
      }
      
      // Check ledger entries
      const ledger = await client.query(
        "SELECT COUNT(*) as count FROM loan_ledger WHERE transaction_id LIKE $1",
        [`PAYMENT-${p.payment_id}-%`]
      );
      
      console.log('\n📊 LEDGER STATUS:');
      console.log('  Entries created:', ledger.rows[0].count);
      
      if (ledger.rows[0].count === 0) {
        console.log('  ❌ NO LEDGER ENTRIES - Payment not processed!');
        console.log('\nROOT CAUSE: Payment validation message has wrong structure');
        console.log('The payment_id is not being passed correctly to the processing consumer');
      }
      
    } else {
      console.log('❌ $502 payment not found');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    pool.end();
  }
}

checkPaymentIssue();
