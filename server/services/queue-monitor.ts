/**
 * Queue Monitoring Service
 * Provides real-time metrics and status for RabbitMQ queues
 */

import { getEnhancedRabbitMQService } from './rabbitmq-enhanced.js';
import { topologyManager } from '../messaging/rabbitmq-topology.js';

export interface QueueMetrics {
  name: string;
  messages: number;
  messagesReady: number;
  messagesUnacknowledged: number;
  consumers: number;
  idleSince?: string;
  type?: string;
  durable: boolean;
  autoDelete: boolean;
  exclusive: boolean;
  arguments?: Record<string, any>;
}

export interface ExchangeMetrics {
  name: string;
  type: string;
  durable: boolean;
  autoDelete: boolean;
  internal: boolean;
  arguments?: Record<string, any>;
}

export interface ConnectionMetrics {
  connected: boolean;
  reconnectAttempts: number;
  publisherConnected: boolean;
  consumerConnected: boolean;
  activeConsumers: number;
  uptime?: number;
  lastError?: string;
}

export interface QueueHealth {
  queue: string;
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  recommendations?: string[];
}

export class QueueMonitorService {
  private rabbitmq = getEnhancedRabbitMQService();
  private startTime = Date.now();

  /**
   * Get metrics for all queues
   */
  async getAllQueueMetrics(): Promise<QueueMetrics[]> {
    const metrics: QueueMetrics[] = [];
    const queueNames = topologyManager.getQueueNames();

    for (const queueName of queueNames) {
      try {
        const queueStats = await this.rabbitmq.getQueueStats(queueName);
        if (queueStats) {
          metrics.push({
            name: queueStats.queue,
            messages: queueStats.messageCount,
            messagesReady: queueStats.messageCount,
            messagesUnacknowledged: 0,
            consumers: queueStats.consumerCount,
            durable: true,
            autoDelete: false,
            exclusive: false,
            type: this.determineQueueType(queueName)
          });
        }
      } catch (error) {
        console.error(`[QueueMonitor] Error getting stats for queue ${queueName}:`, error);
        // Add placeholder for failed queue
        metrics.push({
          name: queueName,
          messages: -1,
          messagesReady: -1,
          messagesUnacknowledged: -1,
          consumers: -1,
          durable: true,
          autoDelete: false,
          exclusive: false,
          type: this.determineQueueType(queueName)
        });
      }
    }

    return metrics;
  }

  /**
   * Get metrics for a specific queue
   */
  async getQueueMetrics(queueName: string): Promise<QueueMetrics | null> {
    try {
      const queueStats = await this.rabbitmq.getQueueStats(queueName);
      if (!queueStats) return null;

      return {
        name: queueStats.queue,
        messages: queueStats.messageCount,
        messagesReady: queueStats.messageCount,
        messagesUnacknowledged: 0,
        consumers: queueStats.consumerCount,
        durable: true,
        autoDelete: false,
        exclusive: false,
        type: this.determineQueueType(queueName)
      };
    } catch (error) {
      console.error(`[QueueMonitor] Error getting metrics for queue ${queueName}:`, error);
      return null;
    }
  }

  /**
   * Get all exchange metrics
   */
  async getAllExchangeMetrics(): Promise<ExchangeMetrics[]> {
    const exchangeNames = topologyManager.getExchangeNames();
    
    return exchangeNames.map(name => {
      const exchangeType = this.determineExchangeType(name);
      return {
        name,
        type: exchangeType,
        durable: true,
        autoDelete: false,
        internal: false
      };
    });
  }

