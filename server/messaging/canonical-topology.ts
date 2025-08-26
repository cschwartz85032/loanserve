/**
 * Canonical Queue Configurations
 * This file contains the single source of truth for all queue configurations
 * to ensure consistency across the entire codebase.
 */

import type { QueueDefinition } from './rabbitmq-topology';

// audit.events is a cold-path, append-only log stream.
// We use lazy mode to reduce memory and set large max-length
// to allow time-range based querying before rotation.
// Not using quorum queues to avoid replication overhead.
export const AUDIT_QUEUE: QueueDefinition = {
  name: 'audit.events',
  durable: true,
  autoDelete: false,
  arguments: {
    'x-queue-mode': 'lazy',
    'x-max-length': 10000000  // 10 million events
  },
  bindings: [
    { exchange: 'audit.topic', routingKey: 'audit.*' }
  ]
};

// Settlement queues - critical financial operations requiring quorum for durability
export const SETTLEMENT_QUEUES: QueueDefinition[] = [
  {
    name: 'settlement.ach.settle',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'settlement.ach.settle.dlq'
    },
    bindings: [
      { exchange: 'settlement.topic', routingKey: 'ach.settlement.*' }
    ]
  },
  {
    name: 'settlement.ach.return',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'settlement.ach.return.dlq'
    },
    bindings: [
      { exchange: 'settlement.topic', routingKey: 'ach.return.*' }
    ]
  },
  {
    name: 'settlement.wire.advice',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'settlement.wire.advice.dlq'
    },
    bindings: [
      { exchange: 'settlement.topic', routingKey: 'wire.advice.*' }
    ]
  },
  {
    name: 'settlement.check.clear',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'settlement.check.clear.dlq'
    },
    bindings: [
      { exchange: 'settlement.topic', routingKey: 'check.clear.*' }
    ]
  }
];

// Reconciliation queues - bank import and matching operations
export const RECONCILIATION_QUEUES: QueueDefinition[] = [
  {
    name: 'reconciliation.bank.import',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'reconciliation.bank.import.dlq'
    },
    bindings: [
      { exchange: 'bank.topic', routingKey: 'bank.file.*' }
    ]
  },
  {
    name: 'reconciliation.match',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'reconciliation.match.dlq'
    },
    bindings: [
      { exchange: 'bank.topic', routingKey: 'bank.match.*' }
    ]
  },
  {
    name: 'reconciliation.exceptions',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'reconciliation.exceptions.dlq'
    },
    bindings: [
      { exchange: 'bank.topic', routingKey: 'bank.exception.*' }
    ]
  }
];

// Compliance and AML queues - regulatory compliance operations
export const COMPLIANCE_QUEUES: QueueDefinition[] = [
  {
    name: 'compliance.hits',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'compliance.hits.dlq'
    },
    bindings: [
      { exchange: 'compliance.topic', routingKey: 'compliance.hit.*' }
    ]
  },
  {
    name: 'aml.screen',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'aml.screen.dlq'
    },
    bindings: [
      { exchange: 'aml.topic', routingKey: 'aml.screen.*' }
    ]
  },
  {
    name: 'aml.review',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'aml.review.dlq'
    },
    bindings: [
      { exchange: 'aml.topic', routingKey: 'aml.review.*' }
    ]
  }
];

// Payment processing queues - critical payment operations
export const PAYMENT_QUEUES: QueueDefinition[] = [
  {
    name: 'payments.process',
    durable: true,
    exclusive: false,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'payments.process.dlq'
    },
    bindings: [
      { exchange: 'payments.direct', routingKey: 'process' },
      { exchange: 'payments.topic', routingKey: 'payment.submit' },
      { exchange: 'payments.topic', routingKey: 'payment.pending' },
      { exchange: 'payments.topic', routingKey: 'batch.submit' },
      { exchange: 'batch.topic', routingKey: 'batch.payment.submit' }
    ]
  },
  {
    name: 'payments.allocate',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'payments.allocate.dlq'
    },
    bindings: [
      { exchange: 'payments.direct', routingKey: 'allocate' },
      { exchange: 'payments.topic', routingKey: 'payment.collected' },
      { exchange: 'batch.topic', routingKey: 'batch.payment.collected' }
    ]
  },
  {
    name: 'payments.refund',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'payments.refund.dlq'
    },
    bindings: [
      { exchange: 'payments.direct', routingKey: 'refund' },
      { exchange: 'payments.topic', routingKey: 'payment.refund' }
    ]
  },
  {
    name: 'payments.nsf',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'payments.nsf.dlq'
    },
    bindings: [
      { exchange: 'payments.direct', routingKey: 'nsf' },
      { exchange: 'payments.topic', routingKey: 'payment.nsf' }
    ]
  },
  {
    name: 'payments.compliance',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'payments.compliance.dlq'
    },
    bindings: [
      { exchange: 'payments.topic', routingKey: 'payment.#' }
    ]
  }
];

