/**
 * Queue Metrics History Service
 * Collects and stores queue metrics over time for visualization
 */

import { rabbitmqClient } from './rabbitmq-unified';
import { topologyManager } from '../messaging/topology';

interface MetricSnapshot {
  timestamp: number;
  queues: {
    [queueName: string]: {
      messages: number;
      ready: number;
      unacknowledged: number;
      consumers: number;
      publishRate?: number;
      deliverRate?: number;
    };
  };
  totals: {
    messages: number;
    ready: number;
    unacknowledged: number;
    consumers: number;
    throughput: number;
  };
}

class QueueMetricsHistory {
  private history: MetricSnapshot[] = [];
  private maxHistorySize = 60; // Keep last 60 snapshots (5 minutes at 5-second intervals)
  private lastSnapshot: MetricSnapshot | null = null;
  private collectionInterval: NodeJS.Timeout | null = null;
  private rabbitmq = rabbitmqClient;

  constructor() {
    // TEMPORARILY DISABLED: CloudAMQP connection issues - reduce connection pressure
    // this.startCollection();
  }

  /**
   * Start collecting metrics periodically
   */
  private startCollection() {
    // Collect metrics every 5 seconds
    this.collectionInterval = setInterval(() => {
      this.collectSnapshot();
    }, 5000);

    // Collect initial snapshot
    this.collectSnapshot();
  }

