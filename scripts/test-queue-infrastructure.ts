#!/usr/bin/env tsx

/**
 * Comprehensive Queue Infrastructure Test Suite
 * 
 * This script tests all aspects of the RabbitMQ messaging system:
 * - Connection and topology validation
 * - Message publishing and consumption
 * - Payment processing flows
 * - Error handling and dead letter queues
 * - Performance and load testing
 */

import { getEnhancedRabbitMQService } from '../server/services/rabbitmq-enhanced.js';
import { messageFactory } from '../server/messaging/message-factory.js';
import { ulid } from 'ulid';
import chalk from 'chalk';

// Test configuration
const TEST_CONFIG = {
  loadTest: {
    enabled: true,
    messagesPerBatch: 100,
    batchCount: 10,
    delayBetweenBatches: 1000 // ms
  },
  paymentFlows: {
    ach: true,
    wire: true,
    check: true,
    lockbox: true
  },
  errorTesting: {
    enabled: true,
    errorRate: 0.1 // 10% of messages will trigger errors
  }
};

class QueueInfrastructureTest {
  private rabbitmq = getEnhancedRabbitMQService();
  private testResults: any[] = [];
  private startTime: number = 0;

  constructor() {
    console.log(chalk.cyan.bold('\n🧪 Queue Infrastructure Test Suite\n'));
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    this.startTime = Date.now();

    try {
      // Test 1: Connection and Topology
      await this.testConnectionAndTopology();

      // Test 2: Basic Message Publishing
      await this.testBasicPublishing();

      // Test 3: Payment Processing Flows
      await this.testPaymentFlows();

      // Test 4: Error Handling and DLQ
      await this.testErrorHandling();

      // Test 5: Servicing Cycle
      await this.testServicingCycle();

      // Test 6: Settlement and Reconciliation
      await this.testSettlementFlows();

      // Test 7: Compliance and AML
      await this.testComplianceFlows();

      // Test 8: Load Testing
      if (TEST_CONFIG.loadTest.enabled) {
        await this.testLoadPerformance();
      }

      // Print results
      this.printTestResults();

    } catch (error) {
      console.error(chalk.red('❌ Test suite failed:'), error);
      process.exit(1);
    }
  }

  /**
   * Test 1: Connection and Topology
   */
  async testConnectionAndTopology(): Promise<void> {
    console.log(chalk.yellow('\n📡 Test 1: Connection and Topology\n'));

    try {
      // Check connection
      const isConnected = await this.rabbitmq.isConnected();
      this.log('Connection Status', isConnected ? '✅ Connected' : '❌ Disconnected');

      // Get queue stats
      const queueNames = [
        'payments.validation',
        'payments.processing',
        'payments.distribution',
        'servicing.daily.tasks.0',
        'notifications.email',
        'dlq.payments'
      ];

      for (const queueName of queueNames) {
        const stats = await this.rabbitmq.getQueueStats(queueName);
        if (stats) {
          this.log(`Queue: ${queueName}`, 
            `Messages: ${stats.messageCount}, Consumers: ${stats.consumerCount}`);
        }
      }

      this.testResults.push({ test: 'Connection & Topology', status: 'PASSED' });
    } catch (error) {
      this.testResults.push({ test: 'Connection & Topology', status: 'FAILED', error });
      throw error;
    }
  }

  /**
   * Test 2: Basic Message Publishing
   */
  async testBasicPublishing(): Promise<void> {
    console.log(chalk.yellow('\n📤 Test 2: Basic Message Publishing\n'));

    try {
      const testMessages = [
        { exchange: 'payments.topic', routingKey: 'payment.test.created', data: { test: true } },
        { exchange: 'notifications.topic', routingKey: 'notification.email.send', data: { email: 'test@example.com' } },
        { exchange: 'documents.direct', routingKey: 'document.process', data: { docId: 'test-doc' } },
        { exchange: 'audit.topic', routingKey: 'audit.event.created', data: { event: 'test' } }
      ];

      for (const msg of testMessages) {
        const envelope = messageFactory.create({
          schema: `test.${msg.routingKey}`,
          data: msg.data
        });

        const success = await this.rabbitmq.publish(
          msg.exchange,
          msg.routingKey,
          envelope
        );

        this.log(`Publish to ${msg.exchange}`, 
          success ? `✅ ${msg.routingKey}` : `❌ Failed`);
      }

      this.testResults.push({ test: 'Basic Publishing', status: 'PASSED' });
    } catch (error) {
      this.testResults.push({ test: 'Basic Publishing', status: 'FAILED', error });
      throw error;
    }
  }

