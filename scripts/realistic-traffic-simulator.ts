#!/usr/bin/env tsx

/**
 * Realistic Traffic Simulator
 * Simulates real-world message flow with both producers and consumers
 */

import amqp from 'amqplib';
import chalk from 'chalk';

// Simulate processing delays (ms)
const PROCESSING_DELAYS = {
  fast: 10,      // Payment validation
  medium: 50,    // Document analysis
  slow: 100,     // Settlement processing
  batch: 500     // Batch operations
};

// Message production rates (messages per second)
const PRODUCTION_RATES = {
  payments: 10,
  documents: 5,
  notifications: 15,
  settlements: 3,
  reconciliation: 8,
  compliance: 2,
  servicing: 20
};

class RealisticTrafficSimulator {
  private connection: amqp.Connection | null = null;
  private producerChannel: amqp.Channel | null = null;
  private consumerChannels: Map<string, amqp.Channel> = new Map();
  private stats = {
    produced: 0,
    consumed: 0,
    errors: 0,
    startTime: Date.now()
  };
  private isRunning = true;

  async start() {
    console.log(chalk.cyan.bold('\n🚀 Starting Realistic Traffic Simulator\n'));
    console.log(chalk.gray('Simulating real-world message flow with producers AND consumers\n'));

    const url = process.env.CLOUDAMQP_URL;
    if (!url) {
      throw new Error('CLOUDAMQP_URL not configured');
    }

    // Establish connection
    this.connection = await amqp.connect(url);
    this.producerChannel = await this.connection.createChannel();
    
    // Set up prefetch for better flow control
    await this.producerChannel.prefetch(100);

    // Start all components
    await Promise.all([
      this.setupPaymentFlow(),
      this.setupDocumentFlow(),
      this.setupNotificationFlow(),
      this.setupSettlementFlow(),
      this.setupReconciliationFlow(),
      this.setupComplianceFlow(),
      this.setupServicingFlow()
    ]);

    // Status reporter
    this.startStatusReporter();

    console.log(chalk.green('\n✅ All traffic flows started!\n'));
    console.log(chalk.yellow('Press Ctrl+C to stop the simulation\n'));
  }

  private async setupPaymentFlow() {
    const queues = [
      'payments.validation',
      'payments.processing',
      'payments.distribution'
    ];

    // Create consumer channel
    const channel = await this.connection!.createChannel();
    await channel.prefetch(10);
    this.consumerChannels.set('payments', channel);

    // Set up consumers
    for (const queue of queues) {
      await channel.assertQueue(queue, { durable: true });
      
      channel.consume(queue, async (msg) => {
        if (msg) {
          // Simulate processing
          await this.delay(PROCESSING_DELAYS.fast);
          channel.ack(msg);
          this.stats.consumed++;
          
          // Chain to next queue
          if (queue === 'payments.validation') {
            this.sendMessage('payments.processing', { 
              ...JSON.parse(msg.content.toString()),
              validated: true 
            });
          } else if (queue === 'payments.processing') {
            this.sendMessage('payments.distribution', {
              ...JSON.parse(msg.content.toString()),
              processed: true
            });
          }
        }
      });
    }

    // Start producer
    this.startProducer('payments.validation', PRODUCTION_RATES.payments, () => ({
      type: 'payment',
      amount: Math.random() * 10000,
      loanId: Math.floor(Math.random() * 1000),
      timestamp: new Date().toISOString()
    }));
  }

  private async setupDocumentFlow() {
    const queue = 'documents.analysis.request';
    
    const channel = await this.connection!.createChannel();
    await channel.prefetch(5);
    this.consumerChannels.set('documents', channel);

    await channel.assertQueue(queue, { durable: true });
    
    // Consumer
    channel.consume(queue, async (msg) => {
      if (msg) {
        // Simulate slower document processing
        await this.delay(PROCESSING_DELAYS.medium);
        channel.ack(msg);
        this.stats.consumed++;
      }
    });

    // Producer
    this.startProducer(queue, PRODUCTION_RATES.documents, () => ({
      type: 'document',
      documentId: `DOC-${Date.now()}`,
      action: 'analyze',
      timestamp: new Date().toISOString()
    }));
  }

