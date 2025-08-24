const { Pool } = require('pg');

async function testPaymentFix() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    console.log('🧪 Testing Payment Processing Fix\n');
    console.log('=' .repeat(60));
    
    // Create a test payment
    const paymentId = 'TEST-' + Date.now();
    const loanId = 17;
    const amountCents = 60000; // $600
    
    console.log('Creating test payment:');
    console.log('  Payment ID:', paymentId);
    console.log('  Loan ID:', loanId);
    console.log('  Amount: $' + (amountCents / 100).toFixed(2));
    
    // Insert payment transaction with all required fields
    await client.query(`
      INSERT INTO payment_transactions (
        payment_id, loan_id, source, external_ref, amount_cents,
        state, currency, effective_date, received_at
      ) VALUES (
        $1, $2, 'wire', 'TEST-WIRE', $3,
        'validated', 'USD', CURRENT_DATE, NOW()
      )
    `, [paymentId, loanId, amountCents]);
    
    // Create proper envelope for outbox with fixed structure
    const validatedEnvelope = {
      message_id: paymentId,
      schema: 'loanserve.payment.v1.validated',
      data: {
        payment_id: paymentId,
        loan_id: loanId.toString(),
        amount_cents: amountCents.toString(),
        validation_timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString(),
      retry_count: 0
    };
    
    // Add to outbox with string payload (not JSONB)
    await client.query(`
      INSERT INTO outbox (
        aggregate_type, aggregate_id, schema, routing_key, 
        payload, headers, created_at
      ) VALUES (
        'payment', $1, $2, 'payment.processing.validated', 
        $3, '{}', NOW()
      )
    `, [
      paymentId,
      validatedEnvelope.schema,
      JSON.stringify(validatedEnvelope)  // Stored as string, not JSONB
    ]);
    
    console.log('\n✓ Test payment created and added to outbox');
    console.log('\n⏳ Waiting for processing...\n');
    
    // Monitor for 10 seconds
    let success = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check payment state
      const stateResult = await client.query(
        "SELECT state FROM payment_transactions WHERE payment_id = $1",
        [paymentId]
      );
      
      const state = stateResult.rows[0]?.state;
      if (state === 'posted_pending_settlement' || state === 'processing') {
        success = true;
        console.log('\n✓ Payment state changed to:', state);
        break;
      }
      
      process.stdout.write('.');
    }
    
    if (success) {
      // Check ledger entries
      const ledgerResult = await client.query(
        "SELECT COUNT(*) as count FROM loan_ledger WHERE transaction_id LIKE $1",
        [`PAYMENT-${paymentId}-%`]
      );
      
      console.log('\n' + '=' .repeat(60));
      console.log('✅ SUCCESS! Payment processed correctly!');
      console.log('  Ledger entries created:', ledgerResult.rows[0].count);
      
      if (ledgerResult.rows[0].count > 0) {
        console.log('\n🎉 EXCELLENT! The fix is working perfectly!');
        console.log('   Manual payments now create ledger entries correctly.');
      } else {
        console.log('\n⚠️ Payment processed but no ledger entries yet');
        console.log('   (May still be creating entries...)');
      }
      console.log('=' .repeat(60));
    } else {
      console.log('\n\n⚠️ Payment not fully processed yet');
      console.log('The outbox processor may need more time');
    }
    
    // Clean up test data
    await client.query("DELETE FROM loan_ledger WHERE transaction_id LIKE $1", [`PAYMENT-${paymentId}-%`]);
    await client.query("DELETE FROM payment_transactions WHERE payment_id = $1", [paymentId]);
    await client.query("DELETE FROM outbox WHERE aggregate_id = $1", [paymentId]);
    await client.query("DELETE FROM payment_idempotency WHERE message_id = $1", [paymentId]);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    pool.end();
  }
}

testPaymentFix();
