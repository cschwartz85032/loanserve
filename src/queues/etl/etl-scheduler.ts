/**
 * ETL Scheduler - Replaces timer-based ETL with queue-based scheduling
 * Publishes schedule messages instead of running ETL directly
 */

import { randomUUID } from 'node:crypto';
import { createEnvelope, createRoutingKey, createEtlIdempotencyKey, createDateKey } from '../../messaging/envelope-helpers';
import { EtlSchedulePayload } from '../../types/messages';
import { Exchanges } from '../topology';

const NIL = '00000000-0000-0000-0000-000000000000';
const DEFAULT_TENANT = process.env.DEFAULT_TENANT_ID ?? NIL;

export class EtlScheduler {
  private publishFunction: (exchange: string, routingKey: string, message: any) => Promise<void>;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(publishFn: (exchange: string, routingKey: string, message: any) => Promise<void>) {
    this.publishFunction = publishFn;
  }

  /**
   * Start the ETL scheduler (replaces setInterval timer)
   */
  start(intervalMs: number = 300000) { // 5 minutes default
    if (this.intervalId) {
      console.log('[ETL Scheduler] Already running');
      return;
    }

    console.log(`[ETL Scheduler] Starting with ${intervalMs}ms interval`);
    
    this.intervalId = setInterval(async () => {
      await this.tickSchedule();
    }, intervalMs);

    // Run immediately on startup
    this.tickSchedule().catch(console.error);
  }

  /**
   * Stop the ETL scheduler
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[ETL Scheduler] Stopped');
    }
  }

  /**
   * Publish ETL schedule tick for all tenants
   */
  private async tickSchedule() {
    try {
      console.log('[ETL Scheduler] Publishing schedule tick');
      
      // For now, use default tenant - in full implementation, iterate over active tenants
      const tenantId = 'default';
      const dateKey = createDateKey();
      
      const envelope = createEnvelope<EtlSchedulePayload>({
        tenantId,
        idempotencyKey: createEtlIdempotencyKey(tenantId, 'schedule', dateKey),
        payload: {
          window: 'last_5m',
          jobTypes: ['loan_performance', 'service_operations', 'ai_performance']
        },
        actor: { service: 'etl-scheduler' }
      });

      const routingKey = createRoutingKey(tenantId, 'etl.schedule');
      await this.publishFunction(Exchanges.Schedules, routingKey, envelope);
      
      console.log(`[ETL Scheduler] Published schedule for tenant ${tenantId}`);
      
    } catch (error) {
      console.error('[ETL Scheduler] Failed to publish schedule:', error);
    }
  }
}

/**
 * Global ETL scheduler instance
 */
let globalScheduler: EtlScheduler | null = null;

export function startEtlScheduler(publishFn: (exchange: string, routingKey: string, message: any) => Promise<void>) {
  if (globalScheduler) {
    console.log('[ETL] Scheduler already started');
    return globalScheduler;
  }

  globalScheduler = new EtlScheduler(publishFn);
  globalScheduler.start();
  return globalScheduler;
}

export function stopEtlScheduler() {
  if (globalScheduler) {
    globalScheduler.stop();
    globalScheduler = null;
  }
}