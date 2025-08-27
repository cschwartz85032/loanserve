/**
 * RabbitMQ Topology Manager
 * Declares and manages exchanges, queues, and bindings
 */

import amqp from 'amqplib';

export interface ExchangeDefinition {
  name: string;
  type: 'direct' | 'topic' | 'fanout' | 'headers';
  durable?: boolean;
  autoDelete?: boolean;
  arguments?: Record<string, any>;
}

export interface QueueDefinition {
  name: string;
  durable?: boolean;
  exclusive?: boolean;
  autoDelete?: boolean;
  arguments?: Record<string, any>;
  bindings?: Array<{
    exchange: string;
    routingKey: string;
    arguments?: Record<string, any>;
  }>;
}

export class TopologyManager {
  private exchanges: Map<string, ExchangeDefinition> = new Map();
  private queues: Map<string, QueueDefinition> = new Map();

  constructor() {
    this.defineTopology();
  }

  /**
   * Define the complete messaging topology
   */
  private defineTopology(): void {
    // Core exchanges
    this.addExchange({
      name: 'servicing.direct',
      type: 'direct',
      durable: true,
    });

    this.addExchange({
      name: 'payments.topic',
      type: 'topic',
      durable: true,
    });

    this.addExchange({
      name: 'documents.direct',
      type: 'direct',
      durable: true,
    });

    this.addExchange({
      name: 'notifications.topic',
      type: 'topic',
      durable: true,
    });

    this.addExchange({
      name: 'escrow.workflow',
      type: 'topic',
      durable: true,
    });

    this.addExchange({
      name: 'escrow.compensate',
      type: 'topic',
      durable: true,
    });

    // Phase 3: Escrow saga exchanges
    this.addExchange({
      name: 'escrow.saga',
      type: 'topic',
      durable: true,
    });

    this.addExchange({
      name: 'escrow.events',
      type: 'topic',
      durable: true,
    });

    this.addExchange({
      name: 'escrow.dlq',
      type: 'direct',
      durable: true,
    });

    this.addExchange({
      name: 'compliance.topic',
      type: 'topic',
      durable: true,
    });

    this.addExchange({
      name: 'investor.direct',
      type: 'direct',
      durable: true,
    });

    this.addExchange({
      name: 'audit.topic',
      type: 'topic',
      durable: true,
    });

    // Phase 6: Cash Management exchanges
    this.addExchange({
      name: 'cash.events',
      type: 'topic',
      durable: true,
    });

    // Phase 7: Remittance exchanges
    this.addExchange({
      name: 'remittance',
      type: 'topic',
      durable: true,
    });

    this.addExchange({
      name: 'remit.saga',
      type: 'topic',
      durable: true,
    });

    this.addExchange({
      name: 'remit.events',
      type: 'topic',
      durable: true,
    });

    this.addExchange({
      name: 'remit.dlq',
      type: 'direct',
      durable: true,
    });

    // Phase 3: Settlement & Reconciliation exchanges
    this.addExchange({
      name: 'settlement.topic',
      type: 'topic',
      durable: true,
    });

    this.addExchange({
      name: 'reconciliation.topic',
      type: 'topic',
      durable: true,
    });

    this.addExchange({
      name: 'bank.topic',
      type: 'topic',
      durable: true,
    });

    this.addExchange({
      name: 'aml.topic',
      type: 'topic',
      durable: true,
    });

    // Dead letter exchange
    this.addExchange({
      name: 'dlx.main',
      type: 'topic',
      durable: true,
    });

    // Retry exchanges (if delayed message plugin available)
    this.addExchange({
      name: 'retry.5s',
      type: 'topic',
      durable: true,
      arguments: { 'x-delayed-type': 'topic' },
    });

    this.addExchange({
      name: 'retry.30s',
      type: 'topic',
      durable: true,
      arguments: { 'x-delayed-type': 'topic' },
    });

    // Daily servicing queues (8 shards)
    for (let i = 0; i < 8; i++) {
      this.addQueue({
        name: `servicing.daily.tasks.${i}`,
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-message-ttl': 86400000, // 24 hours
          'x-dead-letter-exchange': 'dlx.main',
          'x-dead-letter-routing-key': `servicing.dlq.${i}`,
          'x-max-length': 500000,
          'x-overflow': 'reject-publish-dlx',
        },
        bindings: [{
          exchange: 'servicing.direct',
          routingKey: `servicing.${i}.*`,
        }],
      });
    }

