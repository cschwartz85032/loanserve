/**
 * AI Model Performance Monitoring
 * Tracks AI model performance, latency, and drift detection
 */

import { Pool } from "pg";
import { randomUUID } from "crypto";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface AIMetric {
  tenantId: string;
  modelName: string;
  modelVersion: string;
  operationType: 'extraction' | 'classification' | 'validation' | 'analysis';
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  confidenceScore?: number;
  costCents?: number;
}

export interface DriftMetric {
  tenantId: string;
  modelName: string;
  driftType: 'data' | 'concept' | 'prediction';
  driftScore: number;
  threshold: number;
  sampleSize: number;
  baselinePeriodStart: Date;
  baselinePeriodEnd: Date;
}

export interface PipelineMetric {
  tenantId: string;
  pipelineStage: 'intake' | 'extraction' | 'validation' | 'routing' | 'completion';
  operationId: string;
  documentType?: string;
  processingTimeMs: number;
  queueWaitMs: number;
  success: boolean;
  errorType?: string;
  resourceUsage?: Record<string, any>;
}

/**
 * AI Performance Monitor Class
 */
export class AIPerformanceMonitor {
  private static instance: AIPerformanceMonitor;
  private metricsBuffer: AIMetric[] = [];
  private bufferSize = 100;
  private flushInterval = 30000; // 30 seconds

  constructor() {
    // Start periodic flush
    setInterval(() => this.flushMetrics(), this.flushInterval);
  }

  static getInstance(): AIPerformanceMonitor {
    if (!AIPerformanceMonitor.instance) {
      AIPerformanceMonitor.instance = new AIPerformanceMonitor();
    }
    return AIPerformanceMonitor.instance;
  }

  /**
   * Record AI model performance metric
   */
  async recordAIMetric(metric: AIMetric): Promise<void> {
    this.metricsBuffer.push(metric);
    
    if (this.metricsBuffer.length >= this.bufferSize) {
      await this.flushMetrics();
    }
  }

