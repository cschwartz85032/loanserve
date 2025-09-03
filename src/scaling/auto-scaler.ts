/**
 * Auto-Scaling and Resource Management
 * Intelligent scaling based on performance metrics and load patterns
 */

import { Pool } from "pg";
import { aiPerformanceMonitor } from "../monitoring/ai-performance";
import { alertManager } from "../monitoring/alert-manager";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface ScalingConfig {
  minInstances: number;
  maxInstances: number;
  targetCpuPercent: number;
  targetLatencyMs: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  cooldownPeriodMs: number;
}

export interface ResourceMetric {
  tenantId: string;
  resourceType: 'cpu' | 'memory' | 'queue_depth' | 'connections';
  value: number;
  unit: string;
  thresholdWarning?: number;
  thresholdCritical?: number;
}

/**
 * Auto-Scaler Class
 */
export class AutoScaler {
  private static instance: AutoScaler;
  private scalingConfigs: Map<string, ScalingConfig> = new Map();
  private lastScaleAction: Map<string, number> = new Map();
  private currentInstances: Map<string, number> = new Map();

  constructor() {
    // Monitor and scale periodically
    setInterval(() => this.evaluateScaling(), 60000); // 1 minute
    
    // Collect resource metrics
    setInterval(() => this.collectResourceMetrics(), 30000); // 30 seconds

    // Initialize default configs
    this.initializeDefaultConfigs();
  }

  static getInstance(): AutoScaler {
    if (!AutoScaler.instance) {
      AutoScaler.instance = new AutoScaler();
    }
    return AutoScaler.instance;
  }

