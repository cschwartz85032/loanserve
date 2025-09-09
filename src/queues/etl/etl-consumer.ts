/**
 * ETL Consumer - Queue-based ETL processing
 * Replaces the timer-based ETL pipeline with message-driven processing
 */

import amqp from 'amqplib';
import { startConsumer } from '../consumer-utils';
import { Queues, Exchanges } from '../topology';
import { createEnvelope, createRoutingKey, createEtlIdempotencyKey } from '../../messaging/envelope-helpers';
import { Envelope, EtlSchedulePayload, EtlJobPayload } from '../../types/messages';

// Import the existing ETL pipeline class to reuse the ETL logic
import { ETLPipeline } from '../../analytics/etl-pipeline';

/**
 * Initialize ETL consumers for schedule and job processing
 */
export async function initEtlConsumers(conn: amqp.Connection, publishFn: (exchange: string, routingKey: string, message: any) => Promise<void>) {
  console.log('[ETL Consumer] Initializing ETL consumers...');

  // ETL Schedule Consumer - converts schedule messages into job messages
  await startConsumer(conn, {
    queue: Queues.EtlSchedule,
    handler: async (envelope: Envelope<EtlSchedulePayload>, deps) => {
      const { tenantId, payload, correlationId } = envelope;
      
      console.log(`[ETL Schedule] Processing schedule for tenant ${tenantId}, window: ${payload.window}`);
      
      try {
        // Create individual job messages for each ETL type
        const jobTypes = payload.jobTypes || ['loan_performance', 'service_operations', 'ai_performance'];
        
        for (const jobType of jobTypes) {
          const jobEnvelope = createEnvelope<EtlJobPayload>({
            tenantId,
            causationId: correlationId,
            idempotencyKey: createEtlIdempotencyKey(tenantId, jobType, new Date().toISOString()),
            payload: {
              shardKey: `${jobType}:${tenantId}:${Date.now()}`,
              jobType: jobType as any,
              timeWindow: {
                start: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
                end: new Date().toISOString()
              },
              parameters: {}
            },
            actor: { service: 'etl-scheduler' }
          });

          const routingKey = createRoutingKey(tenantId, 'etl.job');
          await publishFn(Exchanges.Commands, routingKey, jobEnvelope);
          
          console.log(`[ETL Schedule] Queued ${jobType} job for tenant ${tenantId}`);
        }
        
      } catch (error) {
        console.error(`[ETL Schedule] Failed to process schedule for tenant ${tenantId}:`, error);
        throw error;
      }
    }
  });

  // ETL Job Consumer - processes individual ETL jobs
  await startConsumer(conn, {
    queue: Queues.EtlJob,
    handler: async (envelope: Envelope<EtlJobPayload>, deps) => {
      const { tenantId, payload, correlationId } = envelope;
      
      console.log(`[ETL Job] Processing ${payload.jobType} job for tenant ${tenantId}`);
      
      try {
        const etlPipeline = ETLPipeline.getInstance();
        let result;

        // Execute the appropriate ETL job
        switch (payload.jobType) {
          case 'loan_performance':
            result = await etlPipeline.runLoanPerformanceETL();
            break;
          case 'service_operations':
            result = await etlPipeline.runServiceOperationsETL();
            break;
          case 'ai_performance':
            result = await etlPipeline.runAIPerformanceETL();
            break;
          default:
            throw new Error(`Unknown ETL job type: ${payload.jobType}`);
        }

        console.log(`[ETL Job] Completed ${payload.jobType} for tenant ${tenantId}:`, {
          status: result.status,
          recordsProcessed: result.recordsLoaded,
          duration: result.duration
        });

        // Publish completion event
        const statusEnvelope = createEnvelope({
          tenantId,
          causationId: correlationId,
          payload: {
            resourceType: 'etl_job',
            resourceId: payload.shardKey,
            status: result.status,
            progress: 100,
            message: `ETL job ${payload.jobType} completed`,
            metadata: {
              recordsExtracted: result.recordsExtracted,
              recordsTransformed: result.recordsTransformed,
              recordsLoaded: result.recordsLoaded,
              duration: result.duration
            }
          },
          actor: { service: 'etl-consumer' }
        });

        const statusRoutingKey = createRoutingKey(tenantId, 'status.etl.completed');
        await publishFn(Exchanges.Events, statusRoutingKey, statusEnvelope);
        
      } catch (error) {
        console.error(`[ETL Job] Failed ${payload.jobType} for tenant ${tenantId}:`, error);
        
        // Publish failure event
        const errorEnvelope = createEnvelope({
          tenantId,
          causationId: correlationId,
          payload: {
            resourceType: 'etl_job',
            resourceId: payload.shardKey,
            status: 'failed',
            progress: 0,
            message: `ETL job ${payload.jobType} failed: ${error.message}`,
            metadata: { error: error.message }
          },
          actor: { service: 'etl-consumer' }
        });

        const errorRoutingKey = createRoutingKey(tenantId, 'status.etl.failed');
        await publishFn(Exchanges.Events, errorRoutingKey, errorEnvelope);
        
        throw error;
      }
    }
  });

  console.log('[ETL Consumer] ETL consumers initialized successfully');
}