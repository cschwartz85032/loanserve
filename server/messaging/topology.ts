/**
 * Optimized RabbitMQ Topology Configuration
 * Reduces queue count from 55 to ~25-30 based on CloudAMQP best practices
 */

import { TopologyManager } from './rabbitmq-topology';

export interface TopologyOptimizationConfig {
  // Feature flags to conditionally create queues
  features: {
    servicing: boolean;
    settlement: boolean;
    reconciliation: boolean;
    escrow: boolean;
    compliance: boolean;
    aml: boolean;
    notifications: {
      email: boolean;
      sms: boolean;
      dashboard: boolean;
    };
  };
  // Performance tuning
  performance: {
    servicingShards: number; // Reduced from 8 to 2-4
    useConsolidatedQueues: boolean;
    usePriorityQueues: boolean;
  };
}

export class OptimizedTopologyManager extends TopologyManager {
  private config: TopologyOptimizationConfig;

  constructor(config?: Partial<TopologyOptimizationConfig>) {
    // Don't call parent constructor's defineTopology
    super();
    
    // Default optimized configuration
    this.config = {
      features: {
        servicing: true,
        settlement: false, // Disable by default until needed
        reconciliation: false, // Disable by default until needed
        escrow: true,
        compliance: false, // Disable by default until needed
        aml: false, // Disable by default until needed
        notifications: {
          email: true,
          sms: false, // Disable by default
          dashboard: true,
        },
      },
      performance: {
        servicingShards: 2, // Reduced from 8 to 2
        useConsolidatedQueues: true,
        usePriorityQueues: true,
      },
      ...config,
    };

    this.defineOptimizedTopology();
  }

  private defineOptimizedTopology(): void {
    // Core exchanges (always needed)
    this.addExchange({
      name: 'payments.topic',
      type: 'topic',
      durable: true,
    });

    this.addExchange({
      name: 'documents.direct',
      type: 'direct',
      durable: true,
    });

    this.addExchange({
      name: 'dlx.main',
      type: 'topic',
      durable: true,
    });

    this.addExchange({
      name: 'audit.topic',
      type: 'topic',
      durable: true,
    });

    // Conditionally add exchanges based on features
    if (this.config.features.servicing) {
      this.addExchange({
        name: 'servicing.direct',
        type: 'direct',
        durable: true,
      });
    }

    if (this.config.features.notifications.email || 
        this.config.features.notifications.sms || 
        this.config.features.notifications.dashboard) {
      this.addExchange({
        name: 'notifications.topic',
        type: 'topic',
        durable: true,
      });
    }

    if (this.config.features.escrow) {
      this.addExchange({
        name: 'escrow.workflow',
        type: 'topic',
        durable: true,
      });
      
      // Add escrow saga and events exchanges for Phase 3
      this.addExchange({
        name: 'escrow.saga',
        type: 'topic',
        durable: true,
      });
      
      this.addExchange({
        name: 'escrow.events',
        type: 'topic',
        durable: true,
      });
      
      this.addExchange({
        name: 'escrow.compensate',
        type: 'topic',
        durable: true,
      });
      
      this.addExchange({
        name: 'escrow.dlq',
        type: 'direct',
        durable: true,
      });
    }

    if (this.config.features.compliance || this.config.features.aml) {
      this.addExchange({
        name: 'compliance.topic',
        type: 'topic',
        durable: true,
      });
    }

    // Investor exchange (always needed for payment distribution)
    this.addExchange({
      name: 'investor.direct',
      type: 'direct',
      durable: true,
    });

    // Add optimized queues
    this.defineOptimizedQueues();
  }