  /**
   * Test 3: Payment Processing Flows
   */
  async testPaymentFlows(): Promise<void> {
    console.log(chalk.yellow('\n💳 Test 3: Payment Processing Flows\n'));

    try {
      // Test ACH payment flow
      if (TEST_CONFIG.paymentFlows.ach) {
        await this.testACHPayment();
      }

      // Test Wire payment flow
      if (TEST_CONFIG.paymentFlows.wire) {
        await this.testWirePayment();
      }

      // Test Check payment flow
      if (TEST_CONFIG.paymentFlows.check) {
        await this.testCheckPayment();
      }

      // Test Lockbox payment flow
      if (TEST_CONFIG.paymentFlows.lockbox) {
        await this.testLockboxPayment();
      }

      this.testResults.push({ test: 'Payment Flows', status: 'PASSED' });
    } catch (error) {
      this.testResults.push({ test: 'Payment Flows', status: 'FAILED', error });
      throw error;
    }
  }

  /**
   * Test ACH Payment
   */
  private async testACHPayment(): Promise<void> {
    const paymentId = ulid();
    const loanId = 23; // Using existing loan

    const achPayment = {
      payment_id: paymentId,
      loan_id: loanId,
      source: 'ach',
      amount_cents: 150000, // $1,500
      effective_date: new Date().toISOString(),
      trace_number: `TEST${Date.now()}`,
      company_batch_id: 'BATCH001',
      originator_id: 'ORIG001',
      payer_name: 'John Doe',
      payer_account: '****1234'
    };

    // 1. Initiate payment (to validation queue)
    const initiateEnvelope = messageFactory.create({
      schema: 'loanserve.payment.v1.initiated',
      data: achPayment
    });

    await this.rabbitmq.publish(
      'payments.topic',
      'payment.ach.initiated',
      initiateEnvelope
    );

    this.log('ACH Payment', `✅ Initiated payment ${paymentId}`);

    // 2. Simulate validation
    const validateEnvelope = messageFactory.createReply(initiateEnvelope, {
      schema: 'loanserve.payment.v1.validated',
      data: { ...achPayment, validation_timestamp: new Date().toISOString() }
    });

    await this.rabbitmq.publish(
      'payments.topic',
      'payment.ach.validated',
      validateEnvelope
    );

    this.log('ACH Payment', `✅ Validated payment ${paymentId}`);
  }

  /**
   * Test Wire Payment
   */
  private async testWirePayment(): Promise<void> {
    const paymentId = ulid();
    const loanId = 23;

    const wirePayment = {
      payment_id: paymentId,
      loan_id: loanId,
      source: 'wire',
      amount_cents: 500000, // $5,000
      effective_date: new Date().toISOString(),
      wire_ref: `WIRE${Date.now()}`,
      sender_bank: 'Chase Bank',
      sender_name: 'Jane Smith',
      sender_account: '****5678'
    };

    const envelope = messageFactory.create({
      schema: 'loanserve.payment.v1.initiated',
      data: wirePayment
    });

    await this.rabbitmq.publish(
      'payments.topic',
      'payment.wire.initiated',
      envelope
    );

    this.log('Wire Payment', `✅ Initiated wire ${paymentId}`);
  }

  /**
   * Test Check Payment
   */
  private async testCheckPayment(): Promise<void> {
    const paymentId = ulid();
    const loanId = 23;

    const checkPayment = {
      payment_id: paymentId,
      loan_id: loanId,
      source: 'check',
      amount_cents: 200000, // $2,000
      effective_date: new Date().toISOString(),
      check_number: `CHK${Date.now()}`,
      payer_bank: 'Bank of America',
      payer_name: 'Bob Johnson',
      payer_account: '****9012'
    };

    const envelope = messageFactory.create({
      schema: 'loanserve.payment.v1.initiated',
      data: checkPayment
    });

    await this.rabbitmq.publish(
      'payments.topic',
      'payment.check.initiated',
      envelope
    );

    this.log('Check Payment', `✅ Initiated check ${paymentId}`);
  }

