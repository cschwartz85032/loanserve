/**
 * RabbitMQ Queue Health Monitor
 * Tracks queue metrics and provides health assessments
 */

import amqp from 'amqplib';
import { rabbitmqEnhanced } from '../services/rabbitmq-enhanced';

export interface QueueHealth {
  name: string;
  messages: number;
  messagesReady: number;
  messagesUnacknowledged: number;
  consumers: number;
  messageRate: number;
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  recommendations: string[];
}

export interface TopologyHealth {
  timestamp: Date;
  totalQueues: number;
  totalExchanges: number;
  healthyQueues: number;
  warningQueues: number;
  criticalQueues: number;
  totalMessages: number;
  totalConsumers: number;
  queues: QueueHealth[];
  overallStatus: 'healthy' | 'warning' | 'critical';
  recommendations: string[];
}

export class QueueMonitor {
  private static readonly THRESHOLDS = {
    // Queue depth thresholds
    MESSAGES_WARNING: 1000,
    MESSAGES_CRITICAL: 10000,
    
    // Unacknowledged message thresholds
    UNACKED_WARNING: 100,
    UNACKED_CRITICAL: 500,
    
    // Consumer thresholds
    MIN_CONSUMERS_WARNING: 0,
    
    // Message rate thresholds (messages/second)
    HIGH_RATE_WARNING: 100,
    HIGH_RATE_CRITICAL: 500,
  };

  /**
   * Check individual queue health
   */
  private static assessQueueHealth(queue: any): QueueHealth {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Check queue depth
    if (queue.messageCount > this.THRESHOLDS.MESSAGES_CRITICAL) {
      status = 'critical';
      issues.push(`Queue depth critical: ${queue.messageCount} messages`);
      recommendations.push('Increase consumer count or processing capacity');
    } else if (queue.messageCount > this.THRESHOLDS.MESSAGES_WARNING) {
      if (status === 'healthy') status = 'warning';
      issues.push(`Queue depth high: ${queue.messageCount} messages`);
      recommendations.push('Monitor queue depth, consider scaling consumers');
    }

    // Check unacknowledged messages
    if (queue.unackedMessages > this.THRESHOLDS.UNACKED_CRITICAL) {
      status = 'critical';
      issues.push(`Too many unacked messages: ${queue.unackedMessages}`);
      recommendations.push('Check consumer health, possible processing issues');
    } else if (queue.unackedMessages > this.THRESHOLDS.UNACKED_WARNING) {
      if (status === 'healthy') status = 'warning';
      issues.push(`High unacked messages: ${queue.unackedMessages}`);
      recommendations.push('Monitor consumer processing time');
    }

    // Check consumer count
    if (queue.consumerCount === 0 && queue.messageCount > 0) {
      status = 'critical';
      issues.push('No consumers but messages pending');
      recommendations.push('Start consumers for this queue immediately');
    }

    // Check message rate
    const messageRate = queue.messageStats?.publishRate || 0;
    if (messageRate > this.THRESHOLDS.HIGH_RATE_CRITICAL) {
      if (status === 'healthy') status = 'warning';
      issues.push(`Very high message rate: ${messageRate}/s`);
      recommendations.push('Consider queue sharding or increasing prefetch');
    } else if (messageRate > this.THRESHOLDS.HIGH_RATE_WARNING) {
      if (status === 'healthy') status = 'warning';
      issues.push(`High message rate: ${messageRate}/s`);
      recommendations.push('Monitor performance metrics');
    }

    return {
      name: queue.name,
      messages: queue.messageCount,
      messagesReady: queue.readyMessages,
      messagesUnacknowledged: queue.unackedMessages,
      consumers: queue.consumerCount,
      messageRate,
      status,
      issues,
      recommendations,
    };
  }

