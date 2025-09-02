/**
 * Self-Healing Worker Framework
 * Implements idempotent workers with retries, DLQ, and monitoring
 */

import { randomUUID } from 'crypto';
import { phase10AuditService } from '../../server/services/phase10-audit-service';
import pino from 'pino';

const logger = pino({ name: 'self-healing-worker' });

export interface WorkerConfig {
  name: string;
  maxRetries: number;
  retryDelayMs: number;
  retryBackoffMultiplier: number;
  maxRetryDelayMs: number;
  timeoutMs: number;
  dlqEnabled: boolean;
  idempotencyEnabled: boolean;
  tenantId?: string;
}

export interface WorkItem<T = any> {
  id: string;
  type: string;
  payload: T;
  correlationId?: string;
  attempt: number;
  maxAttempts: number;
  createdAt: Date;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  errors: WorkError[];
  metadata: Record<string, any>;
}

export interface WorkError {
  attempt: number;
  error: string;
  timestamp: Date;
  stack?: string;
}

export interface WorkResult<T = any> {
  success: boolean;
  result?: T;
  error?: string;
  shouldRetry: boolean;
  idempotencyKey?: string;
}

export abstract class SelfHealingWorker<TInput = any, TOutput = any> {
  protected config: WorkerConfig;
  protected completedWork = new Map<string, TOutput>(); // In-memory idempotency cache
  
  constructor(config: WorkerConfig) {
    this.config = {
      maxRetries: 3,
      retryDelayMs: 1000,
      retryBackoffMultiplier: 2,
      maxRetryDelayMs: 30000,
      timeoutMs: 60000,
      dlqEnabled: true,
      idempotencyEnabled: true,
      ...config
    };
  }

  /**
   * Process a work item with full error handling and retry logic
   */
  async processWorkItem(workItem: WorkItem<TInput>): Promise<WorkResult<TOutput>> {
    const startTime = Date.now();
    const executionId = randomUUID();

    try {
      // Log work start
      await this.logWorkEvent('WORK_STARTED', workItem, { executionId });

      // Check idempotency
      if (this.config.idempotencyEnabled) {
        const cachedResult = this.getCachedResult(workItem);
        if (cachedResult) {
          await this.logWorkEvent('WORK_CACHED', workItem, { 
            executionId,
            cacheHit: true,
            duration: Date.now() - startTime
          });
          return { success: true, result: cachedResult, shouldRetry: false };
        }
      }

      // Execute work with timeout
      const result = await this.executeWithTimeout(workItem, executionId);

      // Cache successful result for idempotency
      if (result.success && this.config.idempotencyEnabled && result.result) {
        this.cacheResult(workItem, result.result);
      }

      // Log completion
      await this.logWorkEvent(
        result.success ? 'WORK_COMPLETED' : 'WORK_FAILED',
        workItem,
        {
          executionId,
          success: result.success,
          duration: Date.now() - startTime,
          error: result.error,
          shouldRetry: result.shouldRetry
        }
      );

      return result;

    } catch (error) {
      const workError: WorkError = {
        attempt: workItem.attempt,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        stack: error instanceof Error ? error.stack : undefined
      };

      workItem.errors.push(workError);

      // Determine if we should retry
      const shouldRetry = this.shouldRetry(workItem, error);

      await this.logWorkEvent('WORK_ERROR', workItem, {
        executionId,
        error: workError.error,
        stack: workError.stack,
        duration: Date.now() - startTime,
        shouldRetry,
        attempt: workItem.attempt,
        maxAttempts: workItem.maxAttempts
      });

      return {
        success: false,
        error: workError.error,
        shouldRetry
      };
    }
  }

