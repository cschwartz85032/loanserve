/**
 * Escrow Queue Initialization
 * 
 * Creates all necessary RabbitMQ queues, exchanges, and bindings for the escrow subsystem
 */

import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';

export async function initializeEscrowQueues(): Promise<void> {
  console.log('[EscrowInit] Initializing escrow queues and exchanges...');
  
  const rabbitmq = getEnhancedRabbitMQService();
  
  try {
    // Wait for connection
    await rabbitmq.waitForConnection();
    
    // Declare exchanges
    const exchanges = [
      { name: 'escrow.saga', type: 'topic' as const, durable: true },
      { name: 'escrow.events', type: 'topic' as const, durable: true },
      { name: 'escrow.dlq', type: 'topic' as const, durable: true }
    ];
    
    for (const exchange of exchanges) {
      await rabbitmq.assertExchange(exchange.name, exchange.type, { durable: exchange.durable });
      console.log(`[EscrowInit] Exchange created: ${exchange.name}`);
    }
    
    // Declare queues with DLQ settings
    const queues = [
      {
        name: 'q.forecast.v2',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'escrow.dlq',
          'x-dead-letter-routing-key': 'forecast.failed',
          'x-delivery-limit': 6
        }
      },
      {
        name: 'q.schedule.disbursement.v2',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'escrow.dlq',
          'x-dead-letter-routing-key': 'disbursement.failed',
          'x-delivery-limit': 6
        }
      },
      {
        name: 'q.escrow.analysis',
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'escrow.dlq',
          'x-dead-letter-routing-key': 'analysis.failed'
        }
      },
      {
        name: 'q.escrow.dlq.v2',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-message-ttl': 86400000 // 24 hours
        }
      }
    ];
    
    for (const queue of queues) {
      await rabbitmq.assertQueue(queue.name, {
        durable: queue.durable,
        arguments: queue.arguments
      });
      console.log(`[EscrowInit] Queue created: ${queue.name}`);
    }
    
    // Create bindings
    const bindings = [
      // Forecast bindings
      { queue: 'q.forecast.v2', exchange: 'escrow.saga', routingKey: 'forecast.request' },
      { queue: 'q.forecast.v2', exchange: 'escrow.saga', routingKey: 'forecast.retry' },
      
      // Disbursement bindings
      { queue: 'q.schedule.disbursement.v2', exchange: 'escrow.saga', routingKey: 'disbursement.schedule' },
      { queue: 'q.schedule.disbursement.v2', exchange: 'escrow.saga', routingKey: 'disbursement.retry' },
      
      // Analysis bindings
      { queue: 'q.escrow.analysis', exchange: 'escrow.saga', routingKey: 'analysis.request' },
      { queue: 'q.escrow.analysis', exchange: 'escrow.saga', routingKey: 'analysis.retry' },
      
      // DLQ bindings
      { queue: 'q.escrow.dlq.v2', exchange: 'escrow.dlq', routingKey: '#' } // Catch all failures
    ];
    
    for (const binding of bindings) {
      await rabbitmq.bindQueue(binding.queue, binding.exchange, binding.routingKey);
      console.log(`[EscrowInit] Binding created: ${binding.queue} <- ${binding.exchange}:${binding.routingKey}`);
    }
    
    console.log('[EscrowInit] Escrow queues and exchanges initialized successfully');
    
  } catch (error) {
    console.error('[EscrowInit] Failed to initialize escrow queues:', error);
    throw error;
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeEscrowQueues()
    .then(() => {
      console.log('[EscrowInit] Initialization complete');
      process.exit(0);
    })
    .catch(error => {
      console.error('[EscrowInit] Fatal error:', error);
      process.exit(1);
    });
}