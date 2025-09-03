/**
 * Self-Healing Worker Pattern
 * Demonstrates resilient message processing with retry/DLQ topology
 */

import amqp from 'amqplib';
import { publishWithRetry } from '../services/rabbitmq-bootstrap';

export interface WorkerConfig {
  queueName: string;
  retryQueueName: string;
  dlqName: string;
  maxRetries: number;
  retryDelayMs: number;
  processingTimeoutMs: number;
}

export interface ProcessingContext {
  messageId: string;
  loanId?: string;
  tenantId?: string;
  stage: string;
  attemptNumber: number;
  originalTimestamp: number;
}

export interface ProcessingResult {
  success: boolean;
  error?: string;
  shouldRetry?: boolean;
  retryDelayMs?: number;
}

/**
 * Self-healing worker base class with built-in retry/DLQ logic
 */
export abstract class SelfHealingWorker {
  constructor(
    protected config: WorkerConfig,
    protected connection: amqp.Connection
  ) {}

  /**
   * Abstract method - implement your processing logic here
   */
  abstract processMessage(
    content: any,
    context: ProcessingContext
  ): Promise<ProcessingResult>;

  /**
   * Start consuming messages with self-healing behavior
   */
  async start(): Promise<void> {
    const channel = await this.connection.createChannel();
    await channel.prefetch(1); // Fair dispatch

    console.log(`[SelfHealingWorker] Starting worker for queue: ${this.config.queueName}`);

    await channel.consume(this.config.queueName, async (msg) => {
      if (!msg) return;

      const startTime = Date.now();
      let context: ProcessingContext;

      try {
        // Parse message content and context
        const content = JSON.parse(msg.content.toString());
        context = this.extractContext(msg, content);

        console.log(`[SelfHealingWorker] Processing message ${context.messageId} (attempt ${context.attemptNumber})`);

        // Set processing timeout
        const timeoutPromise = new Promise<ProcessingResult>((_, reject) =>
          setTimeout(() => reject(new Error('Processing timeout')), this.config.processingTimeoutMs)
        );

        // Process message with timeout
        const result = await Promise.race([
          this.processMessage(content, context),
          timeoutPromise
        ]);

        // Handle successful processing
        if (result.success) {
          await channel.ack(msg);
          const duration = Date.now() - startTime;
          console.log(`[SelfHealingWorker] Message ${context.messageId} processed successfully in ${duration}ms`);
          return;
        }

        // Handle failed processing
        await this.handleFailure(msg, content, context, result, channel);

      } catch (error: any) {
        console.error(`[SelfHealingWorker] Processing error for ${context?.messageId || 'unknown'}:`, error);
        
        if (context!) {
          await this.handleFailure(
            msg, 
            JSON.parse(msg.content.toString()), 
            context, 
            { success: false, error: error.message, shouldRetry: true },
            channel
          );
        } else {
          // Fatal error - can't parse context, send to DLQ
          await this.sendToDLQ(msg, channel, 'Context parsing failed');
        }
      }
    });
  }

  /**
   * Handle processing failures with retry logic
   */
  private async handleFailure(
    msg: amqp.Message,
    content: any,
    context: ProcessingContext,
    result: ProcessingResult,
    channel: amqp.Channel
  ): Promise<void> {
    const shouldRetry = result.shouldRetry !== false && context.attemptNumber < this.config.maxRetries;

    if (shouldRetry) {
      // Send to retry queue
      await this.sendToRetry(msg, content, context, result, channel);
    } else {
      // Send to DLQ
      await this.sendToDLQ(msg, channel, result.error || 'Max retries exceeded');
    }
  }

  /**
   * Send message to retry queue with exponential backoff
   */
  private async sendToRetry(
    msg: amqp.Message,
    content: any,
    context: ProcessingContext,
    result: ProcessingResult,
    channel: amqp.Channel
  ): Promise<void> {
    const retryDelay = result.retryDelayMs || this.calculateRetryDelay(context.attemptNumber);
    const retryContent = {
      ...content,
      _retry: {
        attemptNumber: context.attemptNumber + 1,
        originalTimestamp: context.originalTimestamp,
        lastError: result.error,
        retryAt: Date.now() + retryDelay
      }
    };

    try {
      // Publish to retry queue with delay
      await publishWithRetry(
        'doc.intelligence', // Use appropriate exchange
        this.getRetryRoutingKey(context.stage),
        retryContent,
        {
          delay: retryDelay,
          headers: {
            'x-retry-count': context.attemptNumber + 1,
            'x-original-queue': this.config.queueName
          }
        }
      );

      await channel.ack(msg);
      console.log(`[SelfHealingWorker] Message ${context.messageId} scheduled for retry ${context.attemptNumber + 1} in ${retryDelay}ms`);
    } catch (error) {
      console.error(`[SelfHealingWorker] Failed to send to retry queue:`, error);
      await this.sendToDLQ(msg, channel, `Retry queue failed: ${error}`);
    }
  }

  /**
   * Send message to DLQ for manual investigation
   */
  private async sendToDLQ(
    msg: amqp.Message,
    channel: amqp.Channel,
    reason: string
  ): Promise<void> {
    try {
      const dlqContent = {
        originalMessage: JSON.parse(msg.content.toString()),
        failureReason: reason,
        failureTimestamp: new Date().toISOString(),
        originalQueue: this.config.queueName,
        headers: msg.properties.headers || {}
      };

      await publishWithRetry(
        'dlx.main',
        this.getDLQRoutingKey(),
        dlqContent
      );

      await channel.ack(msg);
      console.error(`[SelfHealingWorker] Message sent to DLQ: ${reason}`);
    } catch (error) {
      console.error(`[SelfHealingWorker] Failed to send to DLQ:`, error);
      await channel.nack(msg, false, false); // Drop message as last resort
    }
  }

