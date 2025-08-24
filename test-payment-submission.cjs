const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const { ulid } = require('ulid');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function submitTestPayment() {
  const paymentId = ulid();
  const loanId = '17';
  const amountCents = 75200; // $752.00
  const effectiveDate = '2025-08-24';
  const source = 'check';
  const externalRef = 'TEST-OUTBOX-' + Date.now();
  
  try {
    // Insert payment transaction
    await pool.query(`
      INSERT INTO payment_transactions (
        payment_id, loan_id, source, state, amount_cents, currency,
        external_ref, received_at, effective_date, created_by, idempotency_key
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, NOW(), $8::date, $9, $10
      )
    `, [paymentId, loanId, source, 'validated', amountCents, 'USD', 
        externalRef, effectiveDate, 'test-script', paymentId]);
    
    // Create validated envelope
    const envelope = {
      message_id: ulid(),
      schema: 'loanserve.payment.v1.validated',
      producer: 'test-script',
      correlation_id: ulid(),
      occurred_at: new Date().toISOString(),
      effective_date: effectiveDate,
      data: {
        payment_id: paymentId,
        loan_id: loanId,
        source: source,
        external_ref: externalRef,
        amount_cents: amountCents,
        currency: 'USD',
        check_number: '999999',
        validation_timestamp: new Date().toISOString()
      }
    };
    
    // Add to outbox
    await pool.query(`
      INSERT INTO outbox (
        aggregate_type, aggregate_id, schema, routing_key, 
        payload, headers, created_at
      )
      VALUES (
        $1, $2, $3, $4, $5::jsonb, $6::jsonb, NOW()
      )
    `, [
      'payment',
      paymentId,
      envelope.schema,
      'payment.check.validated',
      JSON.stringify(envelope),
      JSON.stringify({
        'x-message-id': envelope.message_id,
        'x-correlation-id': envelope.correlation_id,
        'x-idempotency-key': paymentId
      })
    ]);
    
    console.log('Test payment created:');
    console.log('- Payment ID:', paymentId);
    console.log('- Amount: $752.00');
    console.log('- Added to outbox for processing');
    console.log('- Waiting for outbox processor to pick it up...');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

submitTestPayment();