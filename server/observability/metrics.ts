/**
 * Prometheus Metrics Collection
 * Tracks queue depth, process latency, DLQ rate, outbox lag, reconcile variance
 */

import { meter } from './telemetry';
import { ValueType } from '@opentelemetry/api';

// Queue metrics
export const queueDepthGauge = meter.createObservableGauge('rabbitmq_queue_depth', {
  description: 'Current depth of RabbitMQ queues',
  unit: 'messages',
  valueType: ValueType.INT,
});

export const dlqDepthGauge = meter.createObservableGauge('rabbitmq_dlq_depth', {
  description: 'Current depth of Dead Letter Queues',
  unit: 'messages',
  valueType: ValueType.INT,
});

export const dlqRateCounter = meter.createCounter('rabbitmq_dlq_rate', {
  description: 'Rate of messages sent to DLQ',
  unit: 'messages',
  valueType: ValueType.INT,
});

// Processing metrics
export const processLatencyHistogram = meter.createHistogram('payment_process_latency', {
  description: 'Latency of payment processing',
  unit: 'milliseconds',
  valueType: ValueType.DOUBLE,
});

export const messageProcessedCounter = meter.createCounter('messages_processed_total', {
  description: 'Total number of messages processed',
  unit: 'messages',
  valueType: ValueType.INT,
});

export const messageFailedCounter = meter.createCounter('messages_failed_total', {
  description: 'Total number of messages that failed processing',
  unit: 'messages',
  valueType: ValueType.INT,
});

// Outbox metrics
export const outboxLagGauge = meter.createObservableGauge('outbox_lag', {
  description: 'Lag between outbox creation and processing',
  unit: 'seconds',
  valueType: ValueType.DOUBLE,
});

export const outboxSizeGauge = meter.createObservableGauge('outbox_size', {
  description: 'Number of pending outbox messages',
  unit: 'messages',
  valueType: ValueType.INT,
});

// Reconciliation metrics
export const reconcileVarianceGauge = meter.createObservableGauge('reconcile_variance_amount', {
  description: 'Total variance amount in reconciliation',
  unit: 'dollars',
  valueType: ValueType.DOUBLE,
});

export const reconcileExceptionsCounter = meter.createCounter('reconcile_exceptions_total', {
  description: 'Total number of reconciliation exceptions',
  unit: 'exceptions',
  valueType: ValueType.INT,
});

export const reconcileSuccessCounter = meter.createCounter('reconcile_success_total', {
  description: 'Total number of successful reconciliations',
  unit: 'reconciliations',
  valueType: ValueType.INT,
});

// Settlement metrics
export const settlementAmountHistogram = meter.createHistogram('settlement_amount', {
  description: 'Distribution of settlement amounts',
  unit: 'dollars',
  valueType: ValueType.DOUBLE,
});

export const settlementLatencyHistogram = meter.createHistogram('settlement_latency', {
  description: 'Time taken for settlements',
  unit: 'milliseconds',
  valueType: ValueType.DOUBLE,
});

// Notification metrics
export const notificationSentCounter = meter.createCounter('notifications_sent_total', {
  description: 'Total notifications sent',
  unit: 'notifications',
  valueType: ValueType.INT,
});

export const notificationFailedCounter = meter.createCounter('notifications_failed_total', {
  description: 'Total notifications that failed to send',
  unit: 'notifications',
  valueType: ValueType.INT,
});

// Performance metrics
export const apiLatencyHistogram = meter.createHistogram('api_request_latency', {
  description: 'API request latency',
  unit: 'milliseconds',
  valueType: ValueType.DOUBLE,
});

export const dbQueryLatencyHistogram = meter.createHistogram('db_query_latency', {
  description: 'Database query latency',
  unit: 'milliseconds',
  valueType: ValueType.DOUBLE,
});

// Business metrics
export const paymentsProcessedCounter = meter.createCounter('payments_processed_total', {
  description: 'Total payments processed',
  unit: 'payments',
  valueType: ValueType.INT,
});

