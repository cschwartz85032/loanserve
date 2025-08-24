import { pool } from '../db';
import type { PoolClient } from 'pg';
import { EnhancedRabbitMQService } from './rabbitmq-enhanced';

interface ConsumerHealth {
  name: string;
  lastHeartbeat: Date;
  messagesProcessed: number;
  lastMessageAt: Date | null;
  isHealthy: boolean;
  errorCount: number;
  lastError: string | null;
}

export class ConsumerHealthMonitor {
  private static instance: ConsumerHealthMonitor;
  private consumers: Map<string, ConsumerHealth> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_THRESHOLD_MS = 60000; // 1 minute
  private readonly MESSAGE_THRESHOLD_MS = 300000; // 5 minutes for warning
  
  static getInstance(): ConsumerHealthMonitor {
    if (!this.instance) {
      this.instance = new ConsumerHealthMonitor();
    }
    return this.instance;
  }

  /**
   * Register a consumer for health monitoring
   */
  registerConsumer(name: string): void {
    this.consumers.set(name, {
      name,
      lastHeartbeat: new Date(),
      messagesProcessed: 0,
      lastMessageAt: null,
      isHealthy: true,
      errorCount: 0,
      lastError: null
    });
    console.log(`[HealthMonitor] Registered consumer: ${name}`);
  }

  /**
   * Record a heartbeat from a consumer
   */
  recordHeartbeat(consumerName: string): void {
    const consumer = this.consumers.get(consumerName);
    if (consumer) {
      consumer.lastHeartbeat = new Date();
      consumer.isHealthy = true;
    }
  }

  /**
   * Record successful message processing
   */
  recordMessageProcessed(consumerName: string): void {
    const consumer = this.consumers.get(consumerName);
    if (consumer) {
      consumer.messagesProcessed++;
      consumer.lastMessageAt = new Date();
      consumer.lastHeartbeat = new Date();
      consumer.isHealthy = true;
      consumer.errorCount = 0; // Reset error count on success
    }
  }

  /**
   * Record a consumer error
   */
  recordError(consumerName: string, error: string): void {
    const consumer = this.consumers.get(consumerName);
    if (consumer) {
      consumer.errorCount++;
      consumer.lastError = error;
      consumer.lastHeartbeat = new Date();
      
      // Mark unhealthy after 3 consecutive errors
      if (consumer.errorCount >= 3) {
        consumer.isHealthy = false;
        this.sendAlert(consumerName, `Consumer has ${consumer.errorCount} consecutive errors: ${error}`);
      }
    }
  }

