export const Exchanges = {
  COMMANDS: 'commands',         // direct exchange for commands
  EVENTS:   'loan.events',      // topic exchange for emitted events
  
  // New modernized exchanges (additive, no breaking changes)
  Commands: 'ls.commands',      // topic exchange for tenant-aware commands
  Events:   'ls.events',        // topic exchange for tenant-aware events  
  Schedules: 'ls.schedules',    // topic exchange for scheduled jobs
  Dlq:      'ls.dlq'           // fanout exchange for dead letter handling
} as const;

export const Queues = {
  // Existing queues (preserved for backwards compatibility)
  Import:        'import.command',
  Ocr:           'ocr.command',
  Datapoint:     'datapoint.command',
  Conflict:      'conflict.command',
  Disbursement:  'disbursement.command',
  Escrow:        'escrow.command',
  Ucdp:          'ucdp.command',
  Flood:         'flood.command',
  Hoi:           'hoi.command',
  Title:         'title.command',

  // New versioned command queues (scoped)
  LoanCreate:        'loan.create.v1',
  LoanUpdate:        'loan.update.v1',
  PaymentProcess:    'payment.process.v1',
  PaymentAllocate:   'payment.allocate.v1',
  EscrowDisburse:    'escrow.disburse.v1',
  DocumentProcess:   'document.process.v1',

  // Boarding and finalization queues (Legacy)
  LoanFinalizeCompleted: 'loan.finalize.completed.q',
  LoanBoardRequest:      'loan.board.request.q',

  // ETL orchestration
  EtlSchedule:       'etl.schedule.v1',
  EtlJob:            'etl.job.v1',

  // Maintenance tasks (replaces node-cron)
  MaintenanceSchedule: 'maintenance.schedule.v1',

  // Events / status
  StatusUpdate:      'status.update.v1',

  // Dead-letter
  Dlq:               'ls.dlq.v1'
} as const;

// Routing keys for modern queue operations
export const ROUTING_KEYS = {
  // Payment processing
  PAYMENT_PROCESS: Queues.PaymentProcess,
  PAYMENT_ALLOCATE: Queues.PaymentAllocate,
  
  // Loan operations  
  LOAN_CREATE: Queues.LoanCreate,
  LOAN_UPDATE: Queues.LoanUpdate,
  
  // Escrow operations
  ESCROW_DISBURSE: Queues.EscrowDisburse,
  
  // Document processing
  DOCUMENT_PROCESS: Queues.DocumentProcess,
  
  // ETL operations
  ETL_SCHEDULE: Queues.EtlSchedule,
  ETL_JOB: Queues.EtlJob,
  
  // Status updates
  STATUS_UPDATE: Queues.StatusUpdate
} as const;

export function retry(queue: string, suffix: string) {
  return `${queue}.retry.${suffix}`;
}
export function dlq(queue: string) {
  return `${queue}.dlq`;
}

/**
 * Declare modern RabbitMQ topology with tenant isolation and DLX
 */
export async function declareTopology(ch: any) {
  // Declare modern exchanges
  await ch.assertExchange(Exchanges.Commands, 'topic', { durable: true });
  await ch.assertExchange(Exchanges.Events, 'topic', { durable: true });
  await ch.assertExchange(Exchanges.Schedules, 'topic', { durable: true });
  await ch.assertExchange(Exchanges.Dlq, 'fanout', { durable: true });

  // Queue options with dead letter exchange and crash-safe quorum queues
  const withDlq = (q: string) => ({
    durable: true,
    arguments: {
      'x-dead-letter-exchange': Exchanges.Dlq,
      'x-queue-type': 'quorum' // crash-safe
    }
  });

  // Declare modern versioned queues
  const modernQueues = [
    Queues.LoanCreate,
    Queues.LoanUpdate, 
    Queues.PaymentProcess,
    Queues.PaymentAllocate,
    Queues.EscrowDisburse,
    Queues.DocumentProcess,
    Queues.LoanFinalizeCompleted,
    Queues.LoanBoardRequest,
    Queues.EtlSchedule,
    Queues.EtlJob,
    Queues.MaintenanceSchedule,
    Queues.StatusUpdate,
    Queues.Dlq
  ];

  for (const queue of modernQueues) {
    await ch.assertQueue(queue, withDlq(queue));
  }

  // Tenant-aware bindings (routing key pattern: tenant.*.action)
  await ch.bindQueue(Queues.LoanCreate, Exchanges.Commands, 'tenant.*.loan.create');
  await ch.bindQueue(Queues.LoanUpdate, Exchanges.Commands, 'tenant.*.loan.update');
  await ch.bindQueue(Queues.PaymentProcess, Exchanges.Commands, 'tenant.*.payment.process');
  await ch.bindQueue(Queues.PaymentAllocate, Exchanges.Commands, 'tenant.*.payment.allocate');
  await ch.bindQueue(Queues.EscrowDisburse, Exchanges.Commands, 'tenant.*.escrow.disburse');
  await ch.bindQueue(Queues.DocumentProcess, Exchanges.Commands, 'tenant.*.document.process');
  
  // Boarding workflow bindings (legacy)
  await ch.bindQueue(Queues.LoanFinalizeCompleted, Exchanges.Events, 'tenant.*.loan.finalize.completed');
  await ch.bindQueue(Queues.LoanBoardRequest, Exchanges.Commands, 'tenant.*.loan.board.request');
  
  await ch.bindQueue(Queues.EtlSchedule, Exchanges.Schedules, 'tenant.*.etl.schedule');
  await ch.bindQueue(Queues.EtlJob, Exchanges.Commands, 'tenant.*.etl.job');
  
  // Maintenance scheduling bindings (replaces node-cron)
  await ch.bindQueue(Queues.MaintenanceSchedule, Exchanges.Schedules, 'tenant.*.maintenance.schedule');
  
  await ch.bindQueue(Queues.StatusUpdate, Exchanges.Events, 'tenant.*.status.#');
  
  // Dead letter queue catches all failed messages
  await ch.bindQueue(Queues.Dlq, Exchanges.Dlq, '');
}