  /**
   * Extract processing context from message
   */
  private extractContext(msg: amqp.Message, content: any): ProcessingContext {
    const headers = msg.properties.headers || {};
    const retryInfo = content._retry || {};

    return {
      messageId: headers['x-message-id'] || content.messageId || `msg-${Date.now()}`,
      loanId: content.loanId,
      tenantId: content.tenantId,
      stage: this.extractStageFromQueue(),
      attemptNumber: retryInfo.attemptNumber || 1,
      originalTimestamp: retryInfo.originalTimestamp || Date.now()
    };
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateRetryDelay(attemptNumber: number): number {
    const baseDelay = this.config.retryDelayMs;
    const exponentialDelay = baseDelay * Math.pow(2, attemptNumber - 1);
    const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
    return Math.min(exponentialDelay + jitter, 300000); // Cap at 5 minutes
  }

  /**
   * Extract stage name from queue name
   */
  private extractStageFromQueue(): string {
    const parts = this.config.queueName.split('.');
    return parts[parts.length - 2] || 'unknown';
  }

  /**
   * Get retry routing key for stage
   */
  private getRetryRoutingKey(stage: string): string {
    if (this.config.queueName.includes('doc.')) {
      return `doc.${stage}.retry.v1`;
    } else if (this.config.queueName.includes('analytics.')) {
      return `etl.${stage}.retry.v1`;
    } else if (this.config.queueName.includes('compliance.')) {
      return `audit.${stage}.retry.v1`;
    } else if (this.config.queueName.includes('ai.')) {
      return `ai.${stage}.retry.v1`;
    }
    return `${stage}.retry`;
  }

  /**
   * Get DLQ routing key
   */
  private getDLQRoutingKey(): string {
    if (this.config.queueName.includes('doc.')) {
      return 'doc.intelligence.dlq';
    } else if (this.config.queueName.includes('analytics.')) {
      return 'analytics.etl.dlq';
    } else if (this.config.queueName.includes('compliance.')) {
      return 'compliance.audit.dlq';
    } else if (this.config.queueName.includes('ai.')) {
      return 'ai.processing.dlq';
    }
    return 'general.dlq';
  }

  /**
   * Health check - verify queues are operational
   */
  async healthCheck(): Promise<{ healthy: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      const channel = await this.connection.createChannel();
      
      // Check if primary queue exists and is accessible
      try {
        await channel.checkQueue(this.config.queueName);
      } catch (error) {
        issues.push(`Primary queue ${this.config.queueName} not accessible`);
      }

      // Check if retry queue exists
      try {
        await channel.checkQueue(this.config.retryQueueName);
      } catch (error) {
        issues.push(`Retry queue ${this.config.retryQueueName} not accessible`);
      }

      // Check if DLQ exists
      try {
        await channel.checkQueue(this.config.dlqName);
      } catch (error) {
        issues.push(`DLQ ${this.config.dlqName} not accessible`);
      }

      await channel.close();
    } catch (error) {
      issues.push(`Cannot establish channel: ${error}`);
    }

    return {
      healthy: issues.length === 0,
      issues
    };
  }
}

/**
 * Example implementation for document processing worker
 */
export class DocumentIntelligenceWorker extends SelfHealingWorker {
  async processMessage(content: any, context: ProcessingContext): Promise<ProcessingResult> {
    try {
      // Simulate document processing
      const { documentId, stage } = content;
      
      console.log(`[DocumentWorker] Processing document ${documentId} at stage ${stage}`);
      
      // Simulate stage-specific processing
      switch (stage) {
        case 'import':
          await this.importDocument(documentId);
          break;
        case 'split':
          await this.splitDocument(documentId);
          break;
        case 'ocr':
          await this.performOCR(documentId);
          break;
        case 'extract':
          await this.extractData(documentId);
          break;
        case 'qc':
          await this.performQualityCheck(documentId);
          break;
        default:
          throw new Error(`Unknown stage: ${stage}`);
      }

      return { success: true };
    } catch (error: any) {
      // Determine if error is retryable
      const isRetryable = this.isRetryableError(error);
      
      return {
        success: false,
        error: error.message,
        shouldRetry: isRetryable,
        retryDelayMs: isRetryable ? undefined : 0 // Use default delay for retryable errors
      };
    }
  }

  private isRetryableError(error: Error): boolean {
    const retryableErrors = [
      'TIMEOUT',
      'CONNECTION_RESET',
      'RATE_LIMIT_EXCEEDED',
      'TEMPORARY_UNAVAILABLE'
    ];
    
    return retryableErrors.some(errorType => 
      error.message.includes(errorType)
    );
  }

  // Mock processing methods
  private async importDocument(documentId: string): Promise<void> {
    // Simulate import processing
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async splitDocument(documentId: string): Promise<void> {
    // Simulate document splitting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  private async performOCR(documentId: string): Promise<void> {
    // Simulate OCR processing
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private async extractData(documentId: string): Promise<void> {
    // Simulate data extraction
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  private async performQualityCheck(documentId: string): Promise<void> {
    // Simulate quality check
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}