    // Payment processing queues - Step 13-16 (Validator, Classifier, Rules, Poster)
    // TEMPORARILY COMMENTED OUT: q.validate already exists in CloudAMQP with different settings
    // this.addQueue({
    //   name: 'q.validate',
    //   durable: true,
    //   arguments: {},
    //   bindings: [
    //     // These will be bound to payments.inbound exchange by bootstrap
    //   ],
    // });

    // TEMPORARILY COMMENTED OUT: q.classify already exists in CloudAMQP with different settings
    // this.addQueue({
    //   name: 'q.classify',
    //   durable: true,
    //   arguments: {},
    //   bindings: [
    //     // Will be bound to payments.validation by bootstrap
    //   ],
    // });

    // TEMPORARILY COMMENTED OUT: q.rules.post already exists in CloudAMQP with different settings
    // this.addQueue({
    //   name: 'q.rules.post',
    //   durable: true,
    //   arguments: {},
    //   bindings: [
    //     // Will be bound to payments.saga by bootstrap
    //   ],
    // });

    // TEMPORARILY COMMENTED OUT: q.post already exists in CloudAMQP with different settings
    // this.addQueue({
    //   name: 'q.post',
    //   durable: true,
    //   arguments: {},
    //   bindings: [
    //     // Will be bound to payments.saga by bootstrap
    //   ],
    // });

