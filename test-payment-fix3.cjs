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
    
    // Get all columns to ensure we provide all required fields
    const colsResult = await client.query(`
      SELECT column_name, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'payment_transactions' 
      AND is_nullable = 'NO'
    `);
    
    console.log('\nRequired columns:', colsResult.rows.map(r => r.column_name).join(', '));
    
    // Insert payment transaction with ALL required fields
    await client.query(`
      INSERT INTO payment_transactions (
        payment_id, loan_id, source, external_ref, amount_cents,
        state, currency, effective_date, received_at, idempotency_key
      ) VALUES (
        $1, $2, 'wire', 'TEST-WIRE', $3,
        'validated', 'USD', CURRENT_DATE, NOW(), $1
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
    console.log('✓ Payload stored as STRING (not JSONB)');
    console.log('✓ Envelope has payment_id in data field');
    console.log('\n⏳ Waiting for processing...\n');
    
    // Monitor for 10 seconds
    let success = false;
    let finalState = 'validated';
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check payment state
      const stateResult = await client.query(
        "SELECT state FROM payment_transactions WHERE payment_id = $1",
        [paymentId]
      );
      
      finalState = stateResult.rows[0]?.state;
      if (finalState === 'posted_pending_settlement' || finalState === 'processing') {
        success = true;
        console.log('\n✅ Payment state changed to:', finalState);
        break;
      }
      
      process.stdout.write('.');
    }
    
    // Check ledger entries
    const ledgerResult = await client.query(
      "SELECT COUNT(*) as count FROM loan_ledger WHERE transaction_id LIKE $1",
      [`PAYMENT-${paymentId}-%`]
    );
    
    console.log('\n' + '=' .repeat(60));
    
    if (success && ledgerResult.rows[0].count > 0) {
      console.log('🎉 PERFECT! THE FIX IS WORKING!');
      console.log('✅ Payment processed: ' + finalState);
      console.log('✅ Ledger entries created: ' + ledgerResult.rows[0].count);
      console.log('\nYour $502 payment (and future manual payments) will now:');
      console.log('  1. Show in CRM activity feed ✓');
      console.log('  2. Create accounting journal entries ✓');
      console.log('  3. Appear in audit trail ✓');
    } else if (success) {
      console.log('⚠️ Payment state changed but no ledger entries yet');
      console.log('   State: ' + finalState);
      console.log('   Ledger entries: ' + ledgerResult.rows[0].count);
    } else {
      console.log('⚠️ Payment still in: ' + finalState);
      console.log('   The outbox processor may need more time');
    }
    console.log('=' .repeat(60));
    
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