  /**
   * Get connection metrics
   */
  getConnectionMetrics(): ConnectionMetrics {
    const info = this.rabbitmq.getConnectionInfo();
    return {
      ...info,
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Get queue health status
   */
  async getQueueHealth(): Promise<QueueHealth[]> {
    const health: QueueHealth[] = [];
    const queueMetrics = await this.getAllQueueMetrics();

    for (const queue of queueMetrics) {
      const issues: string[] = [];
      const recommendations: string[] = [];
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';

      // Check for connection issues
      if (queue.messages === -1) {
        issues.push('Unable to retrieve queue metrics');
        status = 'critical';
        recommendations.push('Check RabbitMQ connection');
        health.push({ queue: queue.name, status, issues, recommendations });
        continue;
      }

      // Check message backlog
      if (queue.messages > 10000) {
        issues.push(`High message backlog: ${queue.messages} messages`);
        status = 'critical';
        recommendations.push('Scale up consumers or investigate processing bottleneck');
      } else if (queue.messages > 1000) {
        issues.push(`Message backlog: ${queue.messages} messages`);
        status = 'warning';
        recommendations.push('Monitor consumer performance');
      }

      // Check consumer count
      if (queue.consumers === 0 && queue.messages > 0) {
        issues.push('No active consumers');
        status = 'critical';
        recommendations.push('Start consumer process');
      }

      // Check for DLQ messages
      if (queue.name.startsWith('dlq.') && queue.messages > 0) {
        issues.push(`${queue.messages} messages in dead letter queue`);
        status = status === 'critical' ? 'critical' : 'warning';
        recommendations.push('Investigate message failures');
      }

      health.push({
        queue: queue.name,
        status,
        issues,
        recommendations: recommendations.length > 0 ? recommendations : undefined
      });
    }

    return health;
  }

  /**
   * Get aggregated statistics
   */
  async getAggregatedStats(): Promise<{
    totalQueues: number;
    totalMessages: number;
    totalConsumers: number;
    queuesByType: Record<string, number>;
    healthSummary: {
      healthy: number;
      warning: number;
      critical: number;
    };
  }> {
    const queueMetrics = await this.getAllQueueMetrics();
    const health = await this.getQueueHealth();

    const queuesByType: Record<string, number> = {};
    let totalMessages = 0;
    let totalConsumers = 0;

    for (const queue of queueMetrics) {
      const type = queue.type || 'unknown';
      queuesByType[type] = (queuesByType[type] || 0) + 1;
      
      if (queue.messages >= 0) {
        totalMessages += queue.messages;
      }
      if (queue.consumers >= 0) {
        totalConsumers += queue.consumers;
      }
    }

    const healthSummary = {
      healthy: health.filter(h => h.status === 'healthy').length,
      warning: health.filter(h => h.status === 'warning').length,
      critical: health.filter(h => h.status === 'critical').length
    };

    return {
      totalQueues: queueMetrics.length,
      totalMessages,
      totalConsumers,
      queuesByType,
      healthSummary
    };
  }

  /**
   * Get message flow rates (simplified - would need time-series data in production)
   */
  async getMessageFlowRates(): Promise<{
    queue: string;
    publishRate: number;
    consumeRate: number;
  }[]> {
    // In production, this would track message counts over time
    // For now, return mock rates based on queue type
    const queues = await this.getAllQueueMetrics();
    
    return queues.map(q => ({
      queue: q.name,
      publishRate: Math.random() * 100, // Messages per second
      consumeRate: Math.random() * 100  // Messages per second
    }));
  }

  /**
   * Purge a queue (dangerous operation)
   */
  async purgeQueue(queueName: string): Promise<number> {
    try {
      return await this.rabbitmq.purgeQueue(queueName);
    } catch (error) {
      console.error(`[QueueMonitor] Error purging queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Helper to determine queue type
   */
  private determineQueueType(queueName: string): string {
    if (queueName.startsWith('dlq.')) return 'dead-letter';
    if (queueName.startsWith('payments.')) return 'payment';
    if (queueName.startsWith('servicing.')) return 'servicing';
    if (queueName.startsWith('documents.')) return 'document';
    if (queueName.startsWith('notifications.')) return 'notification';
    if (queueName.startsWith('escrow.')) return 'escrow';
    if (queueName.startsWith('compliance.')) return 'compliance';
    if (queueName.startsWith('investor.')) return 'investor';
    if (queueName.startsWith('audit.')) return 'audit';
    if (queueName.startsWith('settlement.')) return 'settlement';
    if (queueName.startsWith('reconciliation.')) return 'reconciliation';
    if (queueName.startsWith('aml.')) return 'aml';
    return 'other';
  }

  /**
   * Helper to determine exchange type
   */
  private determineExchangeType(exchangeName: string): string {
    if (exchangeName.endsWith('.topic')) return 'topic';
    if (exchangeName.endsWith('.direct')) return 'direct';
    if (exchangeName.endsWith('.fanout')) return 'fanout';
    if (exchangeName === 'dlx.main') return 'topic';
    return 'topic';
  }
}

export const queueMonitor = new QueueMonitorService();