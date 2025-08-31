/**
 * Instrumented RabbitMQ Service
 * Wraps RabbitMQ operations with OpenTelemetry tracing and metrics
 */

import { RabbitMQClient } from '../services/rabbitmq-unified';
import { 
  createSpan, 
  withSpan, 
  correlationStorage,
  withCorrelationId 
} from './telemetry';
import {
  messageProcessedCounter,
  messageFailedCounter,
  processLatencyHistogram,
  dlqRateCounter,
  recordMetric,
  measureDuration
} from './metrics';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { extractCorrelationId, attachCorrelationId } from '../middleware/correlation-id';

export class InstrumentedRabbitMQService extends RabbitMQClient {
  
  /**
   * Publish a message with tracing and metrics
   */
  async publishWithTracing(
    exchange: string,
    routingKey: string,
    message: any,
    options?: any
  ): Promise<void> {
    const correlationId = correlationStorage.getStore()?.correlationId || 
                         extractCorrelationId(options);
    
    return withSpan(
      `rabbitmq.publish ${exchange}/${routingKey}`,
      async () => {
        const span = createSpan('rabbitmq.publish', {
          kind: SpanKind.PRODUCER,
          attributes: {
            'messaging.system': 'rabbitmq',
            'messaging.destination': exchange,
            'messaging.routing_key': routingKey,
            'correlation.id': correlationId,
          },
        });

        try {
          // Attach correlation ID to message
          const enhancedOptions = {
            ...options,
            correlationId,
            headers: {
              ...options?.headers,
              'x-correlation-id': correlationId,
            },
          };

          await this.publish(exchange, routingKey, message, enhancedOptions);
          
          recordMetric(messageProcessedCounter, 1, {
            operation: 'publish',
            exchange,
            routingKey,
            status: 'success',
          });

          span.setStatus({ code: SpanStatusCode.OK });
        } catch (error) {
          recordMetric(messageFailedCounter, 1, {
            operation: 'publish',
            exchange,
            routingKey,
            status: 'error',
          });

          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
          span.recordException(error as Error);
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }

  /**
   * Consume messages with tracing and metrics
   */
  async consumeWithTracing(
    queue: string,
    handler: (msg: any) => Promise<void>,
    options?: any
  ): Promise<void> {
    return this.consume(
      queue,
      async (msg) => {
        const correlationId = extractCorrelationId(msg);
        const startTime = Date.now();

        return withCorrelationId(correlationId, async () => {
          const span = createSpan('rabbitmq.consume', {
            kind: SpanKind.CONSUMER,
            attributes: {
              'messaging.system': 'rabbitmq',
              'messaging.source': queue,
              'messaging.message.id': msg.properties?.messageId,
              'correlation.id': correlationId,
            },
          });

          try {
            await handler(msg);
            
            const duration = Date.now() - startTime;
            recordMetric(processLatencyHistogram, duration, {
              queue,
              status: 'success',
            });
            
            recordMetric(messageProcessedCounter, 1, {
              operation: 'consume',
              queue,
              status: 'success',
            });

            span.setStatus({ code: SpanStatusCode.OK });
          } catch (error) {
            const duration = Date.now() - startTime;
            recordMetric(processLatencyHistogram, duration, {
              queue,
              status: 'error',
            });
            
            recordMetric(messageFailedCounter, 1, {
              operation: 'consume',
              queue,
              status: 'error',
            });

            // Check if message will go to DLQ
            const retryCount = msg.properties?.headers?.['x-retry-count'] || 0;
            if (retryCount >= (options?.maxRetries || 3)) {
              recordMetric(dlqRateCounter, 1, {
                queue,
                reason: 'max_retries',
              });
            }

            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error instanceof Error ? error.message : 'Unknown error',
            });
            span.recordException(error as Error);
            throw error;
          } finally {
            span.end();
          }
        });
      },
      options
    );
  }

  /**
   * Send to DLQ with metrics
   */
  async sendToDLQWithMetrics(
    message: any,
    error: Error,
    originalQueue: string
  ): Promise<void> {
    const correlationId = extractCorrelationId(message);

    return withSpan(
      `rabbitmq.dlq.send ${originalQueue}`,
      async () => {
        try {
          await this.sendToDLQ(message, error, originalQueue);
          
          recordMetric(dlqRateCounter, 1, {
            queue: originalQueue,
            reason: error.name || 'unknown',
          });
        } catch (dlqError) {
          console.error('[RabbitMQ] Failed to send to DLQ:', dlqError);
          throw dlqError;
        }
      }
    );
  }

  /**
   * Get queue statistics for metrics
   */
  async getQueueStatsForMetrics(): Promise<{
    queues: Record<string, number>;
    dlqs: Record<string, number>;
  }> {
    const stats = {
      queues: {} as Record<string, number>,
      dlqs: {} as Record<string, number>,
    };

    try {
      if (!this.channel) {
        await this.connect();
      }

      // Check main queues
      const mainQueues = [
        'q.servicing.1',
        'q.servicing.2',
        'q.servicing.3',
        'q.servicing.4',
        'q.servicing.5',
        'q.servicing.6',
        'q.servicing.7',
        'q.notifications',
        'q.daily.cycle',
      ];

      for (const queue of mainQueues) {
        try {
          const queueInfo = await this.channel!.checkQueue(queue);
          stats.queues[queue] = queueInfo.messageCount;
        } catch (error) {
          // Queue might not exist
        }
      }

      // Check DLQs
      const dlqs = mainQueues.map(q => `dlq.${q.substring(2)}`);
      for (const dlq of dlqs) {
        try {
          const queueInfo = await this.channel!.checkQueue(dlq);
          stats.dlqs[dlq] = queueInfo.messageCount;
        } catch (error) {
          // DLQ might not exist
        }
      }
    } catch (error) {
      console.error('[RabbitMQ] Failed to get queue stats:', error);
    }

    return stats;
  }
}

// Export singleton instance
export const instrumentedRabbitMQ = new InstrumentedRabbitMQService();