  private async setupNotificationFlow() {
    const queues = ['notifications.email', 'notifications.sms'];
    
    const channel = await this.connection!.createChannel();
    await channel.prefetch(20);
    this.consumerChannels.set('notifications', channel);

    for (const queue of queues) {
      await channel.assertQueue(queue, { durable: true });
      
      // Consumer
      channel.consume(queue, async (msg) => {
        if (msg) {
          await this.delay(PROCESSING_DELAYS.fast);
          channel.ack(msg);
          this.stats.consumed++;
        }
      });
    }

    // Producers
    this.startProducer('notifications.email', PRODUCTION_RATES.notifications * 0.7, () => ({
      type: 'email',
      to: `user${Math.floor(Math.random() * 100)}@example.com`,
      subject: 'Payment Update',
      timestamp: new Date().toISOString()
    }));

    this.startProducer('notifications.sms', PRODUCTION_RATES.notifications * 0.3, () => ({
      type: 'sms',
      to: `+1555000${Math.floor(Math.random() * 10000)}`,
      message: 'Payment received',
      timestamp: new Date().toISOString()
    }));
  }

  private async setupSettlementFlow() {
    const queues = [
      'settlement.ach.initiate',
      'settlement.ach.settle',
      'settlement.wire.advice'
    ];
    
    const channel = await this.connection!.createChannel();
    await channel.prefetch(5);
    this.consumerChannels.set('settlement', channel);

    for (const queue of queues) {
      await channel.assertQueue(queue, { durable: true });
      
      // Consumer
      channel.consume(queue, async (msg) => {
        if (msg) {
          // Settlement is slow
          await this.delay(PROCESSING_DELAYS.slow);
          channel.ack(msg);
          this.stats.consumed++;
          
          // Chain ACH settlements
          if (queue === 'settlement.ach.initiate') {
            this.sendMessage('settlement.ach.settle', {
              ...JSON.parse(msg.content.toString()),
              initiated: true
            });
          }
        }
      });
    }

    // Producer
    this.startProducer('settlement.ach.initiate', PRODUCTION_RATES.settlements, () => ({
      type: 'ach',
      amount: Math.random() * 50000,
      accountNumber: `ACC${Math.floor(Math.random() * 100000)}`,
      timestamp: new Date().toISOString()
    }));
  }

  private async setupReconciliationFlow() {
    const queues = [
      'reconciliation.bank.import',
      'reconciliation.match',
      'reconciliation.exceptions'
    ];
    
    const channel = await this.connection!.createChannel();
    await channel.prefetch(10);
    this.consumerChannels.set('reconciliation', channel);

    for (const queue of queues) {
      await channel.assertQueue(queue, { durable: true });
      
      // Consumer
      channel.consume(queue, async (msg) => {
        if (msg) {
          await this.delay(PROCESSING_DELAYS.medium);
          channel.ack(msg);
          this.stats.consumed++;
          
          // Process chain
          if (queue === 'reconciliation.bank.import') {
            this.sendMessage('reconciliation.match', {
              ...JSON.parse(msg.content.toString()),
              imported: true
            });
          } else if (queue === 'reconciliation.match') {
            // 10% go to exceptions
            if (Math.random() < 0.1) {
              this.sendMessage('reconciliation.exceptions', {
                ...JSON.parse(msg.content.toString()),
                exception: 'No match found'
              });
            }
          }
        }
      });
    }

    // Producer
    this.startProducer('reconciliation.bank.import', PRODUCTION_RATES.reconciliation, () => ({
      type: 'bank_transaction',
      transactionId: `TXN-${Date.now()}`,
      amount: Math.random() * 10000,
      timestamp: new Date().toISOString()
    }));
  }

  private async setupComplianceFlow() {
    const queues = ['compliance.hits', 'aml.screen', 'aml.review'];
    
    const channel = await this.connection!.createChannel();
    await channel.prefetch(5);
    this.consumerChannels.set('compliance', channel);

    for (const queue of queues) {
      await channel.assertQueue(queue, { durable: true });
      
      // Consumer
      channel.consume(queue, async (msg) => {
        if (msg) {
          await this.delay(PROCESSING_DELAYS.slow);
          channel.ack(msg);
          this.stats.consumed++;
          
          // Chain AML screening
          if (queue === 'aml.screen') {
            // 5% need review
            if (Math.random() < 0.05) {
              this.sendMessage('aml.review', {
                ...JSON.parse(msg.content.toString()),
                flagged: true
              });
            }
          }
        }
      });
    }

    // Producer
    this.startProducer('aml.screen', PRODUCTION_RATES.compliance, () => ({
      type: 'aml_check',
      entityId: `ENT-${Math.floor(Math.random() * 1000)}`,
      entityType: Math.random() > 0.5 ? 'individual' : 'company',
      timestamp: new Date().toISOString()
    }));
  }