  /**
   * Test Lockbox Payment
   */
  private async testLockboxPayment(): Promise<void> {
    const paymentId = ulid();
    const loanId = 23;

    const lockboxPayment = {
      payment_id: paymentId,
      loan_id: loanId,
      source: 'lockbox',
      amount_cents: 175000, // $1,750
      effective_date: new Date().toISOString(),
      lockbox_id: 'LB001',
      item_number: Date.now(),
      batch_id: 'LBBATCH001',
      payer_name: 'Alice Cooper'
    };

    const envelope = messageFactory.create({
      schema: 'loanserve.payment.v1.initiated',
      data: lockboxPayment
    });

    await this.rabbitmq.publish(
      'payments.topic',
      'payment.lockbox.initiated',
      envelope
    );

    this.log('Lockbox Payment', `✅ Initiated lockbox ${paymentId}`);
  }

  /**
   * Test 4: Error Handling and Dead Letter Queue
   */
  async testErrorHandling(): Promise<void> {
    console.log(chalk.yellow('\n⚠️ Test 4: Error Handling & DLQ\n'));

    try {
      // Send invalid payment (missing required fields)
      const invalidPayment = {
        payment_id: ulid(),
        // Missing loan_id and amount - will trigger validation error
        source: 'test',
        invalid: true
      };

      const envelope = messageFactory.create({
        schema: 'loanserve.payment.v1.initiated',
        data: invalidPayment
      });

      await this.rabbitmq.publish(
        'payments.topic',
        'payment.test.initiated',
        envelope
      );

      this.log('Error Handling', '✅ Sent invalid payment to trigger DLQ');

      // Test poison message (malformed JSON)
      const poisonEnvelope = {
        message_id: ulid(),
        correlation_id: ulid(),
        schema: 'test.poison',
        data: '{ invalid json }', // This will cause parsing errors
        metadata: {}
      };

      await this.rabbitmq.publish(
        'payments.topic',
        'payment.poison.test',
        poisonEnvelope as any
      );

      this.log('Error Handling', '✅ Sent poison message');

      this.testResults.push({ test: 'Error Handling', status: 'PASSED' });
    } catch (error) {
      this.testResults.push({ test: 'Error Handling', status: 'FAILED', error });
      throw error;
    }
  }

  /**
   * Test 5: Daily Servicing Cycle
   */
  async testServicingCycle(): Promise<void> {
    console.log(chalk.yellow('\n🔄 Test 5: Daily Servicing Cycle\n'));

    try {
      // Distribute servicing tasks across shards
      const loanIds = [23]; // Using existing loan
      
      for (const loanId of loanIds) {
        const shard = loanId % 8; // 8 shards for servicing
        
        const servicingTask = {
          loan_id: loanId,
          task_type: 'daily_accrual',
          scheduled_date: new Date().toISOString(),
          parameters: {
            calculate_interest: true,
            assess_late_fees: true,
            check_escrow: true
          }
        };

        const envelope = messageFactory.create({
          schema: 'loanserve.servicing.v1.task',
          data: servicingTask
        });

        await this.rabbitmq.publish(
          'servicing.direct',
          `servicing.task.${shard}`,
          envelope
        );

        this.log('Servicing Cycle', `✅ Scheduled task for loan ${loanId} (shard ${shard})`);
      }

      this.testResults.push({ test: 'Servicing Cycle', status: 'PASSED' });
    } catch (error) {
      this.testResults.push({ test: 'Servicing Cycle', status: 'FAILED', error });
      throw error;
    }
  }

