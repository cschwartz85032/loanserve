/**
 * RabbitMQ Topology Configuration
 * Controls whether to use optimized or standard topology
 */

export interface TopologyConfig {
  mode: 'standard' | 'optimized';
  optimizationSettings?: {
    enableConsolidation: boolean;
    servicingShards: number;
    disabledFeatures: string[];
  };
}

/**
 * Get topology configuration from environment
 */
export function getTopologyConfig(): TopologyConfig {
  const mode = process.env.RABBITMQ_TOPOLOGY_MODE || 'standard';
  
  if (mode === 'optimized') {
    return {
      mode: 'optimized',
      optimizationSettings: {
        enableConsolidation: process.env.RABBITMQ_CONSOLIDATE_QUEUES === 'true',
        servicingShards: parseInt(process.env.RABBITMQ_SERVICING_SHARDS || '2', 10),
        disabledFeatures: (process.env.RABBITMQ_DISABLED_FEATURES || '').split(',').filter(f => f),
      },
    };
  }
  
  return { mode: 'standard' };
}

/**
 * Queue optimization recommendations based on CloudAMQP best practices
 */
export const QUEUE_OPTIMIZATION_GUIDE = {
  // Maximum recommended queues for different CloudAMQP plans
  plans: {
    'little-lemur': { maxQueues: 10, optimal: 5 },
    'tough-tiger': { maxQueues: 20, optimal: 10 },
    'big-bunny': { maxQueues: 40, optimal: 20 },
    'power-panda': { maxQueues: 60, optimal: 30 },
    'roaring-rabbit': { maxQueues: 100, optimal: 50 },
  },
  
  // Consolidation strategies
  strategies: {
    'payment-consolidation': {
      before: ['payments.validation', 'payments.classification', 'payments.rules', 'payments.posting'],
      after: ['payments.intake', 'payments.processing'],
      reduction: '50%',
    },
    'servicing-shards': {
      before: '8 shards',
      after: '2-4 shards',
      reduction: '50-75%',
    },
    'investor-priority': {
      before: ['investor.calc.p1', 'investor.calc.p5', 'investor.calc.p10'],
      after: ['investor.calculations (with x-max-priority)'],
      reduction: '66%',
    },
    'escrow-workflow': {
      before: ['escrow.validate', 'escrow.authorize', 'escrow.disburse', 'escrow.reconcile'],
      after: ['escrow.operations'],
      reduction: '75%',
    },
    'dlq-consolidation': {
      before: '15 DLQs (8 servicing + 7 category)',
      after: '3-5 DLQs (consolidated by category)',
      reduction: '66-80%',
    },
  },
  
  // Performance impact
  impacts: {
    'queue-explosion': {
      symptom: 'Slow management plugin, high CPU on metric calculations',
      threshold: '>50 queues',
      solution: 'Enable optimized topology mode',
    },
    'index-rebuilds': {
      symptom: 'Periodic freezes during queue index rebuilds',
      threshold: '>100 queues',
      solution: 'Urgent: Reduce to <50 queues',
    },
    'memory-pressure': {
      symptom: 'High memory usage, OOM errors',
      threshold: '>200 queues',
      solution: 'Critical: Immediate queue consolidation required',
    },
  },
};

/**
 * Environment variable template for optimization
 */
export const OPTIMIZATION_ENV_TEMPLATE = `
# RabbitMQ Topology Optimization Settings
# Set to 'optimized' to reduce queue count from 55 to ~25
RABBITMQ_TOPOLOGY_MODE=optimized

# Enable queue consolidation (recommended for CloudAMQP)
RABBITMQ_CONSOLIDATE_QUEUES=true

# Reduce servicing shards (2 for dev/staging, 4 for production)
RABBITMQ_SERVICING_SHARDS=2

# Disable unused features (comma-separated)
# Options: settlement,reconciliation,compliance,aml,sms
RABBITMQ_DISABLED_FEATURES=settlement,reconciliation,aml,sms

# CloudAMQP plan (for automatic optimization)
# Options: little-lemur, tough-tiger, big-bunny, power-panda, roaring-rabbit
CLOUDAMQP_PLAN=big-bunny
`;

/**
 * Get recommended configuration based on CloudAMQP plan
 */
export function getRecommendedConfig(plan: string): TopologyConfig {
  const planLimits = QUEUE_OPTIMIZATION_GUIDE.plans[plan as keyof typeof QUEUE_OPTIMIZATION_GUIDE.plans];
  
  if (!planLimits) {
    return { mode: 'standard' };
  }
  
  // If current topology (55 queues) exceeds plan limits, force optimization
  if (55 > planLimits.maxQueues) {
    return {
      mode: 'optimized',
      optimizationSettings: {
        enableConsolidation: true,
        servicingShards: 2,
        disabledFeatures: ['settlement', 'reconciliation', 'compliance', 'aml', 'sms'],
      },
    };
  }
  
  // If close to limits, recommend optimization
  if (55 > planLimits.optimal) {
    return {
      mode: 'optimized',
      optimizationSettings: {
        enableConsolidation: true,
        servicingShards: 4,
        disabledFeatures: ['settlement', 'reconciliation', 'aml'],
      },
    };
  }
  
  return { mode: 'standard' };
}