/**
 * Script to create only the missing escrow queues
 * Avoids conflicts with existing queue declarations
 */

import amqp from 'amqplib';

async function createEscrowQueues() {
  const url = process.env.CLOUDAMQP_URL || process.env.AMQP_URL || 'amqp://localhost';
  
  console.log('[Escrow] Connecting to RabbitMQ...');
  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();
  
  try {
    console.log('[Escrow] Creating escrow exchanges...');
    
    // Declare escrow exchanges (safe to redeclare with same config)
    await channel.assertExchange('escrow.saga', 'topic', { durable: true });
    await channel.assertExchange('escrow.events', 'topic', { durable: true });
    await channel.assertExchange('escrow.dlq', 'direct', { durable: true });
    
    console.log('[Escrow] Exchanges created.');
    
    console.log('[Escrow] Creating escrow queues...');
    
    // Create escrow queues - using regular durability, not quorum type
    // to avoid conflicts with CloudAMQP
    
    // Forecast queue
    await channel.assertQueue('q.forecast', {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'escrow.dlq',
        'x-dead-letter-routing-key': 'forecast.failed'
      }
    });
    console.log('[Escrow] Queue created: q.forecast');
    
    // Disbursement scheduling queue
    await channel.assertQueue('q.schedule.disbursement', {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'escrow.dlq',
        'x-dead-letter-routing-key': 'disbursement.failed'
      }
    });
    console.log('[Escrow] Queue created: q.schedule.disbursement');
    
    // Analysis queue
    await channel.assertQueue('q.escrow.analysis', {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'escrow.dlq',
        'x-dead-letter-routing-key': 'analysis.failed'
      }
    });
    console.log('[Escrow] Queue created: q.escrow.analysis');
    
    // Escrow DLQ
    await channel.assertQueue('q.escrow.dlq', {
      durable: true,
      arguments: {
        'x-message-ttl': 86400000 // 24 hours
      }
    });
    console.log('[Escrow] Queue created: q.escrow.dlq');
    
    console.log('[Escrow] Creating bindings...');
    
    // Create bindings
    await channel.bindQueue('q.forecast', 'escrow.saga', 'forecast.request');
    await channel.bindQueue('q.forecast', 'escrow.saga', 'forecast.retry');
    console.log('[Escrow] Bindings created for q.forecast');
    
    await channel.bindQueue('q.schedule.disbursement', 'escrow.saga', 'disbursement.schedule');
    await channel.bindQueue('q.schedule.disbursement', 'escrow.saga', 'disbursement.retry');
    console.log('[Escrow] Bindings created for q.schedule.disbursement');
    
    await channel.bindQueue('q.escrow.analysis', 'escrow.saga', 'analysis.request');
    await channel.bindQueue('q.escrow.analysis', 'escrow.saga', 'analysis.retry');
    console.log('[Escrow] Bindings created for q.escrow.analysis');
    
    await channel.bindQueue('q.escrow.dlq', 'escrow.dlq', '#');
    console.log('[Escrow] Bindings created for q.escrow.dlq');
    
    console.log('[Escrow] All escrow queues and bindings created successfully!');
    
  } catch (error) {
    console.error('[Escrow] Error creating queues:', error);
    throw error;
  } finally {
    await channel.close();
    await connection.close();
  }
}

createEscrowQueues()
  .then(() => {
    console.log('[Escrow] Setup complete.');
    process.exit(0);
  })
  .catch(err => {
    console.error('[Escrow] Fatal error:', err);
    process.exit(1);
  });