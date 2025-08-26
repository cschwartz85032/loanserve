#!/usr/bin/env tsx

/**
 * Create Phase 4 Document and Notice queues in RabbitMQ
 */

import amqp from 'amqplib';

async function createDocumentQueues() {
  const url = process.env.CLOUDAMQP_URL || process.env.AMQP_URL || 'amqp://localhost';
  
  console.log('[Docs] Connecting to RabbitMQ...');
  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();
  
  try {
    console.log('[Docs] Creating document exchanges...');
    
    // Create exchanges
    await channel.assertExchange('docs.saga', 'topic', { durable: true });
    await channel.assertExchange('docs.events', 'topic', { durable: true });
    await channel.assertExchange('docs.dlq', 'direct', { durable: true });
    await channel.assertExchange('notices.saga', 'topic', { durable: true });
    await channel.assertExchange('notices.events', 'topic', { durable: true });
    await channel.assertExchange('notices.dlq', 'direct', { durable: true });
    
    console.log('[Docs] Exchanges created.');
    
    console.log('[Docs] Creating document queues...');
    
    // Create queues with dead letter configuration
    const queueArgs = {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'docs.dlq',
      'x-delivery-limit': 6
    };
    
    const noticeQueueArgs = {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'notices.dlq',
      'x-delivery-limit': 6
    };
    
    // Document queues
    await channel.assertQueue('q.docs.generate', { durable: true, arguments: queueArgs });
    await channel.assertQueue('q.docs.render', { durable: true, arguments: queueArgs });
    await channel.assertQueue('q.docs.events.audit', { durable: true, arguments: queueArgs });
    await channel.assertQueue('q.docs.dlq', { durable: true, arguments: { 'x-queue-type': 'quorum' } });
    
    console.log('[Docs] Document queues created.');
    
    // Notice queues
    await channel.assertQueue('q.notices.schedule', { durable: true, arguments: noticeQueueArgs });
    await channel.assertQueue('q.notices.dispatch', { durable: true, arguments: noticeQueueArgs });
    await channel.assertQueue('q.notices.events.audit', { durable: true, arguments: noticeQueueArgs });
    await channel.assertQueue('q.notices.dlq', { durable: true, arguments: { 'x-queue-type': 'quorum' } });
    
    console.log('[Docs] Notice queues created.');
    
    console.log('[Docs] Creating queue bindings...');
    
    // Document bindings
    await channel.bindQueue('q.docs.generate', 'docs.saga', 'generate.request.v1');
    await channel.bindQueue('q.docs.render', 'docs.saga', 'render.request.v1');
    await channel.bindQueue('q.docs.events.audit', 'docs.events', 'doc.*');
    await channel.bindQueue('q.docs.dlq', 'docs.dlq', '#');
    
    // Notice bindings
    await channel.bindQueue('q.notices.schedule', 'notices.saga', 'schedule.request.v1');
    await channel.bindQueue('q.notices.dispatch', 'notices.saga', 'dispatch.request.v1');
    await channel.bindQueue('q.notices.events.audit', 'notices.events', 'notice.*');
    await channel.bindQueue('q.notices.dlq', 'notices.dlq', '#');
    
    console.log('[Docs] All bindings created successfully!');
    
    // Summary
    console.log('\n[Docs] ✅ Phase 4 messaging infrastructure created:');
    console.log('  - 6 exchanges (docs.saga, docs.events, docs.dlq, notices.saga, notices.events, notices.dlq)');
    console.log('  - 8 queues (q.docs.generate, q.docs.render, q.docs.events.audit, q.docs.dlq)');
    console.log('  -          (q.notices.schedule, q.notices.dispatch, q.notices.events.audit, q.notices.dlq)');
    console.log('  - All bindings configured');
    
  } catch (error) {
    console.error('[Docs] Error creating queues:', error);
    throw error;
  } finally {
    await channel.close();
    await connection.close();
  }
}

createDocumentQueues()
  .then(() => {
    console.log('[Docs] Setup complete.');
    process.exit(0);
  })
  .catch(err => {
    console.error('[Docs] Fatal error:', err);
    process.exit(1);
  });