  /**
   * Record resource metric
   */
  async recordResourceMetric(metric: ResourceMetric): Promise<void> {
    const c = await pool.connect();
    try {
      await c.query(
        `INSERT INTO resource_metrics 
         (tenant_id, resource_type, measurement_value, measurement_unit, 
          threshold_warning, threshold_critical)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          metric.tenantId,
          metric.resourceType,
          metric.value,
          metric.unit,
          metric.thresholdWarning,
          metric.thresholdCritical
        ]
      );

      // Check thresholds and create alerts
      if (metric.thresholdCritical && metric.value >= metric.thresholdCritical) {
        await alertManager.createAlert({
          tenantId: metric.tenantId,
          alertType: 'resource',
          severity: 'critical',
          title: `Critical ${metric.resourceType} Usage`,
          description: `${metric.resourceType} usage at ${metric.value}${metric.unit}, exceeds critical threshold of ${metric.thresholdCritical}${metric.unit}`,
          metricValue: metric.value,
          thresholdValue: metric.thresholdCritical
        });
      } else if (metric.thresholdWarning && metric.value >= metric.thresholdWarning) {
        await alertManager.createAlert({
          tenantId: metric.tenantId,
          alertType: 'resource',
          severity: 'warning',
          title: `High ${metric.resourceType} Usage`,
          description: `${metric.resourceType} usage at ${metric.value}${metric.unit}, exceeds warning threshold of ${metric.thresholdWarning}${metric.unit}`,
          metricValue: metric.value,
          thresholdValue: metric.thresholdWarning
        });
      }
    } finally {
      c.release();
    }
  }

  /**
   * Get current resource utilization
   */
  async getResourceUtilization(
    tenantId: string,
    resourceType: string,
    minutesBack: number = 5
  ): Promise<{ avg: number; max: number; trend: 'up' | 'down' | 'stable' }> {
    const c = await pool.connect();
    try {
      const result = await c.query(
        `SELECT 
           AVG(measurement_value) as avg_value,
           MAX(measurement_value) as max_value,
           array_agg(measurement_value ORDER BY timestamp) as values
         FROM resource_metrics 
         WHERE tenant_id = $1 AND resource_type = $2 
         AND timestamp >= now() - interval '${minutesBack} minutes'`,
        [tenantId, resourceType]
      );

      if (!result.rowCount) {
        return { avg: 0, max: 0, trend: 'stable' };
      }

      const row = result.rows[0];
      const avg = parseFloat(row.avg_value) || 0;
      const max = parseFloat(row.max_value) || 0;
      const values = row.values || [];

      // Calculate trend
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (values.length >= 2) {
        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));
        
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        
        const difference = (secondAvg - firstAvg) / firstAvg;
        
        if (difference > 0.1) trend = 'up';
        else if (difference < -0.1) trend = 'down';
      }

      return { avg, max, trend };
    } finally {
      c.release();
    }
  }

  /**
   * Scale service instances
   */
  async scaleService(
    tenantId: string,
    serviceName: string,
    targetInstances: number
  ): Promise<{ success: boolean; currentInstances: number; message: string }> {
    const config = this.getScalingConfig(tenantId);
    const currentInstances = this.currentInstances.get(`${tenantId}:${serviceName}`) || 1;
    
    // Validate scaling bounds
    const clampedTarget = Math.max(config.minInstances, 
                          Math.min(config.maxInstances, targetInstances));
    
    if (clampedTarget === currentInstances) {
      return {
        success: true,
        currentInstances,
        message: `Already at target instances: ${currentInstances}`
      };
    }

    // Check cooldown period
    const lastScale = this.lastScaleAction.get(`${tenantId}:${serviceName}`) || 0;
    const now = Date.now();
    
    if (now - lastScale < config.cooldownPeriodMs) {
      return {
        success: false,
        currentInstances,
        message: `Scaling cooldown active. Next scaling allowed in ${Math.ceil((config.cooldownPeriodMs - (now - lastScale)) / 1000)}s`
      };
    }

    // Simulate scaling (in production this would call container orchestrator)
    this.currentInstances.set(`${tenantId}:${serviceName}`, clampedTarget);
    this.lastScaleAction.set(`${tenantId}:${serviceName}`, now);

    // Create alert for scaling action
    await alertManager.createAlert({
      tenantId,
      alertType: 'resource',
      severity: 'info',
      title: `Service Scaled`,
      description: `${serviceName} scaled from ${currentInstances} to ${clampedTarget} instances`,
      metricValue: clampedTarget,
      thresholdValue: currentInstances
    });

    console.log(`[AutoScaler] Scaled ${serviceName} from ${currentInstances} to ${clampedTarget} instances`);

    return {
      success: true,
      currentInstances: clampedTarget,
      message: `Scaled from ${currentInstances} to ${clampedTarget} instances`
    };
  }

  /**
   * Get scaling recommendations
   */
  async getScalingRecommendations(tenantId: string): Promise<Array<{
    service: string;
    currentInstances: number;
    recommendedInstances: number;
    reason: string;
    confidence: number;
  }>> {
    const recommendations = [];
    const services = ['ai-processor', 'document-analyzer', 'vendor-connector'];

    for (const service of services) {
      const cpuUtil = await this.getResourceUtilization(tenantId, 'cpu');
      const memoryUtil = await this.getResourceUtilization(tenantId, 'memory');
      const queueDepth = await this.getResourceUtilization(tenantId, 'queue_depth');

      const currentInstances = this.currentInstances.get(`${tenantId}:${service}`) || 1;
      const config = this.getScalingConfig(tenantId);

      let recommendedInstances = currentInstances;
      let reason = 'No scaling needed';
      let confidence = 0.5;

      // Scale up conditions
      if (cpuUtil.avg > config.targetCpuPercent && cpuUtil.trend === 'up') {
        const scaleFactor = cpuUtil.avg / config.targetCpuPercent;
        recommendedInstances = Math.ceil(currentInstances * scaleFactor);
        reason = `High CPU utilization (${cpuUtil.avg.toFixed(1)}%) with upward trend`;
        confidence = 0.8;
      } else if (queueDepth.avg > 100 && queueDepth.trend === 'up') {
        recommendedInstances = currentInstances + 1;
        reason = `Growing queue depth (${queueDepth.avg.toFixed(0)} items)`;
        confidence = 0.7;
      }
      // Scale down conditions
      else if (cpuUtil.avg < config.scaleDownThreshold && 
               memoryUtil.avg < config.scaleDownThreshold &&
               queueDepth.avg < 10) {
        recommendedInstances = Math.max(config.minInstances, currentInstances - 1);
        reason = `Low resource utilization (CPU: ${cpuUtil.avg.toFixed(1)}%, Memory: ${memoryUtil.avg.toFixed(1)}%)`;
        confidence = 0.6;
      }

      if (recommendedInstances !== currentInstances) {
        recommendations.push({
          service,
          currentInstances,
          recommendedInstances,
          reason,
          confidence
        });
      }
    }

    return recommendations;
  }

  /**
   * Evaluate and perform auto-scaling
   */
  private async evaluateScaling(): Promise<void> {
    // Get all tenants with active monitoring
    const c = await pool.connect();
    try {
      const result = await c.query(
        `SELECT DISTINCT tenant_id FROM resource_metrics 
         WHERE timestamp >= now() - interval '10 minutes'`
      );

      for (const row of result.rows) {
        const tenantId = row.tenant_id;
        const recommendations = await this.getScalingRecommendations(tenantId);

        for (const rec of recommendations) {
          if (rec.confidence > 0.7 && 
              process.env.AUTO_SCALING_ENABLED === 'true') {
            await this.scaleService(tenantId, rec.service, rec.recommendedInstances);
          }
        }
      }
    } finally {
      c.release();
    }
  }

  /**
   * Collect system resource metrics
   */
  private async collectResourceMetrics(): Promise<void> {
    const tenantId = 'system'; // System-wide metrics

    try {
      // Simulate resource collection (in production, use actual system metrics)
      const metrics = [
        {
          tenantId,
          resourceType: 'cpu' as const,
          value: this.getRandomMetric(20, 80),
          unit: 'percent',
          thresholdWarning: 70,
          thresholdCritical: 90
        },
        {
          tenantId,
          resourceType: 'memory' as const,
          value: this.getRandomMetric(30, 85),
          unit: 'percent',
          thresholdWarning: 80,
          thresholdCritical: 95
        },
        {
          tenantId,
          resourceType: 'queue_depth' as const,
          value: this.getRandomMetric(0, 150),
          unit: 'count',
          thresholdWarning: 100,
          thresholdCritical: 200
        },
        {
          tenantId,
          resourceType: 'connections' as const,
          value: this.getRandomMetric(10, 90),
          unit: 'count',
          thresholdWarning: 80,
          thresholdCritical: 100
        }
      ];

      for (const metric of metrics) {
        await this.recordResourceMetric(metric);
      }
    } catch (error) {
      console.error('Failed to collect resource metrics:', error);
    }
  }

  private initializeDefaultConfigs(): void {
    const defaultConfig: ScalingConfig = {
      minInstances: 1,
      maxInstances: 10,
      targetCpuPercent: 60,
      targetLatencyMs: 2000,
      scaleUpThreshold: 70,
      scaleDownThreshold: 30,
      cooldownPeriodMs: 300000 // 5 minutes
    };

    this.scalingConfigs.set('default', defaultConfig);
  }

  private getScalingConfig(tenantId: string): ScalingConfig {
    return this.scalingConfigs.get(tenantId) || this.scalingConfigs.get('default')!;
  }

  private getRandomMetric(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min) + min);
  }
}

export const autoScaler = AutoScaler.getInstance();