    // Payment processing queues
    this.addQueue({
      name: 'payments.validation',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'payments.dlq',
      },
      bindings: [
        { exchange: 'payments.topic', routingKey: 'payment.*.received' },
      ],
    });

    this.addQueue({
      name: 'payments.processing',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'payments.dlq',
      },
      bindings: [
        { exchange: 'payments.topic', routingKey: 'payment.*.validated' },
      ],
    });

    this.addQueue({
      name: 'payments.distribution',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'payments.dlq',
      },
      bindings: [
        { exchange: 'payments.topic', routingKey: 'payment.*.processed' },
      ],
    });

    this.addQueue({
      name: 'payments.compliance',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
      },
      bindings: [
        { exchange: 'payments.topic', routingKey: 'payment.*.compliance' },
      ],
    });

    this.addQueue({
      name: 'payments.reversal',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'payments.dlq',
      },
      bindings: [
        { exchange: 'payments.topic', routingKey: 'payment.*.reversal' },
      ],
    });

    this.addQueue({
      name: 'payments.returned',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'payments.dlq',
      },
      bindings: [
        { exchange: 'payments.topic', routingKey: 'payment.*.returned' },
      ],
    });

    // Document processing queues
    this.addQueue({
      name: 'documents.analysis.request',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-message-ttl': 1800000, // 30 minutes
      },
      bindings: [
        { exchange: 'documents.direct', routingKey: 'analyze' },
      ],
    });

    // Notification queues
    this.addQueue({
      name: 'notifications.email',
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'notifications.dlq',
      },
      bindings: [
        { exchange: 'notifications.topic', routingKey: 'notify.*.*.email' },
      ],
    });

    this.addQueue({
      name: 'notifications.sms',
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'notifications.dlq',
      },
      bindings: [
        { exchange: 'notifications.topic', routingKey: 'notify.*.*.sms' },
      ],
    });

    this.addQueue({
      name: 'notifications.dashboard',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
      },
      bindings: [
        { exchange: 'notifications.topic', routingKey: 'notify.*.*.dashboard' },
      ],
    });

    // Escrow saga queues
    this.addQueue({
      name: 'escrow.validate',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
      },
      bindings: [
        { exchange: 'escrow.workflow', routingKey: 'escrow.validate' },
      ],
    });

    this.addQueue({
      name: 'escrow.authorize',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
      },
      bindings: [
        { exchange: 'escrow.workflow', routingKey: 'escrow.authorize' },
      ],
    });

    this.addQueue({
      name: 'escrow.disburse',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
      },
      bindings: [
        { exchange: 'escrow.workflow', routingKey: 'escrow.disburse' },
      ],
    });

    this.addQueue({
      name: 'escrow.reconcile',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
      },
      bindings: [
        { exchange: 'escrow.workflow', routingKey: 'escrow.reconcile' },
      ],
    });

    // Phase 3: Escrow saga queues
    this.addQueue({
      name: 'q.escrow.forecast',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'escrow.dlq',
        'x-delivery-limit': 6,
      },
      bindings: [
        { exchange: 'escrow.saga', routingKey: 'forecast.request.v1' },
      ],
    });

    this.addQueue({
      name: 'q.escrow.disburse.schedule',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'escrow.dlq',
        'x-delivery-limit': 6,
      },
      bindings: [
        { exchange: 'escrow.saga', routingKey: 'disbursement.schedule.v1' },
      ],
    });

    this.addQueue({
      name: 'q.escrow.disburse.post',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'escrow.dlq',
        'x-delivery-limit': 6,
      },
      bindings: [
        { exchange: 'escrow.saga', routingKey: 'disbursement.post.v1' },
      ],
    });

    this.addQueue({
      name: 'q.escrow.analysis.run',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'escrow.dlq',
        'x-delivery-limit': 6,
      },
      bindings: [
        { exchange: 'escrow.saga', routingKey: 'analysis.run.v1' },
      ],
    });

    this.addQueue({
      name: 'q.escrow.events.audit',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'escrow.dlq',
        'x-delivery-limit': 6,
      },
      bindings: [
        { exchange: 'escrow.events', routingKey: 'escrow.*' },
      ],
    });

    // Versioned DLQ to avoid CloudAMQP conflicts
    // CRITICAL: Never skip DLQ queues - they protect against pipeline failures
    this.addQueue({
      name: 'q.escrow.dlq.v2',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'escrow.dlq',
        'x-delivery-limit': 6,
      },
      bindings: [
        { exchange: 'escrow.dlq', routingKey: '#' },
      ],
    });

    // Phase 7: Remittance queues
    this.addQueue({
      name: 'q.remit.aggregate',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'remit.dlq',
        'x-dead-letter-routing-key': 'aggregate.failed',
      },
      bindings: [
        { exchange: 'remit.saga', routingKey: 'cycle.aggregate.v1' },
      ],
    });

    this.addQueue({
      name: 'q.remit.export',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'remit.dlq',
        'x-dead-letter-routing-key': 'export.failed',
      },
      bindings: [
        { exchange: 'remit.saga', routingKey: 'cycle.export.v1' },
      ],
    });

    this.addQueue({
      name: 'q.remit.settle',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'remit.dlq',
        'x-dead-letter-routing-key': 'settle.failed',
      },
      bindings: [
        { exchange: 'remit.saga', routingKey: 'cycle.settle.v1' },
      ],
    });

    this.addQueue({
      name: 'q.remit.events.audit',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-message-ttl': 604800000, // 7 days for audit
      },
      bindings: [
        { exchange: 'remit.events', routingKey: 'remit.*' },
      ],
    });

    this.addQueue({
      name: 'q.remit.dlq',
      durable: true,
      arguments: {
        'x-message-ttl': 86400000, // 24 hours
      },
      bindings: [
        { exchange: 'remit.dlq', routingKey: '#' },
      ],
    });

    // Compliance queues
    this.addQueue({
      name: 'compliance.regulatory',
      durable: true,
      arguments: {
        'x-queue-mode': 'lazy', // For large backlogs
      },
      bindings: [
        { exchange: 'compliance.topic', routingKey: 'compliance.regulatory.*' },
      ],
    });

    this.addQueue({
      name: 'compliance.investor',
      durable: true,
      arguments: {
        'x-queue-mode': 'lazy',
      },
      bindings: [
        { exchange: 'compliance.topic', routingKey: 'compliance.investor.*' },
      ],
    });

    this.addQueue({
      name: 'compliance.internal',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
      },
      bindings: [
        { exchange: 'compliance.topic', routingKey: 'compliance.internal.*' },
      ],
    });

    // Investor calculation queues (priority via separate queues)
    this.addQueue({
      name: 'investor.calc.p10',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
      },
      bindings: [
        { exchange: 'investor.direct', routingKey: 'calc.p10' },
      ],
    });

    this.addQueue({
      name: 'investor.calc.p5',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
      },
      bindings: [
        { exchange: 'investor.direct', routingKey: 'calc.p5' },
      ],
    });

    this.addQueue({
      name: 'investor.calc.p1',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
      },
      bindings: [
        { exchange: 'investor.direct', routingKey: 'calc.p1' },
      ],
    });

    // Investor clawback queue
    this.addQueue({
      name: 'investor.clawback',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
      },
      bindings: [
        { exchange: 'investor.direct', routingKey: 'clawback' },
      ],
    });

    // Audit queue
    this.addQueue({
      name: 'audit.events',
      durable: true,
      arguments: {
        'x-queue-mode': 'lazy',
        'x-max-length': 10000000, // 10 million events
      },
      bindings: [
        { exchange: 'audit.topic', routingKey: 'audit.*' },
      ],
    });

    // Phase 3: Settlement queues
    this.addQueue({
      name: 'settlement.ach.settle',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'settlement.dlq',
      },
      bindings: [
        { exchange: 'settlement.topic', routingKey: 'ach.settlement.*' },
      ],
    });

    this.addQueue({
      name: 'settlement.ach.return',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'settlement.dlq',
      },
      bindings: [
        { exchange: 'settlement.topic', routingKey: 'ach.return.*' },
      ],
    });

    this.addQueue({
      name: 'settlement.wire.advice',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'settlement.dlq',
      },
      bindings: [
        { exchange: 'settlement.topic', routingKey: 'wire.advice.*' },
      ],
    });

    this.addQueue({
      name: 'settlement.check.clear',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'settlement.dlq',
      },
      bindings: [
        { exchange: 'settlement.topic', routingKey: 'check.clear.*' },
      ],
    });

    // Reconciliation queues
    this.addQueue({
      name: 'reconciliation.bank.import',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'reconciliation.dlq',
      },
      bindings: [
        { exchange: 'bank.topic', routingKey: 'bank.file.*' },
      ],
    });

    this.addQueue({
      name: 'reconciliation.match',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'reconciliation.dlq',
      },
      bindings: [
        { exchange: 'reconciliation.topic', routingKey: 'match.*' },
      ],
    });

    this.addQueue({
      name: 'reconciliation.exceptions',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'reconciliation.dlq',
      },
      bindings: [
        { exchange: 'reconciliation.topic', routingKey: 'exception.*' },
      ],
    });

    // AML/Compliance queues
    this.addQueue({
      name: 'compliance.hits',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'compliance.dlq',
      },
      bindings: [
        { exchange: 'compliance.topic', routingKey: 'compliance.hit.*' },
      ],
    });

    this.addQueue({
      name: 'aml.screen',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'aml.dlq',
      },
      bindings: [
        { exchange: 'aml.topic', routingKey: 'screen.*' },
      ],
    });

    this.addQueue({
      name: 'aml.review',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'aml.dlq',
      },
      bindings: [
        { exchange: 'aml.topic', routingKey: 'review.*' },
      ],
    });

    // Dead letter queues
    this.addQueue({
      name: 'dlq.payments',
      durable: true,
      bindings: [
        { exchange: 'dlx.main', routingKey: 'payments.dlq' },
      ],
    });

    this.addQueue({
      name: 'dlq.documents',
      durable: true,
      bindings: [
        { exchange: 'dlx.main', routingKey: 'documents.dlq' },
      ],
    });

    this.addQueue({
      name: 'dlq.notifications',
      durable: true,
      bindings: [
        { exchange: 'dlx.main', routingKey: 'notifications.dlq' },
      ],
    });

    // Phase 3 DLQs
    this.addQueue({
      name: 'dlq.settlement',
      durable: true,
      bindings: [
        { exchange: 'dlx.main', routingKey: 'settlement.dlq' },
      ],
    });

    this.addQueue({
      name: 'dlq.reconciliation',
      durable: true,
      bindings: [
        { exchange: 'dlx.main', routingKey: 'reconciliation.dlq' },
      ],
    });

    this.addQueue({
      name: 'dlq.compliance',
      durable: true,
      bindings: [
        { exchange: 'dlx.main', routingKey: 'compliance.dlq' },
      ],
    });

    this.addQueue({
      name: 'dlq.aml',
      durable: true,
      bindings: [
        { exchange: 'dlx.main', routingKey: 'aml.dlq' },
      ],
    });

    // Servicing DLQs (one per shard)
    for (let i = 0; i < 8; i++) {
      this.addQueue({
        name: `dlq.servicing.${i}`,
        durable: true,
        bindings: [
          { exchange: 'dlx.main', routingKey: `servicing.dlq.${i}` },
        ],
      });
    }
  }

  /**
   * Add an exchange definition
   */
  addExchange(exchange: ExchangeDefinition): void {
    this.exchanges.set(exchange.name, exchange);
  }

  /**
   * Add a queue definition
   */
  addQueue(queue: QueueDefinition): void {
    this.queues.set(queue.name, queue);
  }


  /**
   * Apply topology to a channel
   */
  async applyTopology(channel: amqp.Channel): Promise<void> {
    console.log('[RabbitMQ] Applying topology...');

    // Declare exchanges
    for (const exchange of Array.from(this.exchanges.values())) {
      await channel.assertExchange(
        exchange.name,
        exchange.type,
        {
          durable: exchange.durable ?? true,
          autoDelete: exchange.autoDelete ?? false,
          arguments: exchange.arguments,
        }
      );
      console.log(`[RabbitMQ] Exchange declared: ${exchange.name} (${exchange.type})`);
    }

    // Declare queues and bindings with conflict handling
    for (const queue of Array.from(this.queues.values())) {
      try {
        await channel.assertQueue(
          queue.name,
          {
            durable: queue.durable ?? true,
            exclusive: queue.exclusive ?? false,
            autoDelete: queue.autoDelete ?? false,
            arguments: queue.arguments,
          }
        );
        console.log(`[RabbitMQ] Queue declared: ${queue.name}`);

        // Apply bindings
        if (queue.bindings) {
          for (const binding of queue.bindings) {
            try {
              await channel.bindQueue(
                queue.name,
                binding.exchange,
                binding.routingKey,
                binding.arguments
              );
              console.log(`[RabbitMQ] Bound ${queue.name} to ${binding.exchange} with key ${binding.routingKey}`);
            } catch (bindError: any) {
              console.warn(`[RabbitMQ] Failed to bind ${queue.name} to ${binding.exchange}: ${bindError.message}`);
              // Continue with other bindings
            }
          }
        }
      } catch (queueError: any) {
        // Handle queue declaration conflicts gracefully
        if (queueError.code === 406) {
          console.warn(`⚠️  [RabbitMQ] CRITICAL: Queue ${queue.name} skipped due to argument conflict!`);
          console.warn(`   This queue exists with different arguments and cannot be declared.`);
          console.warn(`   Run 'npm run migrate-queues' to safely migrate conflicting queues.`);
          
          // Log critical warning if DLQ is skipped
          if (queue.name.includes('dlq')) {
            console.error(`🚨 CRITICAL: DLQ queue '${queue.name}' is not protected! System vulnerable to message loss!`);
          }
          
          // Still try to apply bindings even if queue declaration failed
          if (queue.bindings) {
            for (const binding of queue.bindings) {
              try {
                await channel.bindQueue(
                  queue.name,
                  binding.exchange,
                  binding.routingKey,
                  binding.arguments
                );
                console.log(`[RabbitMQ] Bound existing ${queue.name} to ${binding.exchange} with key ${binding.routingKey}`);
              } catch (bindError: any) {
                console.warn(`[RabbitMQ] Failed to bind ${queue.name}: ${bindError.message}`);
              }
            }
          }
        } else {
          // Re-throw non-conflict errors
          throw queueError;
        }
      }
    }

    console.log('[RabbitMQ] Topology applied successfully (with warnings for existing queues)');
  }

  /**
   * Get all exchange names
   */
  getExchangeNames(): string[] {
    return Array.from(this.exchanges.keys());
  }

  /**
   * Get all queue names
   */
  getQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * Get all queue definitions
   */
  getQueues(): Map<string, QueueDefinition> {
    return this.queues;
  }

  /**
   * Get topology statistics
   */
  getStats(): {
    exchanges: number;
    queues: number;
    quorumQueues: number;
    lazyQueues: number;
    dlqs: number;
  } {
    const quorumQueues = Array.from(this.queues.values()).filter(
      q => q.arguments?.['x-queue-type'] === 'quorum'
    ).length;

    const lazyQueues = Array.from(this.queues.values()).filter(
      q => q.arguments?.['x-queue-mode'] === 'lazy'
    ).length;

    const dlqs = Array.from(this.queues.keys()).filter(
      name => name.startsWith('dlq.')
    ).length;

    return {
      exchanges: this.exchanges.size,
      queues: this.queues.size,
      quorumQueues,
      lazyQueues,
      dlqs,
    };
  }
}