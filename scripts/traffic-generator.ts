#!/usr/bin/env tsx

/**
 * Traffic Generator for Existing Consumers
 * Sends realistic traffic to queues where consumers are already running
 */

import amqp from 'amqplib';
import chalk from 'chalk';

class TrafficGenerator {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private stats = {
    payments: 0,
    documents: 0,
    notifications: 0,
    settlements: 0,
    reconciliation: 0,
    compliance: 0,
    servicing: 0,
    total: 0,
    startTime: Date.now()
  };
  private isRunning = true;

  async start() {
    console.log(chalk.cyan.bold('\n🚀 Traffic Generator for LoanServe Pro\n'));
    console.log(chalk.gray('Sending messages to existing consumer queues...\n'));

    const url = process.env.CLOUDAMQP_URL;
    if (!url) {
      throw new Error('CLOUDAMQP_URL not configured');
    }

    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();

    // Start traffic generators for each subsystem
    this.generatePaymentTraffic();
    this.generateDocumentTraffic();
    this.generateNotificationTraffic();
    this.generateSettlementTraffic();
    this.generateReconciliationTraffic();
    this.generateComplianceTraffic();
    this.generateServicingTraffic();

    // Status display
    this.startStatusDisplay();

    console.log(chalk.green('✅ Traffic generation started!\n'));
    console.log(chalk.yellow('Messages are being processed by existing consumers.\n'));
    console.log(chalk.gray('Press Ctrl+C to stop\n'));
  }

  private generatePaymentTraffic() {
    // Send payment validation requests (consumers will process them)
    setInterval(() => {
      if (!this.isRunning) return;
      
      const payment = {
        id: `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        loanId: Math.floor(Math.random() * 100) + 1,
        amount: (Math.random() * 5000 + 100).toFixed(2),
        type: ['principal', 'interest', 'escrow', 'fee'][Math.floor(Math.random() * 4)],
        paymentDate: new Date().toISOString(),
        source: ['ach', 'wire', 'check', 'cash'][Math.floor(Math.random() * 4)],
        accountNumber: `ACC${Math.floor(Math.random() * 10000)}`,
        routingNumber: '121000248',
        metadata: {
          channel: 'online',
          ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
        }
      };

      this.sendMessage('payments.validation', payment);
      this.stats.payments++;
      this.stats.total++;
    }, 500); // 2 payments per second
  }

  private generateDocumentTraffic() {
    // Send document analysis requests
    setInterval(() => {
      if (!this.isRunning) return;
      
      const document = {
        id: `DOC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        loanId: Math.floor(Math.random() * 100) + 1,
        type: ['deed_of_trust', 'note', 'insurance', 'tax_bill', 'statement'][Math.floor(Math.random() * 5)],
        fileName: `document_${Date.now()}.pdf`,
        fileSize: Math.floor(Math.random() * 5000000) + 100000,
        uploadedBy: `user${Math.floor(Math.random() * 10)}`,
        requestType: 'analysis',
        priority: Math.random() > 0.9 ? 'high' : 'normal'
      };

      this.sendMessage('documents.analysis.request', document);
      this.stats.documents++;
      this.stats.total++;
    }, 2000); // 1 document every 2 seconds
  }

  private generateNotificationTraffic() {
    // Send email notifications
    setInterval(() => {
      if (!this.isRunning) return;
      
      const email = {
        id: `EMAIL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        to: `borrower${Math.floor(Math.random() * 100)}@example.com`,
        template: ['payment_received', 'payment_due', 'escrow_analysis', 'statement_ready'][Math.floor(Math.random() * 4)],
        data: {
          loanId: Math.floor(Math.random() * 100) + 1,
          amount: (Math.random() * 5000 + 100).toFixed(2),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        priority: Math.random() > 0.8 ? 'high' : 'normal'
      };

      this.sendMessage('notifications.email', email);
      this.stats.notifications++;
      this.stats.total++;
    }, 1000); // 1 email per second

    // Send SMS notifications
    setInterval(() => {
      if (!this.isRunning) return;
      
      const sms = {
        id: `SMS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        to: `+1555${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
        message: 'Your payment has been received. Thank you!',
        loanId: Math.floor(Math.random() * 100) + 1
      };

      this.sendMessage('notifications.sms', sms);
      this.stats.notifications++;
      this.stats.total++;
    }, 3000); // 1 SMS every 3 seconds
  }

  private generateSettlementTraffic() {
    // ACH settlements
    setInterval(() => {
      if (!this.isRunning) return;
      
      const settlement = {
        id: `SETTLE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'ach',
        direction: Math.random() > 0.3 ? 'credit' : 'debit',
        amount: (Math.random() * 50000 + 1000).toFixed(2),
        accountNumber: `ACC${Math.floor(Math.random() * 100000)}`,
        routingNumber: '121000248',
        effectiveDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        batchId: `BATCH-${Math.floor(Date.now() / 3600000)}`,
        metadata: {
          loanIds: Array.from({length: Math.floor(Math.random() * 10) + 1}, () => Math.floor(Math.random() * 100) + 1)
        }
      };

      this.sendMessage('settlement.ach.initiate', settlement);
      this.stats.settlements++;
      this.stats.total++;
    }, 5000); // 1 settlement every 5 seconds
  }

