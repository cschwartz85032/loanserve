import { db } from '../db';
import { systemSettings } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

export interface ConsumerPrefetchConfig {
  payment_validation: number;
  payment_processing: number;
  payment_distribution: number;
  payment_reversal: number;
  payment_classifier: number;
  rules_engine: number;
  notification: number;
  audit_log: number;
  poster_service: number;
  compliance_check: number;
  aml_screening: number;
  servicing_cycle: number;
  investor_reporting: number;
  clawback_processor: number;
  ach_return: number;
  wire_processor: number;
  default: number;
}

const DEFAULT_PREFETCH_CONFIG: ConsumerPrefetchConfig = {
  payment_validation: 20,      // Fast validation, can handle more
  payment_processing: 5,        // Heavy processing, lower prefetch
  payment_distribution: 10,     // Moderate processing
  payment_reversal: 3,          // Critical operations, very low prefetch
  payment_classifier: 15,       // Fast classification
  rules_engine: 10,            // Moderate rule evaluation
  notification: 50,            // Very fast, can handle many
  audit_log: 100,              // Extremely fast writes
  poster_service: 8,           // External API calls, moderate
  compliance_check: 5,         // Heavy compliance checks
  aml_screening: 3,            // Very heavy AML checks
  servicing_cycle: 1,          // Critical daily processing
  investor_reporting: 5,       // Heavy report generation
  clawback_processor: 3,       // Critical financial operations
  ach_return: 5,              // Return processing
  wire_processor: 10,         // Wire transfers
  default: 10                 // Default for unknown consumers
};

const PREFETCH_KEY = 'rabbitmq_prefetch_config';
const CATEGORY = 'messaging';

export class RabbitMQConfigService {
  private static instance: RabbitMQConfigService;
  private config: ConsumerPrefetchConfig | null = null;
  private lastFetch: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute cache

  private constructor() {}

  static getInstance(): RabbitMQConfigService {
    if (!RabbitMQConfigService.instance) {
      RabbitMQConfigService.instance = new RabbitMQConfigService();
    }
    return RabbitMQConfigService.instance;
  }

  /**
   * Get prefetch configuration for all consumers
   */
  async getConfig(): Promise<ConsumerPrefetchConfig> {
    // Check cache
    if (this.config && Date.now() - this.lastFetch < this.CACHE_TTL) {
      return this.config;
    }

    try {
      const result = await db
        .select()
        .from(systemSettings)
        .where(
          and(
            eq(systemSettings.category, CATEGORY),
            eq(systemSettings.key, PREFETCH_KEY)
          )
        )
        .limit(1);

      if (result.length > 0) {
        this.config = result[0].value as ConsumerPrefetchConfig;
      } else {
        // Initialize with defaults if not found
        await this.saveConfig(DEFAULT_PREFETCH_CONFIG);
        this.config = DEFAULT_PREFETCH_CONFIG;
      }

      this.lastFetch = Date.now();
      return this.config;
    } catch (error) {
      console.error('[RabbitMQConfig] Failed to fetch config:', error);
      // Return defaults on error
      return DEFAULT_PREFETCH_CONFIG;
    }
  }

  /**
   * Get prefetch value for a specific consumer
   */
  async getPrefetch(consumerType: keyof ConsumerPrefetchConfig): Promise<number> {
    const config = await this.getConfig();
    return config[consumerType] || config.default;
  }

  /**
   * Save prefetch configuration
   */
  async saveConfig(config: Partial<ConsumerPrefetchConfig>, userId?: number): Promise<void> {
    const fullConfig = { ...DEFAULT_PREFETCH_CONFIG, ...config };
    
    try {
      const existing = await db
        .select()
        .from(systemSettings)
        .where(
          and(
            eq(systemSettings.category, CATEGORY),
            eq(systemSettings.key, PREFETCH_KEY)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Update existing
        await db
          .update(systemSettings)
          .set({
            value: fullConfig,
            updatedBy: userId,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(systemSettings.category, CATEGORY),
              eq(systemSettings.key, PREFETCH_KEY)
            )
          );
      } else {
        // Insert new
        await db.insert(systemSettings).values({
          category: CATEGORY,
          key: PREFETCH_KEY,
          value: fullConfig,
          description: 'RabbitMQ consumer prefetch configuration. Adjust based on processing time and network latency.',
          isEditable: true,
          updatedBy: userId
        });
      }

      // Clear cache
      this.config = fullConfig;
      this.lastFetch = Date.now();
      
      console.log('[RabbitMQConfig] Configuration saved successfully');
    } catch (error) {
      console.error('[RabbitMQConfig] Failed to save config:', error);
      throw error;
    }
  }

  /**
   * Reset to default configuration
   */
  async resetToDefaults(userId?: number): Promise<void> {
    await this.saveConfig(DEFAULT_PREFETCH_CONFIG, userId);
  }

  /**
   * Get recommended prefetch based on metrics
   * This could be enhanced with actual performance metrics
   */
  getRecommendedPrefetch(
    avgProcessingTimeMs: number,
    networkRoundTripMs: number = 10
  ): number {
    // CloudAMQP recommendation formula
    const ratio = avgProcessingTimeMs / networkRoundTripMs;
    
    if (ratio < 1) {
      return 50; // Very fast processing
    } else if (ratio < 5) {
      return 20; // Fast processing
    } else if (ratio < 10) {
      return 10; // Moderate processing
    } else if (ratio < 20) {
      return 5;  // Slow processing
    } else {
      return 1;  // Very slow processing
    }
  }

  /**
   * Clear cache to force refresh
   */
  clearCache(): void {
    this.config = null;
    this.lastFetch = 0;
  }
}

// Export singleton instance
export const rabbitmqConfig = RabbitMQConfigService.getInstance();