  /**
   * Record pipeline performance metric
   */
  async recordPipelineMetric(metric: PipelineMetric): Promise<void> {
    const c = await pool.connect();
    try {
      await c.query(
        `INSERT INTO pipeline_performance 
         (tenant_id, pipeline_stage, operation_id, document_type, processing_time_ms, 
          queue_wait_ms, success, error_type, resource_usage)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          metric.tenantId,
          metric.pipelineStage,
          metric.operationId,
          metric.documentType,
          metric.processingTimeMs,
          metric.queueWaitMs,
          metric.success,
          metric.errorType,
          metric.resourceUsage ? JSON.stringify(metric.resourceUsage) : null
        ]
      );
    } finally {
      c.release();
    }
  }

  /**
   * Check for AI model drift
   */
  async checkModelDrift(
    tenantId: string,
    modelName: string,
    currentPredictions: number[],
    baselinePredictions: number[]
  ): Promise<{ driftDetected: boolean; driftScore: number }> {
    // Simple KS-test implementation for drift detection
    const driftScore = this.calculateKSStatistic(currentPredictions, baselinePredictions);
    const threshold = Number(process.env.AI_DRIFT_THRESHOLD) || 0.1;
    const driftDetected = driftScore > threshold;

    // Record drift metric
    await this.recordDriftMetric({
      tenantId,
      modelName,
      driftType: 'prediction',
      driftScore,
      threshold,
      sampleSize: currentPredictions.length,
      baselinePeriodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      baselinePeriodEnd: new Date()
    });

    return { driftDetected, driftScore };
  }

  /**
   * Get AI model performance statistics
   */
  async getModelPerformanceStats(
    tenantId: string,
    modelName: string,
    hoursBack: number = 24
  ): Promise<{
    avgLatency: number;
    avgConfidence: number;
    totalCost: number;
    requestCount: number;
    errorRate: number;
  }> {
    const c = await pool.connect();
    try {
      const result = await c.query(
        `SELECT 
           AVG(latency_ms) as avg_latency,
           AVG(confidence_score) as avg_confidence,
           SUM(cost_cents) as total_cost,
           COUNT(*) as request_count
         FROM ai_model_metrics 
         WHERE tenant_id = $1 AND model_name = $2 
         AND timestamp >= now() - interval '${hoursBack} hours'`,
        [tenantId, modelName]
      );

      const stats = result.rows[0];
      
      // Calculate error rate from pipeline metrics
      const errorResult = await c.query(
        `SELECT 
           COUNT(*) FILTER (WHERE success = false) as errors,
           COUNT(*) as total
         FROM pipeline_performance 
         WHERE tenant_id = $1 AND timestamp >= now() - interval '${hoursBack} hours'`,
        [tenantId]
      );

      const errorStats = errorResult.rows[0];
      const errorRate = errorStats.total > 0 ? 
        parseFloat(errorStats.errors) / parseFloat(errorStats.total) : 0;

      return {
        avgLatency: parseFloat(stats.avg_latency) || 0,
        avgConfidence: parseFloat(stats.avg_confidence) || 0,
        totalCost: parseFloat(stats.total_cost) || 0,
        requestCount: parseInt(stats.request_count) || 0,
        errorRate
      };
    } finally {
      c.release();
    }
  }

  /**
   * Get pipeline throughput metrics
   */
  async getPipelineThroughput(
    tenantId: string,
    hoursBack: number = 24
  ): Promise<{
    documentsPerHour: number;
    avgProcessingTime: number;
    avgQueueWait: number;
    successRate: number;
  }> {
    const c = await pool.connect();
    try {
      const result = await c.query(
        `SELECT 
           COUNT(*) as total_documents,
           AVG(processing_time_ms) as avg_processing_time,
           AVG(queue_wait_ms) as avg_queue_wait,
           COUNT(*) FILTER (WHERE success = true) as successful_documents
         FROM pipeline_performance 
         WHERE tenant_id = $1 AND timestamp >= now() - interval '${hoursBack} hours'`,
        [tenantId]
      );

      const stats = result.rows[0];
      const totalDocs = parseInt(stats.total_documents) || 0;
      const successfulDocs = parseInt(stats.successful_documents) || 0;

      return {
        documentsPerHour: totalDocs / hoursBack,
        avgProcessingTime: parseFloat(stats.avg_processing_time) || 0,
        avgQueueWait: parseFloat(stats.avg_queue_wait) || 0,
        successRate: totalDocs > 0 ? successfulDocs / totalDocs : 0
      };
    } finally {
      c.release();
    }
  }

  /**
   * Flush metrics buffer to database
   */
  private async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;

    const metricsToFlush = [...this.metricsBuffer];
    this.metricsBuffer = [];

    const c = await pool.connect();
    try {
      for (const metric of metricsToFlush) {
        await c.query(
          `INSERT INTO ai_model_metrics 
           (tenant_id, model_name, model_version, operation_type, input_tokens, 
            output_tokens, latency_ms, confidence_score, cost_cents)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            metric.tenantId,
            metric.modelName,
            metric.modelVersion,
            metric.operationType,
            metric.inputTokens,
            metric.outputTokens,
            metric.latencyMs,
            metric.confidenceScore,
            metric.costCents
          ]
        );
      }
    } catch (error) {
      console.error('Failed to flush AI metrics:', error);
      // Re-add metrics to buffer for retry
      this.metricsBuffer.unshift(...metricsToFlush);
    } finally {
      c.release();
    }
  }

  /**
   * Record drift metric
   */
  private async recordDriftMetric(metric: DriftMetric): Promise<void> {
    const c = await pool.connect();
    try {
      await c.query(
        `INSERT INTO ai_drift_metrics 
         (tenant_id, model_name, drift_type, drift_score, threshold_exceeded, 
          sample_size, baseline_period_start, baseline_period_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          metric.tenantId,
          metric.modelName,
          metric.driftType,
          metric.driftScore,
          metric.driftScore > metric.threshold,
          metric.sampleSize,
          metric.baselinePeriodStart,
          metric.baselinePeriodEnd
        ]
      );
    } finally {
      c.release();
    }
  }

  /**
   * Calculate Kolmogorov-Smirnov statistic for drift detection
   */
  private calculateKSStatistic(sample1: number[], sample2: number[]): number {
    const combined = [...sample1, ...sample2].sort((a, b) => a - b);
    let maxDiff = 0;

    for (const value of combined) {
      const cdf1 = sample1.filter(x => x <= value).length / sample1.length;
      const cdf2 = sample2.filter(x => x <= value).length / sample2.length;
      const diff = Math.abs(cdf1 - cdf2);
      maxDiff = Math.max(maxDiff, diff);
    }

    return maxDiff;
  }
}

// Export singleton instance
export const aiPerformanceMonitor = AIPerformanceMonitor.getInstance();