  private defineOptimizedQueues(): void {
    // Servicing queues - reduced shards
    if (this.config.features.servicing) {
      const shardCount = this.config.performance.servicingShards;
      for (let i = 0; i < shardCount; i++) {
        this.addQueue({
          name: `servicing.daily.tasks.${i}`,
          durable: true,
          arguments: {
            'x-queue-type': 'quorum',
            'x-message-ttl': 86400000, // 24 hours
            'x-dead-letter-exchange': 'dlx.main',
            'x-dead-letter-routing-key': 'servicing.dlq',
            'x-max-length': 500000,
            'x-overflow': 'reject-publish-dlx',
          },
          bindings: [{
            exchange: 'servicing.direct',
            routingKey: `servicing.${i}.*`,
          }],
        });
      }
    }

    // Core payment processing queues (consolidated)
    if (this.config.performance.useConsolidatedQueues) {
      // Single validation queue handles both validation and classification
      this.addQueue({
        name: 'payments.intake',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'dlx.main',
          'x-dead-letter-routing-key': 'payments.dlq',
        },
        bindings: [
          { exchange: 'payments.topic', routingKey: 'payment.*.received' },
          { exchange: 'payments.topic', routingKey: 'payment.*.validate' },
        ],
      });

      // Combined processing and distribution queue
      this.addQueue({
        name: 'payments.processing',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'dlx.main',
          'x-dead-letter-routing-key': 'payments.dlq',
        },
        bindings: [
          { exchange: 'payments.topic', routingKey: 'payment.*.validated' },
          { exchange: 'payments.topic', routingKey: 'payment.*.process' },
        ],
      });
    } else {
      // Original separate queues
      this.addQueue({
        name: 'payments.validation',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'dlx.main',
          'x-dead-letter-routing-key': 'payments.dlq',
        },
        bindings: [
          { exchange: 'payments.topic', routingKey: 'payment.*.received' },
        ],
      });

      this.addQueue({
        name: 'payments.processing',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'dlx.main',
          'x-dead-letter-routing-key': 'payments.dlq',
        },
        bindings: [
          { exchange: 'payments.topic', routingKey: 'payment.*.validated' },
        ],
      });

      this.addQueue({
        name: 'payments.distribution',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'dlx.main',
          'x-dead-letter-routing-key': 'payments.dlq',
        },
        bindings: [
          { exchange: 'payments.topic', routingKey: 'payment.*.processed' },
        ],
      });
    }

    // Critical payment operations (always needed)
    this.addQueue({
      name: 'payments.reversal',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'payments.dlq',
      },
      bindings: [
        { exchange: 'payments.topic', routingKey: 'payment.*.reversal' },
      ],
    });

    this.addQueue({
      name: 'payments.returned',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-dead-letter-routing-key': 'payments.dlq',
      },
      bindings: [
        { exchange: 'payments.topic', routingKey: 'payment.*.returned' },
      ],
    });

    // Investor calculations - use single queue with priority
    if (this.config.performance.usePriorityQueues) {
      this.addQueue({
        name: 'investor.calculations',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'dlx.main',
          'x-max-priority': 10, // Priority queue
        },
        bindings: [
          { exchange: 'investor.direct', routingKey: 'calc.*' },
        ],
      });
    } else {
      // Keep separate priority queues
      this.addQueue({
        name: 'investor.calc.p10',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'dlx.main',
        },
        bindings: [
          { exchange: 'investor.direct', routingKey: 'calc.p10' },
        ],
      });

      this.addQueue({
        name: 'investor.calc.p1',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'dlx.main',
        },
        bindings: [
          { exchange: 'investor.direct', routingKey: 'calc.p1' },
        ],
      });
    }

    // Investor clawback (always needed)
    this.addQueue({
      name: 'investor.clawback',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
      },
      bindings: [
        { exchange: 'investor.direct', routingKey: 'clawback' },
      ],
    });

    // Document processing (always needed)
    this.addQueue({
      name: 'documents.analysis.request',
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': 'dlx.main',
        'x-message-ttl': 1800000, // 30 minutes
      },
      bindings: [
        { exchange: 'documents.direct', routingKey: 'analyze' },
      ],
    });

    // Notification queues (conditional)
    if (this.config.features.notifications.email) {
      this.addQueue({
        name: 'notifications.email',
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'dlx.main',
          'x-dead-letter-routing-key': 'notifications.dlq',
        },
        bindings: [
          { exchange: 'notifications.topic', routingKey: 'notify.*.*.email' },
        ],
      });
    }

    if (this.config.features.notifications.sms) {
      this.addQueue({
        name: 'notifications.sms',
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'dlx.main',
          'x-dead-letter-routing-key': 'notifications.dlq',
        },
        bindings: [
          { exchange: 'notifications.topic', routingKey: 'notify.*.*.sms' },
        ],
      });
    }

    if (this.config.features.notifications.dashboard) {
      this.addQueue({
        name: 'notifications.dashboard',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
        },
        bindings: [
          { exchange: 'notifications.topic', routingKey: 'notify.*.*.dashboard' },
        ],
      });
    }

    // Escrow queues (conditional, consolidated)
    if (this.config.features.escrow) {
      // Phase 3: Escrow Subsystem Queues
      // These are the specific queues required by the escrow consumers
      
      // Escrow forecast queue
      this.addQueue({
        name: 'q.forecast',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'escrow.dlq',
          'x-dead-letter-routing-key': 'forecast.failed',
        },
        bindings: [
          { exchange: 'escrow.saga', routingKey: 'forecast.request' },
          { exchange: 'escrow.saga', routingKey: 'forecast.retry' },
        ],
      });
      
      // Escrow disbursement scheduling queue
      this.addQueue({
        name: 'q.schedule.disbursement',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'escrow.dlq',
          'x-dead-letter-routing-key': 'disbursement.failed',
        },
        bindings: [
          { exchange: 'escrow.saga', routingKey: 'disbursement.schedule' },
          { exchange: 'escrow.saga', routingKey: 'disbursement.retry' },
        ],
      });
      
      // Escrow analysis queue
      this.addQueue({
        name: 'q.escrow.analysis',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'escrow.dlq',
          'x-dead-letter-routing-key': 'analysis.failed',
        },
        bindings: [
          { exchange: 'escrow.saga', routingKey: 'analysis.request' },
          { exchange: 'escrow.saga', routingKey: 'analysis.retry' },
        ],
      });
      
      // Escrow DLQ
      this.addQueue({
        name: 'q.escrow.dlq',
        durable: true,
        arguments: {
          'x-message-ttl': 86400000, // 24 hours
        },
        bindings: [
          { exchange: 'escrow.dlq', routingKey: '#' },
        ],
      });
      
      // Legacy escrow workflow queues (keep for backward compatibility)
      if (this.config.performance.useConsolidatedQueues) {
        // Single escrow queue handles all escrow operations
        this.addQueue({
          name: 'escrow.operations',
          durable: true,
          arguments: {
            'x-queue-type': 'quorum',
            'x-dead-letter-exchange': 'dlx.main',
          },
          bindings: [
            { exchange: 'escrow.workflow', routingKey: 'escrow.*' },
          ],
        });
      } else {
        // Keep separate escrow queues
        this.addQueue({
          name: 'escrow.validate',
          durable: true,
          arguments: {
            'x-queue-type': 'quorum',
            'x-dead-letter-exchange': 'dlx.main',
          },
          bindings: [
            { exchange: 'escrow.workflow', routingKey: 'escrow.validate' },
          ],
        });

        this.addQueue({
          name: 'escrow.authorize',
          durable: true,
          arguments: {
            'x-queue-type': 'quorum',
            'x-dead-letter-exchange': 'dlx.main',
          },
          bindings: [
            { exchange: 'escrow.workflow', routingKey: 'escrow.authorize' },
          ],
        });

        this.addQueue({
          name: 'escrow.disburse',
          durable: true,
          arguments: {
            'x-queue-type': 'quorum',
            'x-dead-letter-exchange': 'dlx.main',
          },
          bindings: [
            { exchange: 'escrow.workflow', routingKey: 'escrow.disburse' },
          ],
        });
        
        this.addQueue({
          name: 'escrow.reconcile',
          durable: true,
          arguments: {
            'x-queue-type': 'quorum',
            'x-dead-letter-exchange': 'dlx.main',
          },
          bindings: [
            { exchange: 'escrow.workflow', routingKey: 'escrow.reconcile' },
          ],
        });
      }
    }

    // Compliance queues (conditional, consolidated)
    if (this.config.features.compliance) {
      this.addQueue({
        name: 'compliance.all',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'dlx.main',
        },
        bindings: [
          { exchange: 'compliance.topic', routingKey: 'compliance.*.*' },
        ],
      });
    }

    // AML queues (conditional, consolidated)
    if (this.config.features.aml) {
      this.addQueue({
        name: 'aml.operations',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'dlx.main',
        },
        bindings: [
          { exchange: 'compliance.topic', routingKey: 'aml.*' },
        ],
      });
    }

    // Settlement queues (conditional)
    if (this.config.features.settlement) {
      this.addExchange({
        name: 'settlement.topic',
        type: 'topic',
        durable: true,
      });

      // Consolidated settlement queue
      this.addQueue({
        name: 'settlement.all',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'dlx.main',
          'x-dead-letter-routing-key': 'settlement.dlq',
        },
        bindings: [
          { exchange: 'settlement.topic', routingKey: '*.*.*' },
        ],
      });
    }

    // Reconciliation queues (conditional)
    if (this.config.features.reconciliation) {
      this.addExchange({
        name: 'reconciliation.topic',
        type: 'topic',
        durable: true,
      });

      this.addExchange({
        name: 'bank.topic',
        type: 'topic',
        durable: true,
      });

      // Consolidated reconciliation queue
      this.addQueue({
        name: 'reconciliation.all',
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'dlx.main',
          'x-dead-letter-routing-key': 'reconciliation.dlq',
        },
        bindings: [
          { exchange: 'reconciliation.topic', routingKey: '*.*' },
          { exchange: 'bank.topic', routingKey: 'bank.*.*' },
        ],
      });
    }

    // Audit queue (always needed, but with optimized settings)
    this.addQueue({
      name: 'audit.events',
      durable: true,
      arguments: {
        'x-queue-mode': 'lazy',
        'x-max-length': 1000000, // Reduced from 10M to 1M
        'x-message-ttl': 604800000, // 7 days TTL
      },
      bindings: [
        { exchange: 'audit.topic', routingKey: 'audit.*' },
      ],
    });

    // Consolidated DLQs (reduced from 15 to 3-5)
    this.addQueue({
      name: 'dlq.payments',
      durable: true,
      bindings: [
        { exchange: 'dlx.main', routingKey: 'payments.dlq' },
      ],
    });

    if (this.config.features.servicing) {
      this.addQueue({
        name: 'dlq.servicing',
        durable: true,
        bindings: [
          { exchange: 'dlx.main', routingKey: 'servicing.dlq' },
        ],
      });
    }

    if (this.config.features.notifications.email || 
        this.config.features.notifications.sms || 
        this.config.features.notifications.dashboard) {
      this.addQueue({
        name: 'dlq.notifications',
        durable: true,
        bindings: [
          { exchange: 'dlx.main', routingKey: 'notifications.dlq' },
        ],
      });
    }

    // General DLQ for all other failures
    this.addQueue({
      name: 'dlq.general',
      durable: true,
      bindings: [
        { exchange: 'dlx.main', routingKey: '*.dlq' },
      ],
    });
  }

  /**
   * Get optimization metrics
   */
  getOptimizationMetrics(): {
    originalQueues: number;
    optimizedQueues: number;
    reduction: string;
    recommendations: string[];
  } {
    const stats = this.getStats();
    const originalQueues = 55;
    const optimizedQueues = stats.queues;
    const reduction = Math.round((1 - optimizedQueues / originalQueues) * 100);

    const recommendations: string[] = [];

    if (this.config.performance.servicingShards > 2) {
      recommendations.push(`Consider reducing servicing shards from ${this.config.performance.servicingShards} to 2 for most workloads`);
    }

    if (!this.config.performance.useConsolidatedQueues) {
      recommendations.push('Enable consolidated queues to reduce queue count by ~30%');
    }

    if (!this.config.performance.usePriorityQueues) {
      recommendations.push('Use priority queues instead of separate queues for investor calculations');
    }

    // Check disabled features that could be consolidated
    const disabledFeatures = [];
    if (!this.config.features.settlement) disabledFeatures.push('settlement');
    if (!this.config.features.reconciliation) disabledFeatures.push('reconciliation');
    if (!this.config.features.compliance) disabledFeatures.push('compliance');
    if (!this.config.features.aml) disabledFeatures.push('AML');

    if (disabledFeatures.length > 0) {
      recommendations.push(`Features currently disabled: ${disabledFeatures.join(', ')}. Enable only when needed.`);
    }

    return {
      originalQueues,
      optimizedQueues,
      reduction: `${reduction}%`,
      recommendations,
    };
  }
}

