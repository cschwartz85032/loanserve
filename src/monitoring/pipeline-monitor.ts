/**
 * Pipeline Monitor - Real-time monitoring for AI servicing pipeline
 * Implements comprehensive observability and alerting
 */

import { register, Counter, Histogram, Gauge } from 'prom-client';
import { phase10AuditService } from '../../server/services/phase10-audit-service';
import pino from 'pino';

const logger = pino({ name: 'pipeline-monitor' });

export interface PipelineMetrics {
  documentsProcessed: Counter<string>;
  processingDuration: Histogram<string>;
  extractionAccuracy: Gauge<string>;
  validationErrors: Counter<string>;
  authorityDecisions: Counter<string>;
  queueDepth: Gauge<string>;
  workerHealth: Gauge<string>;
  confidenceDistribution: Histogram<string>;
}

export interface Alert {
  id: string;
  type: 'error' | 'warning' | 'info';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  metadata: Record<string, any>;
  timestamp: Date;
  resolved?: Date;
  resolvedBy?: string;
}

export class PipelineMonitor {
  private metrics: PipelineMetrics;
  private alerts = new Map<string, Alert>();
  private thresholds: Record<string, number>;

  constructor() {
    this.metrics = this.initializeMetrics();
    this.thresholds = this.initializeThresholds();
    this.startPeriodicReporting();
  }