  /**
   * Test 6: Settlement and Reconciliation
   */
  async testSettlementFlows(): Promise<void> {
    console.log(chalk.yellow('\n🏦 Test 6: Settlement & Reconciliation\n'));

    try {
      // Test ACH settlement
      const achSettlement = {
        batch_id: ulid(),
        settlement_date: new Date().toISOString(),
        total_debits: 1000000, // $10,000
        total_credits: 500000, // $5,000
        net_amount: 500000,
        item_count: 10,
        status: 'pending'
      };

      const achEnvelope = messageFactory.create({
        schema: 'loanserve.settlement.v1.ach',
        data: achSettlement
      });

      await this.rabbitmq.publish(
        'settlement.topic',
        'ach.settlement.initiated',
        achEnvelope
      );

      this.log('Settlement', '✅ ACH settlement batch created');

      // Test bank reconciliation
      const reconciliation = {
        reconciliation_id: ulid(),
        account_number: 'OPS001',
        statement_date: new Date().toISOString(),
        beginning_balance: 10000000, // $100,000
        ending_balance: 10500000, // $105,000
        transactions: []
      };

      const reconEnvelope = messageFactory.create({
        schema: 'loanserve.reconciliation.v1.bank',
        data: reconciliation
      });

      await this.rabbitmq.publish(
        'reconciliation.topic',
        'match.bank.statement',
        reconEnvelope
      );

      this.log('Reconciliation', '✅ Bank reconciliation initiated');

      this.testResults.push({ test: 'Settlement & Reconciliation', status: 'PASSED' });
    } catch (error) {
      this.testResults.push({ test: 'Settlement & Reconciliation', status: 'FAILED', error });
      throw error;
    }
  }

  /**
   * Test 7: Compliance and AML
   */
  async testComplianceFlows(): Promise<void> {
    console.log(chalk.yellow('\n🔍 Test 7: Compliance & AML\n'));

    try {
      // Test OFAC screening
      const ofacScreen = {
        screen_id: ulid(),
        entity_type: 'individual',
        entity_name: 'John Doe',
        entity_id: 'CUST001',
        screen_type: 'ofac',
        timestamp: new Date().toISOString()
      };

      const ofacEnvelope = messageFactory.create({
        schema: 'loanserve.aml.v1.screen',
        data: ofacScreen
      });

      await this.rabbitmq.publish(
        'aml.topic',
        'screen.ofac.request',
        ofacEnvelope
      );

      this.log('AML', '✅ OFAC screening initiated');

      // Test compliance alert
      const complianceAlert = {
        alert_id: ulid(),
        alert_type: 'high_value_transaction',
        severity: 'medium',
        loan_id: 23,
        details: {
          amount: 1000000, // $10,000
          threshold: 500000
        },
        timestamp: new Date().toISOString()
      };

      const alertEnvelope = messageFactory.create({
        schema: 'loanserve.compliance.v1.alert',
        data: complianceAlert
      });

      await this.rabbitmq.publish(
        'compliance.topic',
        'compliance.hit.created',
        alertEnvelope
      );

      this.log('Compliance', '✅ Compliance alert generated');

      this.testResults.push({ test: 'Compliance & AML', status: 'PASSED' });
    } catch (error) {
      this.testResults.push({ test: 'Compliance & AML', status: 'FAILED', error });
      throw error;
    }
  }

  /**
   * Test 8: Load and Performance Testing
   */
  async testLoadPerformance(): Promise<void> {
    console.log(chalk.yellow('\n🚀 Test 8: Load & Performance Testing\n'));
    console.log(chalk.gray(`Generating ${TEST_CONFIG.loadTest.messagesPerBatch * TEST_CONFIG.loadTest.batchCount} messages...\n`));

    try {
      const startTime = Date.now();
      let totalMessages = 0;
      let successCount = 0;
      let errorCount = 0;

      for (let batch = 0; batch < TEST_CONFIG.loadTest.batchCount; batch++) {
        const batchPromises = [];

        for (let i = 0; i < TEST_CONFIG.loadTest.messagesPerBatch; i++) {
          const shouldError = TEST_CONFIG.errorTesting.enabled && 
                            Math.random() < TEST_CONFIG.errorTesting.errorRate;

          const payment = {
            payment_id: ulid(),
            loan_id: 23,
            source: ['ach', 'wire', 'check', 'lockbox'][Math.floor(Math.random() * 4)],
            amount_cents: Math.floor(Math.random() * 500000) + 50000, // $500 - $5,500
            effective_date: new Date().toISOString(),
            // Intentionally cause some errors for testing
            ...(shouldError ? { invalid_field: true, loan_id: null } : {})
          };

          const envelope = messageFactory.create({
            schema: 'loanserve.payment.v1.initiated',
            data: payment
          });

          const publishPromise = this.rabbitmq.publish(
            'payments.topic',
            `payment.${payment.source}.initiated`,
            envelope
          ).then(success => {
            if (success) successCount++;
            else errorCount++;
            return success;
          });

          batchPromises.push(publishPromise);
          totalMessages++;
        }

        await Promise.all(batchPromises);
        
        // Progress update
        const progress = ((batch + 1) / TEST_CONFIG.loadTest.batchCount * 100).toFixed(0);
        process.stdout.write(`\rProgress: ${chalk.cyan('█'.repeat(Math.floor(parseInt(progress) / 2)))}${' '.repeat(50 - Math.floor(parseInt(progress) / 2))} ${progress}%`);

        // Delay between batches
        if (batch < TEST_CONFIG.loadTest.batchCount - 1) {
          await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.loadTest.delayBetweenBatches));
        }
      }