  /**
   * Execute work with timeout protection
   */
  private async executeWithTimeout(
    workItem: WorkItem<TInput>,
    executionId: string
  ): Promise<WorkResult<TOutput>> {
    return new Promise(async (resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          success: false,
          error: `Work timed out after ${this.config.timeoutMs}ms`,
          shouldRetry: true
        });
      }, this.config.timeoutMs);

      try {
        const result = await this.executeWork(workItem.payload, workItem, executionId);
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        resolve({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          shouldRetry: this.isRetryableError(error)
        });
      }
    });
  }

  /**
   * Abstract method to be implemented by specific workers
   */
  abstract executeWork(
    payload: TInput,
    workItem: WorkItem<TInput>,
    executionId: string
  ): Promise<WorkResult<TOutput>>;

  /**
   * Determine if an error is retryable
   */
  protected isRetryableError(error: any): boolean {
    if (error instanceof Error) {
      // Network errors are retryable
      if (error.message.includes('ECONNRESET') || 
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('ENOTFOUND')) {
        return true;
      }

      // Rate limiting errors are retryable
      if (error.message.includes('rate limit') || 
          error.message.includes('429')) {
        return true;
      }

      // Server errors are retryable
      if (error.message.includes('500') || 
          error.message.includes('502') ||
          error.message.includes('503') ||
          error.message.includes('504')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Determine if work should be retried
   */
  protected shouldRetry(workItem: WorkItem<TInput>, error: any): boolean {
    // Don't retry if we've exceeded max attempts
    if (workItem.attempt >= workItem.maxAttempts) {
      return false;
    }

    // Check if error is retryable
    return this.isRetryableError(error);
  }

  /**
   * Calculate next retry delay with exponential backoff
   */
  protected calculateRetryDelay(attempt: number): number {
    const delay = this.config.retryDelayMs * Math.pow(this.config.retryBackoffMultiplier, attempt - 1);
    return Math.min(delay, this.config.maxRetryDelayMs);
  }

  /**
   * Schedule work for retry
   */
  scheduleRetry(workItem: WorkItem<TInput>): WorkItem<TInput> {
    const retryDelay = this.calculateRetryDelay(workItem.attempt);
    const nextRetryAt = new Date(Date.now() + retryDelay);

    return {
      ...workItem,
      attempt: workItem.attempt + 1,
      lastAttemptAt: new Date(),
      nextRetryAt
    };
  }

  /**
   * Send work to Dead Letter Queue
   */
  async sendToDLQ(workItem: WorkItem<TInput>, finalError: string): Promise<void> {
    if (!this.config.dlqEnabled) {
      return;
    }

    try {
      await this.logWorkEvent('WORK_DLQ', workItem, {
        finalError,
        totalAttempts: workItem.attempt,
        errors: workItem.errors
      });

      // In a real implementation, this would send to a DLQ like SQS DLQ or RabbitMQ DLX
      logger.error({
        workerId: this.config.name,
        workItemId: workItem.id,
        workItemType: workItem.type,
        finalError,
        totalAttempts: workItem.attempt
      }, 'Work item sent to DLQ');

    } catch (error) {
      logger.error({ error, workItem }, 'Failed to send work item to DLQ');
    }
  }

  /**
   * Get cached result for idempotency
   */
  private getCachedResult(workItem: WorkItem<TInput>): TOutput | null {
    const idempotencyKey = this.generateIdempotencyKey(workItem);
    return this.completedWork.get(idempotencyKey) || null;
  }

  /**
   * Cache result for idempotency
   */
  private cacheResult(workItem: WorkItem<TInput>, result: TOutput): void {
    const idempotencyKey = this.generateIdempotencyKey(workItem);
    this.completedWork.set(idempotencyKey, result);

    // Implement cache eviction (simple LRU)
    if (this.completedWork.size > 1000) {
      const firstKey = this.completedWork.keys().next().value;
      this.completedWork.delete(firstKey);
    }
  }

  /**
   * Generate idempotency key for work item
   */
  protected generateIdempotencyKey(workItem: WorkItem<TInput>): string {
    // Create deterministic key based on work content
    const keyData = {
      type: workItem.type,
      payload: workItem.payload,
      correlationId: workItem.correlationId
    };
    
    return `${this.config.name}:${workItem.type}:${JSON.stringify(keyData)}`;
  }

  /**
   * Log work events for monitoring and audit
   */
  private async logWorkEvent(
    eventType: string,
    workItem: WorkItem<TInput>,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      await phase10AuditService.logEvent({
        tenantId: this.config.tenantId || '00000000-0000-0000-0000-000000000001',
        eventType: `AI_PIPELINE.WORKER.${eventType}`,
        actorType: 'system',
        resourceUrn: `urn:worker:${this.config.name}:${workItem.id}`,
        payload: {
          workerId: this.config.name,
          workItemId: workItem.id,
          workItemType: workItem.type,
          attempt: workItem.attempt,
          correlationId: workItem.correlationId,
          ...metadata
        }
      });
    } catch (error) {
      logger.error({ error, workItem }, 'Failed to log work event');
    }
  }

  /**
   * Get worker health status
   */
  getHealthStatus(): {
    workerName: string;
    isHealthy: boolean;
    cacheSize: number;
    config: WorkerConfig;
  } {
    return {
      workerName: this.config.name,
      isHealthy: true, // Could implement more sophisticated health checks
      cacheSize: this.completedWork.size,
      config: this.config
    };
  }
}