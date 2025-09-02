/**
 * RabbitMQ Initialization Service for AI Pipeline
 * Handles connection management and topology setup
 */

import { initializeAIPipelineTopology, healthCheckTopology, validateTopology, AI_PIPELINE_TOPOLOGY } from './init-queues';

export class RabbitMQInitService {
  private connectionUrl: string;
  private isInitialized: boolean = false;

  constructor() {
    this.connectionUrl = process.env.CLOUDAMQP_URL || 'amqp://localhost:5672';
  }

  /**
   * Initialize RabbitMQ topology for AI pipeline
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[RabbitMQ] Already initialized, skipping...');
      return;
    }

    try {
      console.log('[RabbitMQ] Starting AI Pipeline topology initialization...');

      // Validate topology configuration first
      const validation = validateTopology(AI_PIPELINE_TOPOLOGY);
      if (!validation.isValid) {
        throw new Error(`Invalid topology configuration: ${validation.errors.join(', ')}`);
      }

      // Initialize the topology
      await initializeAIPipelineTopology(this.connectionUrl);

      // Verify topology health
      const healthCheck = await healthCheckTopology(this.connectionUrl);
      if (!healthCheck.isHealthy) {
        console.warn('[RabbitMQ] Topology health check issues:', healthCheck.details.missingComponents);
      }

      this.isInitialized = true;
      console.log('[RabbitMQ] AI Pipeline topology initialization complete');

    } catch (error) {
      console.error('[RabbitMQ] Failed to initialize topology:', error);
      throw error;
    }
  }

  /**
   * Check if RabbitMQ is healthy and ready
   */
  async healthCheck(): Promise<boolean> {
    try {
      const health = await healthCheckTopology(this.connectionUrl);
      return health.isHealthy;
    } catch (error) {
      console.error('[RabbitMQ] Health check failed:', error);
      return false;
    }
  }

  /**
   * Get topology status
   */
  async getTopologyStatus(): Promise<any> {
    try {
      return await healthCheckTopology(this.connectionUrl);
    } catch (error) {
      console.error('[RabbitMQ] Failed to get topology status:', error);
      return {
        isHealthy: false,
        details: {
          connection: false,
          exchanges: [],
          queues: [],
          missingComponents: ['connection-failed']
        }
      };
    }
  }
}

// Global instance
export const rabbitMQInit = new RabbitMQInitService();