  private async setupServicingFlow() {
    // Servicing queues (partitioned)
    const channel = await this.connection!.createChannel();
    await channel.prefetch(20);
    this.consumerChannels.set('servicing', channel);

    for (let i = 0; i < 8; i++) {
      const queue = `servicing.daily.tasks.${i}`;
      await channel.assertQueue(queue, { durable: true });
      
      // Consumer
      channel.consume(queue, async (msg) => {
        if (msg) {
          // Batch processing is slower
          await this.delay(PROCESSING_DELAYS.batch);
          channel.ack(msg);
          this.stats.consumed++;
        }
      });

      // Producer (distribute across partitions)
      this.startProducer(queue, PRODUCTION_RATES.servicing / 8, () => ({
        type: 'daily_task',
        partition: i,
        loanId: Math.floor(Math.random() * 10000),
        task: ['interest_accrual', 'payment_processing', 'fee_assessment'][Math.floor(Math.random() * 3)],
        timestamp: new Date().toISOString()
      }));
    }
  }

  private startProducer(queue: string, messagesPerSecond: number, messageGenerator: () => any) {
    const interval = 1000 / messagesPerSecond;
    
    setInterval(() => {
      if (this.isRunning) {
        this.sendMessage(queue, messageGenerator());
      }
    }, interval);
  }

  private sendMessage(queue: string, message: any) {
    try {
      this.producerChannel?.sendToQueue(
        queue,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      );
      this.stats.produced++;
    } catch (error) {
      this.stats.errors++;
    }
  }

  private startStatusReporter() {
    setInterval(() => {
      const elapsed = (Date.now() - this.stats.startTime) / 1000;
      const produceRate = this.stats.produced / elapsed;
      const consumeRate = this.stats.consumed / elapsed;
      const backlog = this.stats.produced - this.stats.consumed;
      
      console.clear();
      console.log(chalk.cyan.bold('\n📊 REALISTIC TRAFFIC SIMULATOR\n'));
      console.log(chalk.white('═'.repeat(50)));
      console.log(chalk.green(`✉️  Messages Produced: ${this.stats.produced}`));
      console.log(chalk.blue(`✅ Messages Consumed: ${this.stats.consumed}`));
      console.log(chalk.yellow(`📦 Current Backlog: ${backlog}`));
      console.log(chalk.white('─'.repeat(50)));
      console.log(chalk.cyan(`📈 Production Rate: ${produceRate.toFixed(1)} msg/s`));
      console.log(chalk.cyan(`📉 Consumption Rate: ${consumeRate.toFixed(1)} msg/s`));
      console.log(chalk.white('─'.repeat(50)));
      
      if (backlog > 1000) {
        console.log(chalk.red('⚠️  Warning: Backlog growing! Consumers may be overwhelmed.'));
      } else if (backlog < 100) {
        console.log(chalk.green('✅ System balanced: Consumers keeping up with producers.'));
      } else {
        console.log(chalk.yellow('📊 System healthy: Normal message flow.'));
      }
      
      console.log(chalk.white('═'.repeat(50)));
      console.log(chalk.gray('\nPress Ctrl+C to stop simulation'));
    }, 2000);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async stop() {
    console.log(chalk.yellow('\n🛑 Stopping simulation...'));
    this.isRunning = false;
    
    // Close all channels
    for (const channel of this.consumerChannels.values()) {
      await channel.close();
    }
    
    if (this.producerChannel) {
      await this.producerChannel.close();
    }
    
    if (this.connection) {
      await this.connection.close();
    }
    
    console.log(chalk.green('✅ Simulation stopped cleanly\n'));
    
    // Final stats
    const elapsed = (Date.now() - this.stats.startTime) / 1000;
    console.log(chalk.cyan('Final Statistics:'));
    console.log(chalk.white(`  Total Produced: ${this.stats.produced}`));
    console.log(chalk.white(`  Total Consumed: ${this.stats.consumed}`));
    console.log(chalk.white(`  Total Errors: ${this.stats.errors}`));
    console.log(chalk.white(`  Run Time: ${elapsed.toFixed(1)} seconds`));
    console.log(chalk.white(`  Avg Production Rate: ${(this.stats.produced / elapsed).toFixed(1)} msg/s`));
    console.log(chalk.white(`  Avg Consumption Rate: ${(this.stats.consumed / elapsed).toFixed(1)} msg/s\n`));
  }
}

// Main execution
const simulator = new RealisticTrafficSimulator();

// Handle shutdown
process.on('SIGINT', async () => {
  await simulator.stop();
  process.exit(0);
});

// Start simulation
simulator.start().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});