  /**
   * Initialize Prometheus metrics
   */
  private initializeMetrics(): PipelineMetrics {
    return {
      documentsProcessed: new Counter({
        name: 'ai_pipeline_documents_processed_total',
        help: 'Total number of documents processed',
        labelNames: ['document_type', 'status', 'tenant_id']
      }),

      processingDuration: new Histogram({
        name: 'ai_pipeline_processing_duration_seconds',
        help: 'Document processing duration in seconds',
        labelNames: ['document_type', 'worker_type'],
        buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300, 600]
      }),

      extractionAccuracy: new Gauge({
        name: 'ai_pipeline_extraction_accuracy',
        help: 'Average extraction confidence score',
        labelNames: ['field_type', 'extractor_version']
      }),

      validationErrors: new Counter({
        name: 'ai_pipeline_validation_errors_total',
        help: 'Total validation errors by type',
        labelNames: ['error_type', 'severity', 'field_name']
      }),

      authorityDecisions: new Counter({
        name: 'ai_pipeline_authority_decisions_total',
        help: 'Authority matrix decisions',
        labelNames: ['decision_type', 'winner_source', 'field_name']
      }),

      queueDepth: new Gauge({
        name: 'ai_pipeline_queue_depth',
        help: 'Current queue depth by queue type',
        labelNames: ['queue_type', 'priority']
      }),

      workerHealth: new Gauge({
        name: 'ai_pipeline_worker_health',
        help: 'Worker health status (1=healthy, 0=unhealthy)',
        labelNames: ['worker_name', 'worker_type']
      }),

      confidenceDistribution: new Histogram({
        name: 'ai_pipeline_confidence_distribution',
        help: 'Distribution of confidence scores',
        labelNames: ['source_type'],
        buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
      })
    };
  }

  /**
   * Initialize monitoring thresholds
   */
  private initializeThresholds(): Record<string, number> {
    return {
      maxProcessingTime: 300, // 5 minutes
      minConfidenceThreshold: 0.6,
      maxValidationErrorRate: 0.1, // 10%
      maxQueueDepth: 1000,
      minWorkerHealthPercent: 0.8 // 80%
    };
  }

  /**
   * Record document processing metrics
   */
  recordDocumentProcessed(
    documentType: string,
    status: 'success' | 'failed' | 'retrying',
    processingTimeMs: number,
    tenantId: string = 'default'
  ): void {
    this.metrics.documentsProcessed
      .labels(documentType, status, tenantId)
      .inc();

    this.metrics.processingDuration
      .labels(documentType, 'intake-worker')
      .observe(processingTimeMs / 1000);

    // Check for processing time alerts
    if (processingTimeMs > this.thresholds.maxProcessingTime * 1000) {
      this.createAlert({
        type: 'warning',
        severity: 'medium',
        title: 'Slow Document Processing',
        message: `Document processing took ${processingTimeMs}ms, exceeding threshold of ${this.thresholds.maxProcessingTime * 1000}ms`,
        metadata: {
          documentType,
          processingTimeMs,
          threshold: this.thresholds.maxProcessingTime * 1000
        }
      });
    }
  }

  /**
   * Record extraction accuracy metrics
   */
  recordExtractionAccuracy(
    fieldType: string,
    confidence: number,
    extractorVersion: string,
    sourceType: string
  ): void {
    this.metrics.extractionAccuracy
      .labels(fieldType, extractorVersion)
      .set(confidence);

    this.metrics.confidenceDistribution
      .labels(sourceType)
      .observe(confidence);

    // Check confidence threshold alerts
    if (confidence < this.thresholds.minConfidenceThreshold) {
      this.createAlert({
        type: 'warning',
        severity: 'low',
        title: 'Low Extraction Confidence',
        message: `Field ${fieldType} extracted with confidence ${confidence}, below threshold ${this.thresholds.minConfidenceThreshold}`,
        metadata: {
          fieldType,
          confidence,
          extractorVersion,
          threshold: this.thresholds.minConfidenceThreshold
        }
      });
    }
  }

  /**
   * Record validation error metrics
   */
  recordValidationError(
    errorType: string,
    severity: 'error' | 'warning' | 'info',
    fieldName: string
  ): void {
    this.metrics.validationErrors
      .labels(errorType, severity, fieldName)
      .inc();

    if (severity === 'error') {
      this.createAlert({
        type: 'error',
        severity: 'high',
        title: 'Validation Error',
        message: `Validation error in field ${fieldName}: ${errorType}`,
        metadata: {
          errorType,
          fieldName,
          severity
        }
      });
    }
  }

  /**
   * Record authority matrix decisions
   */
  recordAuthorityDecision(
    decisionType: string,
    winnerSource: string,
    fieldName: string,
    conflictCount: number
  ): void {
    this.metrics.authorityDecisions
      .labels(decisionType, winnerSource, fieldName)
      .inc();

    if (conflictCount > 1) {
      this.createAlert({
        type: 'info',
        severity: 'low',
        title: 'Data Conflict Resolved',
        message: `Authority matrix resolved conflict for ${fieldName} with ${conflictCount} sources, winner: ${winnerSource}`,
        metadata: {
          fieldName,
          winnerSource,
          conflictCount,
          decisionType
        }
      });
    }
  }

  /**
   * Update queue depth metrics
   */
  updateQueueDepth(queueType: string, depth: number, priority = 'normal'): void {
    this.metrics.queueDepth
      .labels(queueType, priority)
      .set(depth);

    if (depth > this.thresholds.maxQueueDepth) {
      this.createAlert({
        type: 'warning',
        severity: 'medium',
        title: 'High Queue Depth',
        message: `Queue ${queueType} has ${depth} items, exceeding threshold of ${this.thresholds.maxQueueDepth}`,
        metadata: {
          queueType,
          depth,
          threshold: this.thresholds.maxQueueDepth
        }
      });
    }
  }

  /**
   * Update worker health metrics
   */
  updateWorkerHealth(workerName: string, workerType: string, isHealthy: boolean): void {
    this.metrics.workerHealth
      .labels(workerName, workerType)
      .set(isHealthy ? 1 : 0);

    if (!isHealthy) {
      this.createAlert({
        type: 'error',
        severity: 'critical',
        title: 'Worker Unhealthy',
        message: `Worker ${workerName} of type ${workerType} is unhealthy`,
        metadata: {
          workerName,
          workerType
        }
      });
    }
  }

  /**
   * Create and track alert
   */
  private createAlert(alertData: Omit<Alert, 'id' | 'timestamp'>): string {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...alertData
    };

    this.alerts.set(alert.id, alert);

    // Log alert
    logger[alert.type]({
      alertId: alert.id,
      alertType: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      metadata: alert.metadata
    }, `Pipeline Alert: ${alert.title}`);

    // Send to audit log
    this.logAlertToAudit(alert);

    return alert.id;
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string, resolvedBy = 'system'): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.resolved = new Date();
    alert.resolvedBy = resolvedBy;

    logger.info({
      alertId,
      resolvedBy,
      duration: alert.resolved.getTime() - alert.timestamp.getTime()
    }, `Alert resolved: ${alert.title}`);

    return true;
  }

  /**
   * Get current alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values())
      .filter(alert => !alert.resolved)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get pipeline health summary
   */
  getHealthSummary(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeAlerts: number;
    criticalAlerts: number;
    metrics: {
      documentsProcessedLast24h: number;
      averageProcessingTime: number;
      averageConfidence: number;
      errorRate: number;
    };
  } {
    const activeAlerts = this.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical').length;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (criticalAlerts > 0) {
      status = 'unhealthy';
    } else if (activeAlerts.length > 5) {
      status = 'degraded';
    }

    return {
      status,
      activeAlerts: activeAlerts.length,
      criticalAlerts,
      metrics: {
        documentsProcessedLast24h: 0, // Would query from metrics
        averageProcessingTime: 0,     // Would calculate from histogram
        averageConfidence: 0,         // Would calculate from gauge
        errorRate: 0                  // Would calculate from counters
      }
    };
  }

  /**
   * Start periodic reporting
   */
  private startPeriodicReporting(): void {
    setInterval(() => {
      this.generatePeriodicReport();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Generate periodic health report
   */
  private generatePeriodicReport(): void {
    const healthSummary = this.getHealthSummary();
    
    logger.info({
      health: healthSummary,
      timestamp: new Date().toISOString()
    }, 'Pipeline Health Report');

    // Auto-resolve old alerts (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [alertId, alert] of this.alerts.entries()) {
      if (!alert.resolved && alert.timestamp < oneHourAgo && alert.severity === 'low') {
        this.resolveAlert(alertId, 'auto-cleanup');
      }
    }
  }

  /**
   * Log alert to audit system
   */
  private async logAlertToAudit(alert: Alert): Promise<void> {
    try {
      await phase10AuditService.logEvent({
        tenantId: '00000000-0000-0000-0000-000000000001',
        eventType: `AI_PIPELINE.ALERT.${alert.type.toUpperCase()}`,
        actorType: 'system',
        resourceUrn: `urn:alert:${alert.id}`,
        payload: {
          alertId: alert.id,
          alertType: alert.type,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          metadata: alert.metadata
        }
      });
    } catch (error) {
      logger.error({ error, alert }, 'Failed to log alert to audit system');
    }
  }

  /**
   * Export metrics for external monitoring systems
   */
  async exportMetrics(): Promise<string> {
    return register.metrics();
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void {
    register.clear();
    this.metrics = this.initializeMetrics();
    this.alerts.clear();
  }
}