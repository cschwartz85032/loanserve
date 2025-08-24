import * as amqp from 'amqplib';
import { v4 as uuidv4 } from 'uuid';
import * as readline from 'readline';

const CLOUDAMQP_URL = process.env.CLOUDAMQP_URL || 'amqps://dakjacqm:KVYaHXxCWleHs9tHn1uvrpWwTlpLZt-o@duck.lmq.cloudamqp.com/dakjacqm';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query: string): Promise<string> => {
  return new Promise(resolve => rl.question(query, resolve));
};

async function main() {
  console.log('[Payment Test] Starting payment test utility...\n');
  
  try {
    // Connect to RabbitMQ
    console.log('[Payment Test] Connecting to CloudAMQP...');
    const connection = await amqp.connect(CLOUDAMQP_URL);
    const channel = await connection.createChannel();
    console.log('[Payment Test] Connected successfully!\n');

    // Get loan ID
    const loanId = await question('Enter Loan ID to test payment for (e.g., 17): ');
    
    // Get payment amount
    const amountStr = await question('Enter payment amount in dollars (e.g., 500.00): ');
    const amount = parseFloat(amountStr);
    const amountCents = Math.round(amount * 100);
    
    // Get payment source
    console.log('\nPayment sources:');
    console.log('1. ACH');
    console.log('2. Wire');
    console.log('3. Check');
    console.log('4. Card');
    const sourceChoice = await question('Select payment source (1-4): ');
    
    const sources = ['ach', 'wire', 'check', 'card'];
    const source = sources[parseInt(sourceChoice) - 1] || 'ach';
    
    // Ask if this should be a partial payment test
    const testPartial = await question('\nTest partial payment rejection? (y/n): ');
    
    // Create payment envelope
    const paymentId = uuidv4();
    const externalRef = `TEST-${Date.now()}`;
    
    // Build payment data based on source
    let paymentData: any = {
      payment_id: paymentId,
      loan_id: loanId,
      source: source,
      external_ref: externalRef,
      amount_cents: amountCents,
      currency: 'USD'
    };
    
    // Add source-specific data
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
    
    console.log('\n[Payment Test] Sending payment to validation queue...');
    console.log('Payment Details:');
    console.log(`  - Payment ID: ${paymentId}`);
    console.log(`  - Loan ID: ${loanId}`);
    console.log(`  - Amount: $${amount}`);
    console.log(`  - Source: ${source.toUpperCase()}`);
    console.log(`  - Reference: ${externalRef}`);
    
    if (testPartial === 'y' || testPartial === 'Y') {
      console.log('\n⚠️  This is a PARTIAL PAYMENT TEST');
      console.log('If the loan does not accept partial payments, this payment will be rejected.');
    }
    
    // Send to validation queue
    await channel.assertExchange('payments.topic', 'topic', { durable: true });
    await channel.publish(
      'payments.topic',
      `payment.${source}.received`,
      Buffer.from(JSON.stringify(envelope)),
      { persistent: true }
    );
    
    console.log('\n✅ Payment sent to validation queue successfully!');
    console.log('\nThe payment will go through the following stages:');
    console.log('1. Validation - Check loan exists, partial payment rules, source validation');
    console.log('2. Processing - Apply payment allocation rules from loan documents');
    console.log('3. Distribution - Calculate investor distributions if applicable');
    console.log('\nYou can monitor the payment processing in:');
    console.log('- Queue Monitor > Active Queues');
    console.log('- Dead Letter Queues (if payment fails validation)');
    console.log('- Database payment_transactions table');
    
    // Option to send another test
    const another = await question('\nSend another test payment? (y/n): ');
    if (another === 'y' || another === 'Y') {
      console.log('\n-------------------\n');
      await main();
    } else {
      await connection.close();
      rl.close();
      console.log('\n[Payment Test] Test completed. Connection closed.');
    }
    
  } catch (error) {
    console.error('[Payment Test] Error:', error);
    rl.close();
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Payment Test] Shutting down...');
  rl.close();
  process.exit(0);
});

main().catch(console.error);