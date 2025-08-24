import { OutboxService } from './outbox';

export class OutboxDispatcher {
  private outboxService: OutboxService;
  private isRunning: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private pollIntervalMs: number;

  constructor(pollIntervalMs: number = 5000) {
    this.outboxService = new OutboxService();
    this.pollIntervalMs = pollIntervalMs;
  }

  /**
   * Start the dispatcher
   */
  start(): void {
    if (this.isRunning) {
      console.log('[OutboxDispatcher] Already running');
      return;
    }

    this.isRunning = true;
    console.log(`[OutboxDispatcher] Starting with poll interval ${this.pollIntervalMs}ms`);

    // Initial poll
    this.poll();

    // Set up interval polling
    this.pollInterval = setInterval(() => {
      this.poll();
    }, this.pollIntervalMs);
  }

  /**
   * Stop the dispatcher
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('[OutboxDispatcher] Not running');
      return;
    }

    this.isRunning = false;
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    console.log('[OutboxDispatcher] Stopped');
  }

  /**
   * Poll and process messages
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      const publishedCount = await this.outboxService.processOutboxMessages();
      
      if (publishedCount > 0) {
        console.log(`[OutboxDispatcher] Published ${publishedCount} messages`);
      }
    } catch (error) {
      console.error('[OutboxDispatcher] Error during poll:', error);
    }
  }

  /**
   * Get dispatcher status
   */
  getStatus(): { isRunning: boolean; pollIntervalMs: number } {
    return {
      isRunning: this.isRunning,
      pollIntervalMs: this.pollIntervalMs
    };
  }

  /**
   * Update poll interval
   */
  updatePollInterval(newIntervalMs: number): void {
    this.pollIntervalMs = newIntervalMs;
    
    if (this.isRunning) {
      // Restart with new interval
      this.stop();
      this.start();
    }
  }
}

// Create singleton instance
export const outboxDispatcher = new OutboxDispatcher(5000); // 5 second default