export const paymentAmountHistogram = meter.createHistogram('payment_amount', {
  description: 'Distribution of payment amounts',
  unit: 'dollars',
  valueType: ValueType.DOUBLE,
});

// Health metrics
export const healthCheckGauge = meter.createObservableGauge('service_health', {
  description: 'Service health status (1 = healthy, 0 = unhealthy)',
  unit: '1',
  valueType: ValueType.INT,
});

// Helper to record metrics with labels
export function recordMetric(
  metric: any,
  value: number,
  labels: Record<string, string> = {}
) {
  if (metric.add) {
    metric.add(value, labels);
  } else if (metric.record) {
    metric.record(value, labels);
  }
}

// Helper to measure operation duration
export async function measureDuration<T>(
  histogram: any,
  labels: Record<string, string>,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    histogram.record(duration, labels);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    histogram.record(duration, { ...labels, status: 'error' });
    throw error;
  }
}

// Initialize metric collectors
export function initializeMetricCollectors(
  getQueueStats: () => Promise<any>,
  getOutboxStats: () => Promise<any>,
  getReconcileStats: () => Promise<any>
) {
  // Queue depth collector
  queueDepthGauge.addCallback(async (observableResult) => {
    try {
      const stats = await getQueueStats();
      for (const [queueName, depth] of Object.entries(stats.queues || {})) {
        observableResult.observe(depth as number, { queue: queueName });
      }
    } catch (error) {
      console.error('[Metrics] Failed to collect queue depth:', error);
    }
  });

  // DLQ depth collector
  dlqDepthGauge.addCallback(async (observableResult) => {
    try {
      const stats = await getQueueStats();
      for (const [queueName, depth] of Object.entries(stats.dlqs || {})) {
        observableResult.observe(depth as number, { queue: queueName });
      }
    } catch (error) {
      console.error('[Metrics] Failed to collect DLQ depth:', error);
    }
  });

  // Outbox lag collector
  outboxLagGauge.addCallback(async (observableResult) => {
    try {
      const stats = await getOutboxStats();
      if (stats.maxLag !== undefined) {
        observableResult.observe(stats.maxLag, {});
      }
    } catch (error) {
      console.error('[Metrics] Failed to collect outbox lag:', error);
    }
  });

  // Outbox size collector
  outboxSizeGauge.addCallback(async (observableResult) => {
    try {
      const stats = await getOutboxStats();
      if (stats.pending !== undefined) {
        observableResult.observe(stats.pending, {});
      }
    } catch (error) {
      console.error('[Metrics] Failed to collect outbox size:', error);
    }
  });

  // Reconciliation variance collector
  reconcileVarianceGauge.addCallback(async (observableResult) => {
    try {
      const stats = await getReconcileStats();
      if (stats.totalVariance !== undefined) {
        observableResult.observe(stats.totalVariance, {});
      }
    } catch (error) {
      console.error('[Metrics] Failed to collect reconciliation variance:', error);
    }
  });

  // Health check collector
  healthCheckGauge.addCallback(async (observableResult) => {
    try {
      // Check various components
      const queueHealth = await getQueueStats().then(() => 1).catch(() => 0);
      const dbHealth = await getOutboxStats().then(() => 1).catch(() => 0);
      
      observableResult.observe(queueHealth, { component: 'rabbitmq' });
      observableResult.observe(dbHealth, { component: 'database' });
    } catch (error) {
      console.error('[Metrics] Failed to collect health status:', error);
      observableResult.observe(0, { component: 'overall' });
    }
  });

  console.log('[Metrics] Metric collectors initialized');
}

// Export alert thresholds for monitoring
export const ALERT_THRESHOLDS = {
  DLQ_RATE_HIGH: 10, // messages per minute
  QUEUE_DEPTH_HIGH: 1000, // messages
  OUTBOX_LAG_HIGH: 300, // seconds (5 minutes)
  RECONCILE_VARIANCE_HIGH: 10000, // dollars
  API_LATENCY_HIGH: 5000, // milliseconds
  DB_LATENCY_HIGH: 1000, // milliseconds
  FAILURE_RATE_HIGH: 0.05, // 5% failure rate
};