  /**
   * Get comprehensive topology health
   */
  static async getTopologyHealth(): Promise<TopologyHealth> {
    try {
      // Get queue statistics from management API (if available)
      // For now, we'll simulate with basic checks
      const queueHealth: QueueHealth[] = [];
      
      // These would come from RabbitMQ management API
      const mockQueues = [
        { name: 'payments.processing', messageCount: 50, readyMessages: 30, unackedMessages: 20, consumerCount: 2 },
        { name: 'payments.validation', messageCount: 100, readyMessages: 80, unackedMessages: 20, consumerCount: 3 },
        { name: 'investor.calculations', messageCount: 1500, readyMessages: 1400, unackedMessages: 100, consumerCount: 1 },
        { name: 'audit.events', messageCount: 10000, readyMessages: 10000, unackedMessages: 0, consumerCount: 1 },
      ];

      let healthyCount = 0;
      let warningCount = 0;
      let criticalCount = 0;
      let totalMessages = 0;
      let totalConsumers = 0;

      for (const queue of mockQueues) {
        const health = this.assessQueueHealth(queue);
        queueHealth.push(health);
        
        totalMessages += queue.messageCount;
        totalConsumers += queue.consumerCount;
        
        switch (health.status) {
          case 'healthy':
            healthyCount++;
            break;
          case 'warning':
            warningCount++;
            break;
          case 'critical':
            criticalCount++;
            break;
        }
      }

      const overallStatus = criticalCount > 0 ? 'critical' : 
                           warningCount > 0 ? 'warning' : 'healthy';

      const recommendations: string[] = [];
      
      // Overall recommendations based on queue count
      const totalQueues = queueHealth.length;
      if (totalQueues > 40) {
        recommendations.push('Consider consolidating queues - CloudAMQP performs better with fewer queues');
      }
      
      if (criticalCount > 0) {
        recommendations.push(`${criticalCount} queues in critical state - immediate attention required`);
      }
      
      if (warningCount > 2) {
        recommendations.push('Multiple queues showing warnings - review consumer configuration');
      }

      return {
        timestamp: new Date(),
        totalQueues,
        totalExchanges: 10, // This would come from topology
        healthyQueues: healthyCount,
        warningQueues: warningCount,
        criticalQueues: criticalCount,
        totalMessages,
        totalConsumers,
        queues: queueHealth,
        overallStatus,
        recommendations,
      };
    } catch (error) {
      console.error('[QueueMonitor] Failed to get topology health:', error);
      throw error;
    }
  }

  /**
   * Get queue count recommendations based on CloudAMQP best practices
   */
  static getQueueCountRecommendations(queueCount: number): {
    status: 'optimal' | 'acceptable' | 'warning' | 'critical';
    message: string;
    recommendations: string[];
  } {
    if (queueCount <= 20) {
      return {
        status: 'optimal',
        message: `${queueCount} queues - Optimal for CloudAMQP performance`,
        recommendations: [],
      };
    } else if (queueCount <= 40) {
      return {
        status: 'acceptable',
        message: `${queueCount} queues - Acceptable but monitor management plugin performance`,
        recommendations: [
          'Consider consolidating similar queues',
          'Monitor RabbitMQ management plugin response times',
        ],
      };
    } else if (queueCount <= 100) {
      return {
        status: 'warning',
        message: `${queueCount} queues - May impact CloudAMQP management plugin performance`,
        recommendations: [
          'Consolidate queues where possible',
          'Use topic exchanges to reduce queue count',
          'Consider using priority arguments instead of separate priority queues',
          'Disable unused features to reduce queue count',
        ],
      };
    } else {
      return {
        status: 'critical',
        message: `${queueCount} queues - Will significantly impact CloudAMQP performance`,
        recommendations: [
          'URGENT: Reduce queue count below 50',
          'Consolidate all similar purpose queues',
          'Use single queue with routing keys instead of multiple queues',
          'Consider queue sharding only for high-volume scenarios',
          'Disable non-essential features immediately',
        ],
      };
    }
  }

  /**
   * Monitor and alert on queue explosions
   */
  static async detectQueueExplosion(): Promise<{
    detected: boolean;
    queueCount: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    actions: string[];
  }> {
    // This would integrate with RabbitMQ management API
    const currentQueueCount = 55; // Current topology count
    
    const recommendations = this.getQueueCountRecommendations(currentQueueCount);
    
    let severity: 'low' | 'medium' | 'high' | 'critical';
    let actions: string[] = [];
    
    switch (recommendations.status) {
      case 'optimal':
        severity = 'low';
        break;
      case 'acceptable':
        severity = 'low';
        actions = ['Monitor queue metrics regularly'];
        break;
      case 'warning':
        severity = 'medium';
        actions = [
          'Enable queue consolidation in configuration',
          'Review and disable unused features',
          'Implement queue count monitoring alerts',
        ];
        break;
      case 'critical':
        severity = 'critical';
        actions = [
          'IMMEDIATE: Switch to optimized topology',
          'Reduce servicing shards from 8 to 2',
          'Consolidate investor priority queues',
          'Disable settlement/reconciliation if not in use',
          'Combine similar purpose queues',
        ];
        break;
      default:
        severity = 'low';
    }
    
    return {
      detected: currentQueueCount > 40,
      queueCount: currentQueueCount,
      severity,
      actions,
    };
  }
}

// Export monitoring functions
export async function checkQueueHealth(): Promise<TopologyHealth> {
  return QueueMonitor.getTopologyHealth();
}

export async function detectQueueExplosion() {
  return QueueMonitor.detectQueueExplosion();
}

export function getQueueRecommendations(queueCount: number) {
  return QueueMonitor.getQueueCountRecommendations(queueCount);
}