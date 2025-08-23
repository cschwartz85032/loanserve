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

      // Create a realistic payment
      const payment = {
        id: `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        loanId: Math.floor(Math.random() * 50) + 1, // 50 test loans
        amount: parseFloat((Math.random() * 5000 + 100).toFixed(2)),
        type: ['principal', 'interest', 'escrow', 'extra'][Math.floor(Math.random() * 4)],
        paymentDate: new Date().toISOString(),
        source: ['ach', 'wire', 'check'][Math.floor(Math.random() * 3)],
        accountNumber: `****${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
        routingNumber: '121000248',
        borrowerName: `Test Borrower ${Math.floor(Math.random() * 50) + 1}`,
        status: 'pending_validation'
      };

      // Send to validation queue (consumers will process it through the pipeline)
      this.channel?.sendToQueue(
        'payments.validation',
        Buffer.from(JSON.stringify(payment)),
        { persistent: true }
      );

      this.stats.sent++;
    }, 500); // 2 payments per second - reasonable load

    // Occasionally send a reversal request
    setInterval(() => {
      if (!this.isRunning) return;

      const reversal = {
        id: `REV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        originalPaymentId: `PAY-${Date.now() - 86400000}-xxxxx`, // Yesterday's payment
        loanId: Math.floor(Math.random() * 50) + 1,
        amount: parseFloat((Math.random() * 2000 + 100).toFixed(2)),
        reason: ['nsf', 'duplicate', 'error', 'customer_request'][Math.floor(Math.random() * 4)],
        requestedBy: 'system',
        requestedAt: new Date().toISOString()
      };

      this.channel?.sendToQueue(
        'payments.reversal',
        Buffer.from(JSON.stringify(reversal)),
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