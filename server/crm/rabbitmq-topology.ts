/**
 * Clean RabbitMQ Topology for CRM Email System
 * Following fire-and-queue architecture
 */

import type { TopologyConfig } from '../services/topology-manager';

/**
 * CRM Email topology configuration
 * Simple, clean topology with proper DLQ handling
 */
export const crmEmailTopology: TopologyConfig = {
  exchanges: [
    {
      name: 'crm.email.topic',
      type: 'topic',
      options: {
        durable: true,
        autoDelete: false
      }
    },
    {
      name: 'notifications.topic',
      type: 'topic', 
      options: {
        durable: true,
        autoDelete: false
      }
    }
  ],
  
  queues: [
    // Primary CRM email processing queue
    {
      name: 'q.crm.email.v1',
      options: {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {
          'x-message-ttl': 3600000, // 1 hour TTL
          'x-dead-letter-exchange': 'crm.email.dlx',
          'x-dead-letter-routing-key': 'crm.email.failed'
        }
      }
    },
    
    // Dead letter queue for failed emails
    {
      name: 'q.crm.email.dlq.v1',
      options: {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {
          'x-message-ttl': 86400000 // 24 hour TTL for DLQ
        }
      }
    },

    // Notification events queue (for email sent/failed events)
    {
      name: 'q.crm.notifications.v1',
      options: {
        durable: true,
        exclusive: false,
        autoDelete: false
      }
    }
  ],

  bindings: [
    // Route email requests to processing queue
    {
      exchange: 'crm.email.topic',
      queue: 'q.crm.email.v1',
      routingKey: 'crm.email.requested.v1'
    },
    
    // Route notification events
    {
      exchange: 'notifications.topic',
      queue: 'q.crm.notifications.v1',
      routingKey: 'crm.email.sent.v1'
    },
    {
      exchange: 'notifications.topic',
      queue: 'q.crm.notifications.v1',
      routingKey: 'crm.email.failed.v1'
    },

    // DLQ bindings (dead letter exchange)
    {
      exchange: 'crm.email.dlx',
      queue: 'q.crm.email.dlq.v1',
      routingKey: 'crm.email.failed'
    }
  ]
};

/**
 * Register CRM email topology with the topology manager
 */
export function registerCRMEmailTopology(topologyManager: any) {
  topologyManager.addTopology('crm-email', crmEmailTopology);
  console.log('[CRMTopology] CRM email topology registered');
}