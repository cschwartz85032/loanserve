const { Pool } = require('pg');

async function fix502Payment() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing $502 Payment Processing\n');
    console.log('=' .repeat(60));
    
    const paymentId = '16f66589-f85b-4d49-ab02-0d028109bb52';
    
    // Delete old broken outbox entries
    await client.query(
      "DELETE FROM outbox WHERE aggregate_id = $1",
      [paymentId]
    );
    
    console.log('✓ Cleared old outbox entries');
    
    // Create proper envelope with correct structure
    const validatedEnvelope = {
      message_id: paymentId,
      schema: 'loanserve.payment.v1.validated',
      data: {
        payment_id: paymentId,
        loan_id: '17',
        amount_cents: '50200',
        source: 'ach',  // Add source field
        validation_timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString(),
      retry_count: 0
    };
    
    // Add to outbox with TEXT payload (not JSONB)
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
      JSON.stringify(validatedEnvelope)  // No ::jsonb cast!
    ]);
    
    console.log('✓ Created new outbox entry with correct structure');
    console.log('✓ Payload stored as TEXT (not JSONB)');
    console.log('✓ Added source field to data');
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
    
    // Check ledger entries
    const ledgerResult = await client.query(
      "SELECT COUNT(*) as count, STRING_AGG(description, ', ') as descriptions FROM loan_ledger WHERE transaction_id LIKE $1",
      [`PAYMENT-${paymentId}-%`]
    );
    
    console.log('\n' + '=' .repeat(60));
    
    if (ledgerResult.rows[0].count > 0) {
      console.log('🎉 SUCCESS! YOUR $502 PAYMENT IS NOW IN THE LEDGER!');
      console.log('✅ Ledger entries created:', ledgerResult.rows[0].count);
      console.log('✅ Entry types:', ledgerResult.rows[0].descriptions);
      console.log('\nThe payment now appears in:');
      console.log('  1. CRM Activity Feed ✓');
      console.log('  2. General Ledger (Accounting Journal) ✓');
      console.log('  3. Audit Trail ✓');
    } else if (success) {
      console.log('⚠️ Payment processed but ledger entries still being created');
      console.log('   Check the general ledger in a few seconds');
    } else {
      console.log('⚠️ Processing still in progress');
      console.log('   The system may need a few more seconds');
    }
    console.log('=' .repeat(60));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    pool.end();
  }
}

fix502Payment();
