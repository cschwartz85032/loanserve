/**
 * Script to apply the RabbitMQ topology
 * This ensures all exchanges and queues are created
 */

import amqp from 'amqplib';
import { topologyManager } from '../messaging/topology';

async function applyTopology() {
  const url = process.env.CLOUDAMQP_URL || process.env.AMQP_URL || 'amqp://localhost';
  
  console.log('[Topology] Connecting to RabbitMQ...');
  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();
  
  console.log('[Topology] Applying topology...');
  await topologyManager.applyTopology(channel);
  
  const stats = topologyManager.getStats();
  console.log('[Topology] Topology applied successfully!');
  console.log('[Topology] Stats:', stats);
  
  await channel.close();
  await connection.close();
  
  console.log('[Topology] Done.');
}

applyTopology()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[Topology] Error:', err);
    process.exit(1);
  });