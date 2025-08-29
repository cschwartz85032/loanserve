/**
 * CRM Email Topology Setup
 * Registers and initializes CRM email topology with the system
 */

import amqp from 'amqplib';
import { crmEmailTopology } from './rabbitmq-topology';

export class CRMTopologySetup {
  private url: string;

  constructor() {
    this.url = process.env.CLOUDAMQP_URL || '';
  }

  /**
   * Initialize the CRM email topology
   */
  async initialize(): Promise<void> {
    if (!this.url) {
      console.log('[CRMTopology] No CloudAMQP URL configured, skipping topology setup');
      return;
    }

    let connection: amqp.Connection | null = null;
    let channel: amqp.Channel | null = null;

    try {
      console.log('[CRMTopology] Setting up CRM email topology...');

      // Create temporary connection for topology setup
      connection = await amqp.connect(this.url);
      channel = await connection.createChannel();

      // Create exchanges
      for (const exchange of crmEmailTopology.exchanges) {
        await channel.assertExchange(
          exchange.name,
          exchange.type,
          exchange.options
        );
        console.log(`[CRMTopology] Created exchange: ${exchange.name}`);
      }

      // Create dead letter exchange for DLQ
      await channel.assertExchange('crm.email.dlx', 'direct', {
        durable: true,
        autoDelete: false
      });
      console.log('[CRMTopology] Created dead letter exchange: crm.email.dlx');

      // Create queues
      for (const queue of crmEmailTopology.queues) {
        await channel.assertQueue(
          queue.name,
          queue.options
        );
        console.log(`[CRMTopology] Created queue: ${queue.name}`);
      }

      // Create bindings
      for (const binding of crmEmailTopology.bindings) {
        await channel.bindQueue(
          binding.queue,
          binding.exchange,
          binding.routingKey
        );
        console.log(`[CRMTopology] Bound ${binding.queue} to ${binding.exchange} with key ${binding.routingKey}`);
      }

      console.log('[CRMTopology] CRM email topology setup complete');

    } catch (error) {
      console.error('[CRMTopology] Failed to setup topology:', error);
      throw error;
    } finally {
      // Clean up temporary connection
      if (channel) {
        await channel.close();
      }
      if (connection) {
        await connection.close();
      }
    }
  }

  /**
   * Check if topology is properly configured
   */
  async validate(): Promise<boolean> {
    if (!this.url) {
      return false;
    }

    let connection: amqp.Connection | null = null;
    let channel: amqp.Channel | null = null;

    try {
      connection = await amqp.connect(this.url);
      channel = await connection.createChannel();

      // Check if main queue exists
      await channel.checkQueue('q.crm.email.v1');
      
      // Check if exchange exists
      await channel.checkExchange('crm.email.topic');

      return true;
    } catch (error) {
      console.error('[CRMTopology] Validation failed:', error);
      return false;
    } finally {
      if (channel) {
        await channel.close();
      }
      if (connection) {
        await connection.close();
      }
    }
  }
}

// Export singleton instance
export const crmTopologySetup = new CRMTopologySetup();