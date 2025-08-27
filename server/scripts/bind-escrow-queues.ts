/**
 * Script to bind the escrow queues to their exchanges
 */

import amqp from 'amqplib';

async function bindEscrowQueues() {
  const url = process.env.CLOUDAMQP_URL || process.env.AMQP_URL || 'amqp://localhost';
  
  console.log('[Escrow] Connecting to RabbitMQ...');
  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();
  
  try {
    console.log('[Escrow] Creating bindings...');
    
    // Create bindings for forecast queue
    await channel.bindQueue('q.forecast', 'escrow.saga', 'forecast.request');
    await channel.bindQueue('q.forecast', 'escrow.saga', 'forecast.retry');
    console.log('[Escrow] Bindings created for q.forecast');
    
    // Create bindings for disbursement queue
    await channel.bindQueue('q.schedule.disbursement', 'escrow.saga', 'disbursement.schedule');
    await channel.bindQueue('q.schedule.disbursement', 'escrow.saga', 'disbursement.retry');
    console.log('[Escrow] Bindings created for q.schedule.disbursement');
    
    // Create bindings for analysis queue
    await channel.bindQueue('q.escrow.analysis.v2', 'escrow.saga', 'analysis.request');
    await channel.bindQueue('q.escrow.analysis.v2', 'escrow.saga', 'analysis.retry');
    console.log('[Escrow] Bindings created for q.escrow.analysis.v2');
    
    console.log('[Escrow] All bindings created successfully!');
    
  } catch (error) {
    console.error('[Escrow] Error creating bindings:', error);
    throw error;
  } finally {
    await channel.close();
    await connection.close();
  }
}

bindEscrowQueues()
  .then(() => {
    console.log('[Escrow] Binding complete.');
    process.exit(0);
  })
  .catch(err => {
    console.error('[Escrow] Fatal error:', err);
    process.exit(1);
  });