// Escrow management queues
export const ESCROW_QUEUES: QueueDefinition[] = [
  {
    name: 'escrow.analyze',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'escrow.analyze.dlq'
    },
    bindings: [
      { exchange: 'escrow.direct', routingKey: 'analyze' },
      { exchange: 'escrow.topic', routingKey: 'escrow.analyze' },
      { exchange: 'escrow.topic', routingKey: 'account.*.update' }
    ]
  },
  {
    name: 'escrow.disburse',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'escrow.disburse.dlq'
    },
    bindings: [
      { exchange: 'escrow.direct', routingKey: 'disburse' },
      { exchange: 'escrow.topic', routingKey: 'escrow.disburse' },
      { exchange: 'escrow.topic', routingKey: 'disbursement.*.approved' }
    ]
  },
  {
    name: 'escrow.apply',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'escrow.apply.dlq'
    },
    bindings: [
      { exchange: 'payments.topic', routingKey: 'payment.*.processed' }
    ]
  },
  {
    name: 'escrow.reverse',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'escrow.reverse.dlq'
    },
    bindings: [
      { exchange: 'payments.topic', routingKey: 'payment.*.reversed' }
    ]
  }
];

// Investor management queues
export const INVESTOR_QUEUES: QueueDefinition[] = [
  {
    name: 'investor.remit',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'investor.remit.dlq'
    },
    bindings: [
      { exchange: 'investor.direct', routingKey: 'remit' },
      { exchange: 'investor.topic', routingKey: 'investor.remit' }
    ]
  },
  {
    name: 'investor.calc.p1',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'investor.calc.p1.dlq'
    },
    bindings: [
      { exchange: 'investor.direct', routingKey: 'calc.p1' }
    ]
  },
  {
    name: 'investor.clawback',
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'investor.clawback.dlq'
    },
    bindings: [
      { exchange: 'investor.direct', routingKey: 'clawback' }
    ]
  }
];

// Daily servicing operations
export const SERVICING_QUEUES: QueueDefinition[] = [
  {
    name: 'servicing.daily.tasks.0',
    durable: true,
    exclusive: false,
    arguments: {
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'servicing.daily.tasks.dlq'
    },
    bindings: [
      { exchange: 'servicing.direct', routingKey: 'daily.tasks' },
      { exchange: 'servicing.topic', routingKey: 'scheduled.daily.*' }
    ]
  },
  {
    name: 'servicing.monthly.statements',
    durable: true,
    exclusive: false,
    arguments: {
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'servicing.monthly.statements.dlq'
    },
    bindings: [
      { exchange: 'servicing.direct', routingKey: 'monthly.statements' },
      { exchange: 'servicing.topic', routingKey: 'scheduled.monthly.*' }
    ]
  }
];

// Dead letter queues with versioning for migration support
export const DLQ_QUEUES: QueueDefinition[] = [
  // Main DLQs
  {
    name: 'dlq.main',
    durable: true,
    arguments: {
      'x-message-ttl': 86400000 // 24 hours
    },
    bindings: [
      { exchange: 'dlx.main', routingKey: '#' }
    ]
  },
  {
    name: 'dlq.settlement',
    durable: true,
    arguments: {
      'x-message-ttl': 86400000 // 24 hours
    },
    bindings: []
  },
  {
    name: 'dlq.reconciliation',
    durable: true,
    arguments: {
      'x-message-ttl': 86400000 // 24 hours
    },
    bindings: []
  },
  {
    name: 'dlq.compliance',
    durable: true,
    arguments: {
      'x-message-ttl': 86400000 // 24 hours
    },
    bindings: []
  },
  {
    name: 'dlq.aml',
    durable: true,
    arguments: {
      'x-message-ttl': 86400000 // 24 hours
    },
    bindings: []
  },
  // Versioned DLQ for escrow (migration support)
  {
    name: 'q.escrow.dlq.v2',
    durable: true,
    exclusive: false,
    arguments: {
      'x-message-ttl': 86400000 // 24 hours
    },
    bindings: [
      { exchange: 'dlx.main', routingKey: 'escrow.*.dlq' },
      { exchange: 'dlx.main', routingKey: 'escrow.#' }
    ]
  }
];

// Batch processing queues
export const BATCH_QUEUES: QueueDefinition[] = [
  {
    name: 'batch.payment.submit',
    durable: true,
    exclusive: false,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'batch.payment.submit.dlq'
    },
    bindings: [
      { exchange: 'batch.topic', routingKey: 'batch.payment.submit' }
    ]
  },
  {
    name: 'batch.payment.collected',
    durable: true,
    exclusive: false,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'dlx.main',
      'x-dead-letter-routing-key': 'batch.payment.collected.dlq'
    },
    bindings: [
      { exchange: 'batch.topic', routingKey: 'batch.payment.collected' }
    ]
  }
];

// Export all queues as a single array for easy iteration
export const ALL_CANONICAL_QUEUES: QueueDefinition[] = [
  AUDIT_QUEUE,
  ...SETTLEMENT_QUEUES,
  ...RECONCILIATION_QUEUES,
  ...COMPLIANCE_QUEUES,
  ...PAYMENT_QUEUES,
  ...ESCROW_QUEUES,
  ...INVESTOR_QUEUES,
  ...SERVICING_QUEUES,
  ...DLQ_QUEUES,
  ...BATCH_QUEUES
];

// Helper function to get queue by name
export function getCanonicalQueue(name: string): QueueDefinition | undefined {
  return ALL_CANONICAL_QUEUES.find(q => q.name === name);
}

// Helper function to validate if a queue matches canonical config
export function isCanonicalMatch(queue: QueueDefinition): boolean {
  const canonical = getCanonicalQueue(queue.name);
  if (!canonical) return false;
  
  return JSON.stringify(canonical.arguments) === JSON.stringify(queue.arguments);
}