  private generateReconciliationTraffic() {
    // Bank file imports
    setInterval(() => {
      if (!this.isRunning) return;
      
      const bankImport = {
        id: `BANK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        fileName: `bank_statement_${new Date().toISOString().split('T')[0]}.csv`,
        bank: ['chase', 'wells_fargo', 'bofa', 'usbank'][Math.floor(Math.random() * 4)],
        accountNumber: `****${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
        statementDate: new Date().toISOString(),
        transactionCount: Math.floor(Math.random() * 500) + 50,
        totalCredits: (Math.random() * 1000000 + 10000).toFixed(2),
        totalDebits: (Math.random() * 900000 + 10000).toFixed(2)
      };

      this.sendMessage('reconciliation.bank.import', bankImport);
      this.stats.reconciliation++;
      this.stats.total++;
    }, 10000); // 1 import every 10 seconds

    // Matching requests
    setInterval(() => {
      if (!this.isRunning) return;
      
      const match = {
        id: `MATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        transactionId: `TXN-${Math.floor(Math.random() * 100000)}`,
        amount: (Math.random() * 10000 + 100).toFixed(2),
        date: new Date().toISOString(),
        description: `Payment from Account ${Math.floor(Math.random() * 10000)}`,
        matchCriteria: {
          tolerance: 0.01,
          dateRange: 3,
          fuzzyMatch: true
        }
      };

      this.sendMessage('reconciliation.match', match);
      this.stats.reconciliation++;
      this.stats.total++;
    }, 2000); // 1 match every 2 seconds
  }

  private generateComplianceTraffic() {
    // AML screening
    setInterval(() => {
      if (!this.isRunning) return;
      
      const screening = {
        id: `AML-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        entityType: Math.random() > 0.5 ? 'individual' : 'organization',
        name: `Entity ${Math.floor(Math.random() * 1000)}`,
        country: ['US', 'CA', 'MX', 'UK'][Math.floor(Math.random() * 4)],
        transactionAmount: (Math.random() * 100000 + 1000).toFixed(2),
        riskFactors: {
          pep: Math.random() > 0.95,
          sanctioned: Math.random() > 0.99,
          highRiskCountry: Math.random() > 0.9
        },
        screeningType: 'real-time'
      };

      this.sendMessage('aml.screen', screening);
      this.stats.compliance++;
      this.stats.total++;
    }, 8000); // 1 screening every 8 seconds
  }

  private generateServicingTraffic() {
    // Daily servicing tasks (distributed across partitions)
    setInterval(() => {
      if (!this.isRunning) return;
      
      const loanId = Math.floor(Math.random() * 1000) + 1;
      const partition = loanId % 8;
      
      const task = {
        id: `TASK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        loanId: loanId,
        taskType: ['interest_accrual', 'escrow_analysis', 'fee_assessment', 'statement_generation'][Math.floor(Math.random() * 4)],
        scheduledDate: new Date().toISOString(),
        priority: Math.random() > 0.7 ? 'high' : 'normal',
        retryCount: 0,
        metadata: {
          cycleDate: new Date().toISOString().split('T')[0],
          partition: partition
        }
      };

      this.sendMessage(`servicing.daily.tasks.${partition}`, task);
      this.stats.servicing++;
      this.stats.total++;
    }, 300); // ~3 tasks per second
  }

  private sendMessage(queue: string, data: any) {
    try {
      this.channel?.sendToQueue(
        queue,
        Buffer.from(JSON.stringify(data)),
        { persistent: true }
      );
    } catch (error) {
      console.error(chalk.red(`Error sending to ${queue}:`), error);
    }
  }

  private startStatusDisplay() {
    setInterval(() => {
      const elapsed = (Date.now() - this.stats.startTime) / 1000;
      const rate = this.stats.total / elapsed;
      
      console.clear();
      console.log(chalk.cyan.bold('\n📊 TRAFFIC GENERATOR STATUS\n'));
      console.log(chalk.white('═'.repeat(50)));
      console.log(chalk.green(`Total Messages Sent: ${this.stats.total}`));
      console.log(chalk.cyan(`Rate: ${rate.toFixed(1)} msg/s`));
      console.log(chalk.white('─'.repeat(50)));
      console.log(chalk.yellow('Messages by Type:'));
      console.log(`  💳 Payments:       ${this.stats.payments}`);
      console.log(`  📄 Documents:      ${this.stats.documents}`);
      console.log(`  📧 Notifications:  ${this.stats.notifications}`);
      console.log(`  💰 Settlements:    ${this.stats.settlements}`);
      console.log(`  🔄 Reconciliation: ${this.stats.reconciliation}`);
      console.log(`  🛡️  Compliance:     ${this.stats.compliance}`);
      console.log(`  ⚙️  Servicing:      ${this.stats.servicing}`);
      console.log(chalk.white('═'.repeat(50)));
      console.log(chalk.gray('\nExisting consumers are processing these messages'));
      console.log(chalk.gray('Check Queue Monitor to see real-time activity'));
      console.log(chalk.gray('\nPress Ctrl+C to stop'));
    }, 2000);
  }

  async stop() {
    console.log(chalk.yellow('\n🛑 Stopping traffic generation...'));
    this.isRunning = false;
    
    if (this.channel) await this.channel.close();
    if (this.connection) await this.connection.close();
    
    const elapsed = (Date.now() - this.stats.startTime) / 1000;
    console.log(chalk.green('\n✅ Traffic generator stopped'));
    console.log(chalk.cyan(`\nFinal Stats:`));
    console.log(`  Total messages sent: ${this.stats.total}`);
    console.log(`  Run time: ${elapsed.toFixed(1)} seconds`);
    console.log(`  Average rate: ${(this.stats.total / elapsed).toFixed(1)} msg/s\n`);
  }
}

// Main
const generator = new TrafficGenerator();

process.on('SIGINT', async () => {
  await generator.stop();
  process.exit(0);
});

generator.start().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});