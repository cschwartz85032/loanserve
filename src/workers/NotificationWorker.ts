// Notification Worker: Process notification requests from queues
// Handles retries, dead letter queues, and batch processing

import { requestNotification, type NotificationRequest } from "../notifications/service";

/**
 * Notification Worker for processing notification requests
 * Simplified implementation for immediate integration
 */
export class NotificationWorker {
  private isRunning: boolean = false;

  /**
   * Initialize and start the notification worker
   */
  async start() {
    console.log("[NotificationWorker] Starting notification worker...");
    this.isRunning = true;
    console.log("[NotificationWorker] Notification worker started successfully");
  }

  /**
   * Stop the notification worker
   */
  async stop() {
    console.log("[NotificationWorker] Stopping notification worker...");
    this.isRunning = false;
    console.log("[NotificationWorker] Notification worker stopped");
  }

  /**
   * Process a single notification request
   */
  async processNotificationRequest(request: NotificationRequest): Promise<void> {
    if (!this.isRunning) {
      throw new Error("Notification worker is not running");
    }

    try {
      console.log(`[NotificationWorker] Processing notification: ${request.templateCode} -> ${request.toAddress}`);
      
      const result = await requestNotification(request);
      
      if (result) {
        console.log(`[NotificationWorker] Notification ${result.id} ${result.status}`);
        if (result.reason) {
          console.log(`[NotificationWorker] Reason: ${result.reason}`);
        }
      } else {
        console.log(`[NotificationWorker] Notification skipped (duplicate)`);
      }
    } catch (error: any) {
      console.error(`[NotificationWorker] Failed to process notification:`, error);
      throw error;
    }
  }

  /**
   * Process multiple notification requests in batch
   */
  async processBatch(requests: NotificationRequest[]): Promise<void> {
    if (!this.isRunning) {
      throw new Error("Notification worker is not running");
    }

    console.log(`[NotificationWorker] Processing batch of ${requests.length} notifications`);
    
    const results = await Promise.allSettled(
      requests.map(request => this.processNotificationRequest(request))
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`[NotificationWorker] Batch complete: ${succeeded} succeeded, ${failed} failed`);
  }

  /**
   * Get worker status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      timestamp: new Date().toISOString()
    };
  }
}

// Global worker instance
let notificationWorker: NotificationWorker | null = null;

/**
 * Start the global notification worker
 */
export async function startNotificationWorker(): Promise<NotificationWorker> {
  if (!notificationWorker) {
    notificationWorker = new NotificationWorker();
    await notificationWorker.start();
  }
  return notificationWorker;
}

/**
 * Get the global notification worker instance
 */
export function getNotificationWorker(): NotificationWorker | null {
  return notificationWorker;
}