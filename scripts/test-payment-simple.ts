import * as amqp from 'amqplib';
import { v4 as uuidv4 } from 'uuid';

const CLOUDAMQP_URL = process.env.CLOUDAMQP_URL || 'amqps://dakjacqm:KVYaHXxCWleHs9tHn1uvrpWwTlpLZt-o@duck.lmq.cloudamqp.com/dakjacqm';

async function sendTestPayment() {
  console.log('[Payment Test] Starting payment test...\n');
  
  try {
    // Connect to RabbitMQ
    console.log('[Payment Test] Connecting to CloudAMQP...');
    const connection = await amqp.connect(CLOUDAMQP_URL);
    const channel = await connection.createChannel();
    console.log('[Payment Test] Connected successfully!\n');

    // Test payment parameters (you can modify these)
    const loanId = '17';  // Change this to test different loans
    const amount = 500.00; // Payment amount in dollars
    const amountCents = Math.round(amount * 100);
    const source = 'ach'; // Can be: ach, wire, check, card
    const testPartialPayment = false; // Set to true to test with a smaller amount
    
    // Create payment ID and reference
    const paymentId = uuidv4();
    const externalRef = `TEST-${Date.now()}`;
    
    // Build payment data
    let paymentData: any = {
      payment_id: paymentId,
      loan_id: loanId,
      source: source,
      external_ref: externalRef,
      amount_cents: testPartialPayment ? Math.round(amountCents * 0.5) : amountCents, // Half payment if testing partial
      currency: 'USD'
    };
    
    // Add source-specific data for ACH
    if (source === 'ach') {
      paymentData = {
        ...paymentData,
        routing_number: '123456789',
        account_number: '987654321',
        account_type: 'checking',
        sec_code: 'WEB'
      };
    } else if (source === 'wire') {
      paymentData = {
        ...paymentData,
        sender_reference: 'WIRE-TEST-001',
        sender_bank: 'Test Bank',
        sender_account: '1234567890'
      };
    } else if (source === 'check') {
      paymentData = {
        ...paymentData,
        check_number: '1001',
        micr_line: '123456789',
        drawer_bank: 'Test Bank'
      };
    }
    
    // Create message envelope
    const envelope = {
      envelope_id: uuidv4(),
      schema: `loanserve.payment.v1.${source}`,
      producer: 'test-script',
      correlation_id: uuidv4(),
      created_at: new Date().toISOString(),
      effective_date: new Date().toISOString().split('T')[0],
      data: paymentData
    };
    
    console.log('========================================');
    console.log('SENDING TEST PAYMENT');
    console.log('========================================');
    console.log(`Payment ID:     ${paymentId}`);
    console.log(`Loan ID:        ${loanId}`);
    console.log(`Amount:         $${(paymentData.amount_cents / 100).toFixed(2)}`);
    console.log(`Source:         ${source.toUpperCase()}`);
    console.log(`Reference:      ${externalRef}`);
    console.log(`Partial Test:   ${testPartialPayment ? 'YES (50% of full payment)' : 'NO'}`);
    console.log('========================================\n');
    
    // Send to validation queue
    await channel.assertExchange('payments.topic', 'topic', { durable: true });
    await channel.publish(
      'payments.topic',
      `payment.${source}.received`,
      Buffer.from(JSON.stringify(envelope)),
      { persistent: true }
    );
    
    console.log('✅ Payment sent to validation queue successfully!\n');
    console.log('The payment will go through these stages:');
    console.log('1. VALIDATION - Checks loan exists, partial payment rules, source validation');
    console.log('2. PROCESSING - Applies payment allocation rules from loan documents');
    console.log('3. DISTRIBUTION - Calculates investor distributions if applicable\n');
    
    console.log('You can monitor the payment in:');
    console.log('• Queue Monitor > Active Queues tab');
    console.log('• Dead Letter Queues tab (if payment fails)');
    console.log('• Check the database payment_transactions table\n');
    
    console.log('Payment allocation will follow loan-specific rules:');
    console.log('• If loan has custom allocation order, it will be used');
    console.log('• Otherwise: Fees → Interest → Principal → Escrow → Unapplied');
    console.log('• Interest calculated using loan\'s specified method (360/360, Actual/365, etc.)\n');
    
    if (testPartialPayment) {
      console.log('⚠️  PARTIAL PAYMENT TEST:');
      console.log('If the loan does not accept partial payments, this will be REJECTED.\n');
    }
    
    // Send a few more test payments with different amounts
    console.log('Sending additional test payments...');
    
    // Test payment 2 - Full payment
    const payment2 = { ...envelope };
    payment2.envelope_id = uuidv4();
    payment2.data = {
      ...paymentData,
      payment_id: uuidv4(),
      external_ref: `TEST-FULL-${Date.now()}`,
      amount_cents: 126600 // Full payment amount
    };
    
    await channel.publish(
      'payments.topic',
      `payment.${source}.received`,
      Buffer.from(JSON.stringify(payment2)),
      { persistent: true }
    );
    console.log(`✅ Sent full payment: $${(payment2.data.amount_cents / 100).toFixed(2)}`);
    
    // Test payment 3 - Overpayment
    const payment3 = { ...envelope };
    payment3.envelope_id = uuidv4();
    payment3.data = {
      ...paymentData,
      payment_id: uuidv4(),
      external_ref: `TEST-OVER-${Date.now()}`,
      amount_cents: 150000 // Overpayment
    };
    
    await channel.publish(
      'payments.topic',
      `payment.${source}.received`,
      Buffer.from(JSON.stringify(payment3)),
      { persistent: true }
    );
    console.log(`✅ Sent overpayment: $${(payment3.data.amount_cents / 100).toFixed(2)}`);
    
    // Close connection
    await connection.close();
    console.log('\n[Payment Test] Test completed. Connection closed.');
    console.log('Check the Queue Monitor to see payments being processed!');
    
  } catch (error) {
    console.error('[Payment Test] Error:', error);
    process.exit(1);
  }
}

sendTestPayment().catch(console.error);