  /**
   * Start monitoring consumers
   */
  startMonitoring(): void {
    if (this.checkInterval) {
      return; // Already monitoring
    }

    console.log('[HealthMonitor] Starting consumer health monitoring...');
    
    // Check health every 30 seconds
    this.checkInterval = setInterval(() => {
      this.checkConsumerHealth();
    }, 30000);

    // Also check immediately
    this.checkConsumerHealth();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Check health of all registered consumers
   */
  private async checkConsumerHealth(): Promise<void> {
    const now = new Date();
    
    for (const [name, consumer] of Array.from(this.consumers.entries())) {
      const timeSinceHeartbeat = now.getTime() - consumer.lastHeartbeat.getTime();
      
      // Check if consumer is dead (no heartbeat for 1 minute)
      if (timeSinceHeartbeat > this.HEARTBEAT_THRESHOLD_MS) {
        if (consumer.isHealthy) {
          consumer.isHealthy = false;
          await this.sendAlert(name, `Consumer appears to be dead - no heartbeat for ${Math.floor(timeSinceHeartbeat / 1000)} seconds`);
          await this.attemptRecovery(name);
        }
      }
      
      // Check if consumer is stuck (no messages processed recently when there should be)
      if (consumer.lastMessageAt) {
        const timeSinceLastMessage = now.getTime() - consumer.lastMessageAt.getTime();
        if (timeSinceLastMessage > this.MESSAGE_THRESHOLD_MS && consumer.isHealthy) {
          // Check if there are pending messages
          const hasPendingMessages = await this.checkPendingMessages(name);
          if (hasPendingMessages) {
            await this.sendAlert(name, `Consumer may be stuck - no messages processed for ${Math.floor(timeSinceLastMessage / 1000)} seconds despite pending messages`);
          }
        }
      }
    }

    // Also check database for stuck messages
    await this.checkStuckMessages();
  }

  /**
   * Check if there are pending messages for a consumer
   */
  private async checkPendingMessages(consumerName: string): Promise<boolean> {
    let client: PoolClient | null = null;
    try {
      client = await pool.connect();
      
      // Map consumer names to their routing keys
      const routingKeyMap: Record<string, string> = {
        'payment-validation': 'payments.received',
        'payment-processing': 'payments.validated',
        'payment-distribution': 'payments.posted'
      };
      
      const routingKey = routingKeyMap[consumerName];
      if (!routingKey) return false;
      
      // Check for unpublished messages in outbox
      const result = await client.query(`
        SELECT COUNT(*) as pending
        FROM outbox
        WHERE routing_key = $1
          AND published_at IS NULL
          AND created_at > NOW() - INTERVAL '1 hour'
      `, [routingKey]);
      
      return parseInt(result.rows[0].pending) > 0;
    } catch (error) {
      console.error(`[HealthMonitor] Error checking pending messages:`, error);
      return false;
    } finally {
      if (client) client.release();
    }
  }

  /**
   * Check for stuck messages in the system
   */
  private async checkStuckMessages(): Promise<void> {
    let client: PoolClient | null = null;
    try {
      client = await pool.connect();
      
      // Check for messages published but not consumed
      const stuckMessages = await client.query(`
        SELECT 
          o.aggregate_id,
          o.routing_key,
          o.published_at,
          o.payload
        FROM outbox o
        WHERE o.published_at IS NOT NULL
          AND o.published_at < NOW() - INTERVAL '5 minutes'
          AND NOT EXISTS (
            SELECT 1 FROM inbox i 
            WHERE i.message_id = o.headers->>'x-message-id'
          )
        ORDER BY o.published_at DESC
        LIMIT 10
      `);
      
      if (stuckMessages.rows.length > 0) {
        await this.sendAlert('system', 
          `Found ${stuckMessages.rows.length} messages published but not consumed for >5 minutes. ` +
          `Example: ${stuckMessages.rows[0].aggregate_id} (${stuckMessages.rows[0].routing_key})`
        );
        
        // Log stuck messages to audit
        for (const msg of stuckMessages.rows) {
          await this.logAuditEvent(client, 'message_stuck_detected', {
            aggregate_id: msg.aggregate_id,
            routing_key: msg.routing_key,
            published_at: msg.published_at,
            time_stuck: `${Math.floor((Date.now() - new Date(msg.published_at).getTime()) / 60000)} minutes`
          });
        }
      }
    } catch (error) {
      console.error(`[HealthMonitor] Error checking stuck messages:`, error);
    } finally {
      if (client) client.release();
    }
  }

  /**
   * Attempt to recover a failed consumer
   */
  private async attemptRecovery(consumerName: string): Promise<void> {
    console.log(`[HealthMonitor] Attempting recovery for consumer: ${consumerName}`);
    
    try {
      // Try to reconnect to RabbitMQ
      const rabbitmq = EnhancedRabbitMQService.getInstance();
      await rabbitmq.reconnect();
      
      // Mark consumer as potentially healthy after reconnection attempt
      const consumer = this.consumers.get(consumerName);
      if (consumer) {
        consumer.lastHeartbeat = new Date();
        console.log(`[HealthMonitor] Recovery attempt completed for ${consumerName}`);
      }
    } catch (error) {
      console.error(`[HealthMonitor] Recovery failed for ${consumerName}:`, error);
      await this.sendAlert(consumerName, `Recovery attempt failed: ${error}`);
    }
  }

  /**
   * Send alert to admins
   */
  private async sendAlert(consumerName: string, message: string): Promise<void> {
    const alertMessage = `[CRITICAL] Consumer Health Alert - ${consumerName}: ${message}`;
    console.error(alertMessage);
    
    let client: PoolClient | null = null;
    try {
      client = await pool.connect();
      
      // Log to system alerts table
      await client.query(`
        INSERT INTO system_alerts (
          severity, component, message, details, created_at
        ) VALUES ($1, $2, $3, $4, NOW())
      `, [
        'CRITICAL',
        `consumer-${consumerName}`,
        message,
        JSON.stringify({
          consumer: consumerName,
          health: this.consumers.get(consumerName),
          timestamp: new Date().toISOString()
        })
      ]);
      
      // Also log to audit
      await this.logAuditEvent(client, 'consumer_health_alert', {
        consumer: consumerName,
        alert: message,
        severity: 'CRITICAL'
      });
      
      // TODO: Send email/SMS/Slack notification to admins
      // This would integrate with your notification service
      
    } catch (error) {
      console.error(`[HealthMonitor] Failed to send alert:`, error);
    } finally {
      if (client) client.release();
    }
  }

  /**
   * Log audit event
   */
  private async logAuditEvent(
    client: PoolClient,
    eventType: string,
    details: any
  ): Promise<void> {
    try {
      await client.query(`
        INSERT INTO audit_log (
          event_type, entity_type, entity_id, details, created_at, created_by
        ) VALUES ($1, $2, $3, $4, NOW(), $5)
      `, [
        eventType,
        'consumer_health',
        details.consumer || 'system',
        JSON.stringify(details),
        'system'
      ]);
    } catch (error) {
      console.error(`[HealthMonitor] Failed to log audit event:`, error);
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): Record<string, ConsumerHealth> {
    const status: Record<string, ConsumerHealth> = {};
    for (const [name, health] of Array.from(this.consumers.entries())) {
      status[name] = { ...health };
    }
    return status;
  }

  /**
   * Check if all consumers are healthy
   */
  areAllConsumersHealthy(): boolean {
    for (const consumer of Array.from(this.consumers.values())) {
      if (!consumer.isHealthy) {
        return false;
      }
    }
    return true;
  }
}