// Export optimized topology with recommended configuration
export function createOptimizedTopology(customConfig?: Partial<TopologyOptimizationConfig>): OptimizedTopologyManager {
  return new OptimizedTopologyManager(customConfig);
}

// Get environment-based configuration
export function getEnvironmentConfig(): Partial<TopologyOptimizationConfig> {
  const env = process.env.NODE_ENV || 'development';
  
  if (env === 'production') {
    return {
      features: {
        servicing: true,
        settlement: true,
        reconciliation: true,
        escrow: true,
        compliance: true,
        aml: true,
        notifications: {
          email: true,
          sms: true,
          dashboard: true,
        },
      },
      performance: {
        servicingShards: 4, // More shards for production
        useConsolidatedQueues: false, // Separate queues for better monitoring
        usePriorityQueues: true,
      },
    };
  }

  // Development/staging - minimal configuration
  return {
    features: {
      servicing: true,
      settlement: false,
      reconciliation: false,
      escrow: true,
      compliance: false,
      aml: false,
      notifications: {
        email: true,
        sms: false,
        dashboard: true,
      },
    },
    performance: {
      servicingShards: 2,
      useConsolidatedQueues: true,
      usePriorityQueues: true,
    },
  };
}

// Create and export the default topology manager instance
export const topologyManager = createOptimizedTopology(getEnvironmentConfig());