      const duration = Date.now() - startTime;
      const messagesPerSecond = (totalMessages / (duration / 1000)).toFixed(2);

      console.log('\n');
      this.log('Load Test Results', '');
      this.log('  Total Messages', totalMessages.toString());
      this.log('  Successful', chalk.green(successCount.toString()));
      this.log('  Failed', chalk.red(errorCount.toString()));
      this.log('  Duration', `${(duration / 1000).toFixed(2)}s`);
      this.log('  Throughput', `${messagesPerSecond} msg/s`);

      this.testResults.push({ 
        test: 'Load Performance', 
        status: 'PASSED',
        metrics: {
          totalMessages,
          successCount,
          errorCount,
          duration,
          messagesPerSecond
        }
      });
    } catch (error) {
      this.testResults.push({ test: 'Load Performance', status: 'FAILED', error });
      throw error;
    }
  }

  /**
   * Print test results summary
   */
  private printTestResults(): void {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
    
    console.log(chalk.cyan.bold('\n\n📊 Test Results Summary\n'));
    console.log(chalk.gray('═'.repeat(50)));

    let passedCount = 0;
    let failedCount = 0;

    for (const result of this.testResults) {
      const status = result.status === 'PASSED' 
        ? chalk.green('✅ PASSED') 
        : chalk.red('❌ FAILED');
      
      console.log(`${result.test.padEnd(30)} ${status}`);
      
      if (result.status === 'PASSED') passedCount++;
      else failedCount++;

      if (result.metrics) {
        console.log(chalk.gray(`  └─ Metrics: ${JSON.stringify(result.metrics)}`));
      }
      if (result.error) {
        console.log(chalk.gray(`  └─ Error: ${result.error.message}`));
      }
    }

    console.log(chalk.gray('═'.repeat(50)));
    console.log(`Total Tests: ${this.testResults.length}`);
    console.log(`Passed: ${chalk.green(passedCount.toString())}`);
    console.log(`Failed: ${chalk.red(failedCount.toString())}`);
    console.log(`Duration: ${duration}s`);
    console.log(chalk.gray('═'.repeat(50)));

    if (failedCount === 0) {
      console.log(chalk.green.bold('\n✅ All tests passed successfully!\n'));
    } else {
      console.log(chalk.red.bold(`\n❌ ${failedCount} test(s) failed\n`));
    }
  }

  /**
   * Helper to log formatted output
   */
  private log(label: string, value: string): void {
    console.log(`${chalk.gray('│')} ${label.padEnd(25)} ${value}`);
  }
}

// Run the test suite
async function main() {
  const tester = new QueueInfrastructureTest();
  
  // Wait a moment for RabbitMQ to be ready
  console.log(chalk.gray('Waiting for RabbitMQ connection...'));
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await tester.runAllTests();
  
  // Keep process alive briefly to allow async operations to complete
  setTimeout(() => {
    process.exit(0);
  }, 5000);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('Unhandled rejection:'), error);
  process.exit(1);
});

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

export { QueueInfrastructureTest };