  /**
   * Stop collecting metrics
   */
  public stopCollection() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
  }

  /**
   * Collect a snapshot of current metrics
   */
  private async collectSnapshot() {
    try {
      const snapshot: MetricSnapshot = {
        timestamp: Date.now(),
        queues: {},
        totals: {
          messages: 0,
          ready: 0,
          unacknowledged: 0,
          consumers: 0,
          throughput: 0
        }
      };

      // Get metrics for all queues
      const queueNames = topologyManager.getQueueNames();
      
      for (const queueName of queueNames) {
        try {
          const stats = await this.rabbitmq.getQueueStats(queueName);
          if (stats) {
            snapshot.queues[queueName] = {
              messages: stats.messageCount,
              ready: stats.messageCount, // Use messageCount for both ready and total for now
              unacknowledged: 0, // Will be 0 until we have detailed stats
              consumers: stats.consumerCount
            };

            // Calculate rates if we have a previous snapshot
            if (this.lastSnapshot && this.lastSnapshot.queues[queueName]) {
              const timeDiff = (snapshot.timestamp - this.lastSnapshot.timestamp) / 1000; // in seconds
              const messageDiff = stats.messageCount - this.lastSnapshot.queues[queueName].messages;
              
              // Positive diff means messages are being published, negative means being consumed
              snapshot.queues[queueName].publishRate = Math.max(0, messageDiff / timeDiff);
              snapshot.queues[queueName].deliverRate = Math.max(0, -messageDiff / timeDiff);
            }

            // Update totals
            snapshot.totals.messages += stats.messageCount;
            snapshot.totals.ready += stats.messageCount;
            snapshot.totals.unacknowledged += 0; // Will be 0 until we have detailed stats
            snapshot.totals.consumers += stats.consumerCount;
          }
        } catch (error) {
          // Skip queue if error getting stats
          console.error(`Failed to get stats for queue ${queueName}:`, error);
        }
      }

      // Calculate total throughput
      if (this.lastSnapshot) {
        const timeDiff = (snapshot.timestamp - this.lastSnapshot.timestamp) / 1000;
        const messageDiff = Math.abs(snapshot.totals.messages - this.lastSnapshot.totals.messages);
        snapshot.totals.throughput = messageDiff / timeDiff;
      }

      // Add to history
      this.history.push(snapshot);
      this.lastSnapshot = snapshot;

      // Trim history if needed
      if (this.history.length > this.maxHistorySize) {
        this.history = this.history.slice(-this.maxHistorySize);
      }
    } catch (error) {
      console.error('Failed to collect metrics snapshot:', error);
    }
  }

  /**
   * Get historical metrics for charting
   */
  public getHistory(minutes: number = 5): {
    timestamps: number[];
    totalMessages: number[];
    totalReady: number[];
    totalUnacked: number[];
    totalConsumers: number[];
    throughput: number[];
    queueData: {
      [queueName: string]: {
        messages: number[];
        consumers: number[];
      };
    };
  } {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    const relevantHistory = this.history.filter(s => s.timestamp >= cutoff);

    const result = {
      timestamps: [] as number[],
      totalMessages: [] as number[],
      totalReady: [] as number[],
      totalUnacked: [] as number[],
      totalConsumers: [] as number[],
      throughput: [] as number[],
      queueData: {} as any
    };

    // Initialize queue data structure
    const queueNames = new Set<string>();
    relevantHistory.forEach(snapshot => {
      Object.keys(snapshot.queues).forEach(name => queueNames.add(name));
    });

    queueNames.forEach(name => {
      result.queueData[name] = {
        messages: [],
        consumers: []
      };
    });

    // Process each snapshot
    relevantHistory.forEach(snapshot => {
      result.timestamps.push(snapshot.timestamp);
      result.totalMessages.push(snapshot.totals.messages);
      result.totalReady.push(snapshot.totals.ready);
      result.totalUnacked.push(snapshot.totals.unacknowledged);
      result.totalConsumers.push(snapshot.totals.consumers);
      result.throughput.push(snapshot.totals.throughput);

      // Process per-queue data
      queueNames.forEach(name => {
        if (snapshot.queues[name]) {
          result.queueData[name].messages.push(snapshot.queues[name].messages);
          result.queueData[name].consumers.push(snapshot.queues[name].consumers);
        } else {
          // Queue doesn't exist in this snapshot, use 0
          result.queueData[name].messages.push(0);
          result.queueData[name].consumers.push(0);
        }
      });
    });

    return result;
  }

  /**
   * Get top queues by message count
   */
  public getTopQueues(limit: number = 10): Array<{
    name: string;
    messages: number;
    consumers: number;
    trend: 'up' | 'down' | 'stable';
  }> {
    if (!this.lastSnapshot) return [];

    const queues = Object.entries(this.lastSnapshot.queues)
      .map(([name, data]) => {
        // Calculate trend
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (this.history.length >= 2) {
          const previousSnapshot = this.history[this.history.length - 2];
          if (previousSnapshot.queues[name]) {
            const diff = data.messages - previousSnapshot.queues[name].messages;
            if (diff > 0) trend = 'up';
            else if (diff < 0) trend = 'down';
          }
        }

        return {
          name,
          messages: data.messages,
          consumers: data.consumers,
          trend
        };
      })
      .sort((a, b) => b.messages - a.messages)
      .slice(0, limit);

    return queues;
  }

  /**
   * Get processing rate statistics
   */
  public getProcessingRates(): {
    averagePublishRate: number;
    averageDeliverRate: number;
    peakPublishRate: number;
    peakDeliverRate: number;
  } {
    if (!this.lastSnapshot) {
      return {
        averagePublishRate: 0,
        averageDeliverRate: 0,
        peakPublishRate: 0,
        peakDeliverRate: 0
      };
    }

    let totalPublish = 0;
    let totalDeliver = 0;
    let peakPublish = 0;
    let peakDeliver = 0;
    let count = 0;

    Object.values(this.lastSnapshot.queues).forEach(queue => {
      if (queue.publishRate !== undefined) {
        totalPublish += queue.publishRate;
        peakPublish = Math.max(peakPublish, queue.publishRate);
        count++;
      }
      if (queue.deliverRate !== undefined) {
        totalDeliver += queue.deliverRate;
        peakDeliver = Math.max(peakDeliver, queue.deliverRate);
      }
    });

    return {
      averagePublishRate: count > 0 ? totalPublish / count : 0,
      averageDeliverRate: count > 0 ? totalDeliver / count : 0,
      peakPublishRate: peakPublish,
      peakDeliverRate: peakDeliver
    };
  }
}

// Export singleton instance
export const queueMetricsHistory = new QueueMetricsHistory();