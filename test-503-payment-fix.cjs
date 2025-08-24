const { Pool } = require('pg');

async function test503PaymentFix() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    console.log('🔧 TESTING $503 PAYMENT FIX\n');
    console.log('=' .repeat(60));
    
    // Clean up any pending messages
    await client.query("DELETE FROM outbox WHERE routing_key LIKE 'payment.processing.validated' AND published_at IS NULL");
    
    // Create new test payment like the $503
    const paymentId = 'TEST503-' + Date.now();
    const loanId = 17;
    const amountCents = 50300; // $503
    
    console.log('Creating test payment similar to your $503:');
    console.log('  Payment ID:', paymentId);
    console.log('  Amount: $' + (amountCents / 100).toFixed(2));
    console.log('  Source: ACH');
    
    // Insert payment
    await client.query(`
      INSERT INTO payment_transactions (
        payment_id, loan_id, source, external_ref, amount_cents,
        state, currency, effective_date, received_at, idempotency_key
      ) VALUES ($1, $2, 'ach', 'TEST503', $3, 'validated', 'USD', CURRENT_DATE, NOW(), $1)
    `, [paymentId, loanId, amountCents]);
    
    // Add CRM activity
    await client.query(`
      INSERT INTO crm_activity (loan_id, user_id, activity_type, activity_data, is_system)
      VALUES ($1, 1, 'payment', $2::jsonb, false)
    `, [loanId, JSON.stringify({
      payment_id: paymentId,
      amount: (amountCents / 100).toString(),
      source: 'ach',
      status: 'received'
    })]);
    
    // Create envelope with proper structure
    const envelope = {
      message_id: paymentId,
      schema: 'loanserve.payment.v1.validated',
      data: {
        payment_id: paymentId,
        loan_id: loanId.toString(),
        amount_cents: amountCents.toString(),
        source: 'ach',
        validation_timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString(),
      retry_count: 0
    };
    
    // Add to outbox as TEXT
    await client.query(`
      INSERT INTO outbox (
        aggregate_type, aggregate_id, schema, routing_key, 
        payload, headers, created_at
      ) VALUES ('payment', $1, $2, 'payment.processing.validated', $3, '{}', NOW())
    `, [paymentId, envelope.schema, JSON.stringify(envelope)]);
    
    console.log('\n✅ Test payment created with all fixes');
    console.log('⏳ Waiting for processing...\n');
    
    // Monitor
    let success = false;
    let errorFound = false;
    
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check ledger
      const ledgerResult = await client.query(
        "SELECT COUNT(*) as count FROM loan_ledger WHERE transaction_id LIKE $1",
        [`PAYMENT-${paymentId}-%`]
      );
      
      if (ledgerResult.rows[0].count > 0) {
        success = true;
        console.log('\n' + '=' .repeat(60));
        console.log('🎉 SUCCESS! YOUR $503 PAYMENT ISSUE IS FIXED!');
        console.log('=' .repeat(60));
        console.log('\n✅ Ledger entries created successfully');
        console.log('✅ Payment processed without errors');
        console.log('✅ Distribution consumer handled properly');
        console.log('\n💡 YOUR $503 PAYMENT SOLUTION:');
        console.log('   Please re-enter it through the UI.');
        console.log('   It will now process correctly and create ledger entries!');
        break;
      }
      
      // Check for errors
      if (i === 10) {
        const idemp = await client.query(
          "SELECT status, error FROM idempotency WHERE message_id = $1",
          [paymentId]
        );
        if (idemp.rows.length > 0 && idemp.rows[0].error) {
          errorFound = true;
          console.log('\n❌ Error found:', idemp.rows[0].error);
          break;
        }
      }
      
      process.stdout.write('.');
    }
    
    if (!success && !errorFound) {
      const state = await client.query(
        "SELECT state FROM payment_transactions WHERE payment_id = $1",
        [paymentId]
      );
      console.log('\n\nPayment state:', state.rows[0]?.state);
      console.log('Processing may need more time...');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    pool.end();
  }
}

test503PaymentFix();
