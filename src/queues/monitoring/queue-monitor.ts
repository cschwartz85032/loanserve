/**
 * Queue Monitoring Service - Phase 2: Comprehensive Observability
 * Provides real-time monitoring, metrics, and health checks for RabbitMQ queues
 */

import type { Connection, Channel } from 'amqplib';
import { Exchanges, Queues } from '../topology';

export interface QueueStats {
  name: string;
  messageCount: number;
  consumerCount: number;
  state: 'running' | 'idle' | 'flow';
}

export interface QueueHealth {
  status: 'healthy' | 'warning' | 'critical';
  queues: QueueStats[];
  totalMessages: number;
  totalConsumers: number;
  connectionStatus: string;
  lastUpdated: string;
  issues: string[];
}

export class QueueMonitor {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private currentHealth: QueueHealth = {
    status: 'critical',
    queues: [],
    totalMessages: 0,
    totalConsumers: 0,
    connectionStatus: 'disconnected',
    lastUpdated: new Date().toISOString(),
    issues: ['Not initialized']
  };

  /**
   * Initialize queue monitoring
   */
  async initialize(connection: Connection): Promise<void> {
    this.connection = connection;
    this.channel = await connection.createChannel();
    
    console.log('[Queue Monitor] Initializing comprehensive queue monitoring...');
    
    // Start periodic monitoring
    this.startPeriodicMonitoring();
    
    // Initial health check
    await this.updateHealth();
    
    console.log('[Queue Monitor] ✅ Queue monitoring initialized');
  }

  /**
   * Start periodic health monitoring
   */
  private startPeriodicMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // Update health every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.updateHealth();
      } catch (error) {
        console.error('[Queue Monitor] Error during periodic health check:', error);
        this.currentHealth.status = 'critical';
        this.currentHealth.issues = [`Monitoring error: ${error.message}`];
        this.currentHealth.lastUpdated = new Date().toISOString();
      }
    }, 30000);
  }

  /**
   * Update comprehensive health status
   */
  private async updateHealth(): Promise<void> {
    if (!this.channel) {
      this.currentHealth = {
        status: 'critical',
        queues: [],
        totalMessages: 0,
        totalConsumers: 0,
        connectionStatus: 'disconnected',
        lastUpdated: new Date().toISOString(),
        issues: ['Channel not available']
      };
      return;
    }

    try {
      const issues: string[] = [];
      const queueStats: QueueStats[] = [];
      let totalMessages = 0;
      let totalConsumers = 0;

      // Monitor all modern versioned queues
      const modernQueues = [
        Queues.LoanCreate,
        Queues.LoanUpdate,
        Queues.PaymentProcess,
        Queues.PaymentAllocate,
        Queues.EscrowDisburse,
        Queues.DocumentProcess,
        Queues.EtlSchedule,
        Queues.EtlJob,
        Queues.StatusUpdate
      ];

      for (const queueName of modernQueues) {
        try {
          const queueInfo = await this.channel.checkQueue(queueName);
          
          const stats: QueueStats = {
            name: queueName,
            messageCount: queueInfo.messageCount,
            consumerCount: queueInfo.consumerCount,
            state: this.getQueueState(queueInfo.messageCount, queueInfo.consumerCount)
          };

          queueStats.push(stats);
          totalMessages += queueInfo.messageCount;
          totalConsumers += queueInfo.consumerCount;

          // Check for potential issues
          if (queueInfo.messageCount > 100) {
            issues.push(`Queue ${queueName} has high message backlog: ${queueInfo.messageCount}`);
          }

          if (queueInfo.consumerCount === 0 && queueInfo.messageCount > 0) {
            issues.push(`Queue ${queueName} has messages but no consumers`);
          }

        } catch (error) {
          issues.push(`Failed to check queue ${queueName}: ${error.message}`);
        }
      }

      // Determine overall health status
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      
      if (issues.length > 0) {
        const criticalIssues = issues.filter(issue => 
          issue.includes('no consumers') || 
          issue.includes('Failed to check')
        );
        
        if (criticalIssues.length > 0) {
          status = 'critical';
        } else {
          status = 'warning';
        }
      }

      this.currentHealth = {
        status,
        queues: queueStats,
        totalMessages,
        totalConsumers,
        connectionStatus: 'connected',
        lastUpdated: new Date().toISOString(),
        issues
      };

      // Log health summary
      if (status !== 'healthy') {
        console.log(`[Queue Monitor] Health Status: ${status.toUpperCase()}`, {
          totalMessages,
          totalConsumers,
          issueCount: issues.length,
          issues: issues.slice(0, 3) // Log first 3 issues
        });
      }

    } catch (error) {
      console.error('[Queue Monitor] Error updating health status:', error);
      this.currentHealth = {
        status: 'critical',
        queues: [],
        totalMessages: 0,
        totalConsumers: 0,
        connectionStatus: 'error',
        lastUpdated: new Date().toISOString(),
        issues: [`Health check failed: ${error.message}`]
      };
    }
  }

  /**
   * Determine queue state based on activity
   */
  private getQueueState(messageCount: number, consumerCount: number): 'running' | 'idle' | 'flow' {
    if (messageCount > 0 && consumerCount > 0) {
      return 'flow'; // Active processing
    } else if (consumerCount > 0) {
      return 'running'; // Consumers waiting
    } else {
      return 'idle'; // No activity
    }
  }

  /**
   * Get current health status
   */
  getHealth(): QueueHealth {
    return { ...this.currentHealth };
  }

  /**
   * Get detailed queue metrics
   */
  async getDetailedMetrics(): Promise<{
    queues: QueueStats[];
    processing_rates: { [key: string]: number };
    error_rates: { [key: string]: number };
    avg_processing_time: { [key: string]: number };
  }> {
    await this.updateHealth();
    
    // TODO: Implement more detailed metrics collection
    // For now, return basic structure
    return {
      queues: this.currentHealth.queues,
      processing_rates: {},
      error_rates: {},
      avg_processing_time: {}
    };
  }

  /**
   * Force health check update
   */
  async refreshHealth(): Promise<QueueHealth> {
    await this.updateHealth();
    return this.getHealth();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.channel) {
      this.channel.close().catch(err => 
        console.error('[Queue Monitor] Error closing channel:', err)
      );
    }

    console.log('[Queue Monitor] Monitoring stopped');
  }
}

// Global monitor instance
export const globalQueueMonitor = new QueueMonitor();