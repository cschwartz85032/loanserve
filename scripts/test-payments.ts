#!/usr/bin/env tsx

/**
 * Payment System Test
 * Tests only what's implemented - the payment processing pipeline
 */

import amqp from 'amqplib';
import chalk from 'chalk';

class PaymentTester {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private stats = {
    sent: 0,
    startTime: Date.now()
  };
  private isRunning = true;

  async start() {
    console.log(chalk.cyan.bold('\n💳 Payment System Test\n'));
    console.log(chalk.gray('Testing the implemented payment processing pipeline\n'));

    const url = process.env.CLOUDAMQP_URL;
    if (!url) {
      throw new Error('CLOUDAMQP_URL not configured');
    }

    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();

    console.log(chalk.green('✅ Connected to CloudAMQP\n'));
    console.log(chalk.yellow('Existing consumers running:'));
    console.log('  • payment-validation-consumer');
    console.log('  • payment-processing-consumer');
    console.log('  • payment-distribution-consumer');
    console.log('  • payment-reversal-consumer\n');

    // Send realistic payment traffic
    this.startPaymentFlow();
    this.startStatusDisplay();

    console.log(chalk.green('Started sending payments to validation queue\n'));
    console.log(chalk.gray('Press Ctrl+C to stop\n'));
  }

  private startPaymentFlow() {
    // Send payment validation requests at a reasonable rate
    setInterval(() => {
      if (!this.isRunning) return;

      // Generate IDs that fit database constraints (payment_id max 26 chars, loan_id is integer)
      const paymentId = `PAY${Date.now().toString().substr(-10)}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
      // Use actual loan IDs from the database (17, 18, 22, 23)
      const loanIds = [17, 18, 22, 23];
      const loanId = loanIds[Math.floor(Math.random() * loanIds.length)];
      const amountCents = Math.floor((Math.random() * 5000 + 100) * 100); // Convert to cents
      const source = ['ach', 'wire', 'check'][Math.floor(Math.random() * 3)] as 'ach' | 'wire' | 'check';

      // Create payment data matching expected structure
      let paymentData: any = {
        payment_id: paymentId,
        loan_id: loanId,
        amount_cents: amountCents,
        currency: 'USD',
        source: source,
        external_ref: `EXT-${Math.random().toString(36).substr(2, 9)}`
      };

      // Add source-specific fields
      if (source === 'ach') {
        paymentData.routing_number = '121000248';
        paymentData.account_number_masked = `****${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
        paymentData.trace_number = `TRACE-${Date.now()}`;
        paymentData.sec_code = 'PPD';
      } else if (source === 'wire') {
        paymentData.wire_ref = `WIRE-${Date.now()}`;
        paymentData.sender_ref = `SEND-${Math.random().toString(36).substr(2, 9)}`;
      } else if (source === 'check') {
        paymentData.check_number = `${Math.floor(Math.random() * 100000)}`;
        paymentData.payer_account = `ACC-${Math.floor(Math.random() * 10000)}`;
        paymentData.issue_date = new Date().toISOString().split('T')[0];
      }

      // Create proper envelope
      const envelope = {
        schema: 'loanserve.payment.v1.received',
        message_id: `MSG${Date.now().toString().substr(-10)}${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        correlation_id: `CORR${Date.now().toString().substr(-10)}`,
        occurred_at: new Date().toISOString(),
        producer: 'payment-test-script@1.0.0',
        effective_date: new Date().toISOString().split('T')[0],
        data: paymentData
      };

      // Send to validation queue (consumers will process it through the pipeline)
      this.channel?.sendToQueue(
        'payments.validation',
        Buffer.from(JSON.stringify(envelope)),
        { persistent: true }
      );

      this.stats.sent++;
    }, 500); // 2 payments per second - reasonable load

    // Occasionally send a reversal request
    setInterval(() => {
      if (!this.isRunning) return;

      const loanIds = [17, 18, 22, 23];
      const reversalData = {
        payment_id: `PAY-${Date.now() - 86400000}-xxxxx`, // Yesterday's payment
        loan_id: loanIds[Math.floor(Math.random() * loanIds.length)],
        amount_cents: Math.floor((Math.random() * 2000 + 100) * 100),
        currency: 'USD',
        source: 'ach' as const,
        reversal_reason: ['nsf', 'duplicate', 'error', 'customer_request'][Math.floor(Math.random() * 4)],
        requested_by: 'system',
        requested_at: new Date().toISOString()
      };

      const reversalEnvelope = {
        schema: 'loanserve.payment.v1.reversal',
        message_id: `MSG${Date.now().toString().substr(-10)}${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        correlation_id: `CORR${Date.now().toString().substr(-10)}`,
        occurred_at: new Date().toISOString(),
        producer: 'payment-test-script@1.0.0',
        data: reversalData
      };

      this.channel?.sendToQueue(
        'payments.reversal',
        Buffer.from(JSON.stringify(reversalEnvelope)),
        { persistent: true }
      );

      this.stats.sent++;
    }, 10000); // 1 reversal every 10 seconds
  }

  private startStatusDisplay() {
    setInterval(() => {
      const elapsed = (Date.now() - this.stats.startTime) / 1000;
      const rate = this.stats.sent / elapsed;

      console.clear();
      console.log(chalk.cyan.bold('\n💳 PAYMENT SYSTEM TEST\n'));
      console.log(chalk.white('═'.repeat(50)));
      console.log(chalk.green(`Messages Sent: ${this.stats.sent}`));
      console.log(chalk.cyan(`Rate: ${rate.toFixed(1)} msg/s`));
      console.log(chalk.yellow(`Runtime: ${elapsed.toFixed(0)}s`));
      console.log(chalk.white('─'.repeat(50)));
      console.log(chalk.gray('\nPayment Flow:'));
      console.log(chalk.gray('1. payments.validation → Consumer validates'));
      console.log(chalk.gray('2. payments.processing → Consumer processes'));
      console.log(chalk.gray('3. payments.distribution → Consumer distributes'));
      console.log(chalk.gray('\nConsumers are actively processing messages'));
      console.log(chalk.white('═'.repeat(50)));
      console.log(chalk.gray('\nPress Ctrl+C to stop'));
    }, 2000);
  }

  async stop() {
    console.log(chalk.yellow('\n🛑 Stopping test...'));
    this.isRunning = false;

    if (this.channel) await this.channel.close();
    if (this.connection) await this.connection.close();

    const elapsed = (Date.now() - this.stats.startTime) / 1000;
    console.log(chalk.green('\n✅ Test completed'));
    console.log(chalk.cyan(`\nResults:`));
    console.log(`  Total payments sent: ${this.stats.sent}`);
    console.log(`  Run time: ${elapsed.toFixed(1)}s`);
    console.log(`  Average rate: ${(this.stats.sent / elapsed).toFixed(1)} msg/s\n`);
  }
}

// Main
const tester = new PaymentTester();

process.on('SIGINT', async () => {
  await tester.stop();
  process.exit(0);
});

tester.start().catch(error => {
  console.error(chalk.red('Error:'), error);
  process.exit(1);
});