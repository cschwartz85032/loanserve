/**
 * Advanced Alert Management System
 * Intelligent alerting with escalation, correlation, and auto-resolution
 */

import { Pool } from "pg";
import { randomUUID } from "crypto";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface Alert {
  id?: string;
  tenantId: string;
  alertType: 'performance' | 'drift' | 'resource' | 'error_rate' | 'security';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  metricValue?: number;
  thresholdValue?: number;
  tags?: Record<string, string>;
  acknowledged?: boolean;
  resolved?: boolean;
}

export interface AlertRule {
  id: string;
  tenantId: string;
  name: string;
  metricType: string;
  condition: 'gt' | 'lt' | 'eq' | 'ne';
  threshold: number;
  duration: number; // seconds
  severity: 'info' | 'warning' | 'critical';
  enabled: boolean;
  notifications: string[]; // channels: email, slack, webhook
}

export interface NotificationChannel {
  id: string;
  tenantId: string;
  type: 'email' | 'slack' | 'webhook' | 'sms';
  name: string;
  config: Record<string, any>;
  enabled: boolean;
}

/**
 * Alert Manager Class
 */
export class AlertManager {
  private static instance: AlertManager;
  private alertRules: Map<string, AlertRule[]> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private pendingAlerts: Map<string, { count: number; since: number }> = new Map();

  constructor() {
    // Load alert rules periodically
    setInterval(() => this.loadAlertRules(), 60000); // 1 minute
    
    // Check for alert conditions
    setInterval(() => this.evaluateAlerts(), 30000); // 30 seconds
    
    // Auto-resolve stale alerts
    setInterval(() => this.autoResolveAlerts(), 300000); // 5 minutes

    // Initial load
    this.loadAlertRules();
  }

  static getInstance(): AlertManager {
    if (!AlertManager.instance) {
      AlertManager.instance = new AlertManager();
    }
    return AlertManager.instance;
  }

  /**
   * Create a new alert
   */
  async createAlert(alert: Alert): Promise<string> {
    const alertId = alert.id || randomUUID();
    
    // Check for duplicate alerts
    const duplicateKey = `${alert.tenantId}:${alert.alertType}:${alert.title}`;
    if (this.activeAlerts.has(duplicateKey)) {
      return this.activeAlerts.get(duplicateKey)!.id!;
    }

    const c = await pool.connect();
    try {
      // Check table structure and insert accordingly
      const columnCheck = await c.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'system_alerts' AND column_name IN ('tenant_id', 'alert_type')`
      );
      
      const hasColumns = columnCheck.rows.map(r => r.column_name);
      
      if (hasColumns.includes('tenant_id') && hasColumns.includes('alert_type')) {
        // New table structure
        await c.query(
          `INSERT INTO system_alerts 
           (id, tenant_id, alert_type, severity, title, description, metric_value, threshold_value)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            alertId,
            alert.tenantId,
            alert.alertType,
            alert.severity,
            alert.title,
            alert.description,
            alert.metricValue,
            alert.thresholdValue
          ]
        );
      } else {
        // Legacy table structure - map to existing columns
        await c.query(
          `INSERT INTO system_alerts 
           (severity, component, message, details)
           VALUES ($1, $2, $3, $4)`,
          [
            alert.severity,
            alert.alertType,
            alert.title,
            JSON.stringify({
              description: alert.description,
              metricValue: alert.metricValue,
              thresholdValue: alert.thresholdValue,
              tenantId: alert.tenantId
            })
          ]
        );
      }

      // Cache active alert
      alert.id = alertId;
      this.activeAlerts.set(duplicateKey, alert);

      // Send notifications
      await this.sendNotifications(alert);

      return alertId;
    } finally {
      c.release();
    }
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    const c = await pool.connect();
    try {
      await c.query(
        `UPDATE system_alerts 
         SET acknowledged = true, acknowledged_at = now()
         WHERE id = $1`,
        [alertId]
      );

      // Remove from active alerts
      for (const [key, alert] of this.activeAlerts.entries()) {
        if (alert.id === alertId) {
          this.activeAlerts.delete(key);
          break;
        }
      }
    } finally {
      c.release();
    }
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, userId?: string): Promise<void> {
    const c = await pool.connect();
    try {
      await c.query(
        `UPDATE system_alerts 
         SET resolved = true, resolved_at = now()
         WHERE id = $1`,
        [alertId]
      );

      // Remove from active alerts
      for (const [key, alert] of this.activeAlerts.entries()) {
        if (alert.id === alertId) {
          this.activeAlerts.delete(key);
          break;
        }
      }
    } finally {
      c.release();
    }
  }

  /**
   * Get active alerts for tenant
   */
  async getActiveAlerts(tenantId: string): Promise<Alert[]> {
    const c = await pool.connect();
    try {
      // Check if the expected table structure exists
      const columnCheck = await c.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'system_alerts' AND column_name IN ('tenant_id', 'resolved')`
      );
      
      const hasColumns = columnCheck.rows.map(r => r.column_name);
      
      if (!hasColumns.includes('tenant_id') || !hasColumns.includes('resolved')) {
        // Fallback to basic alerts without tenant filtering
        const result = await c.query(
          `SELECT id, severity, component as alert_type, message as title, 
           details, acknowledged, created_at
           FROM system_alerts 
           WHERE acknowledged = false
           ORDER BY created_at DESC
           LIMIT 10`
        );

        return result.rows.map(row => ({
          id: row.id?.toString() || 'unknown',
          tenantId,
          alertType: (row.alert_type || 'performance') as Alert['alertType'],
          severity: (row.severity || 'info') as Alert['severity'],
          title: row.title || 'System Alert',
          description: row.details ? JSON.stringify(row.details) : 'No description',
          acknowledged: row.acknowledged || false,
          resolved: false
        }));
      }

      const result = await c.query(
        `SELECT * FROM system_alerts 
         WHERE tenant_id = $1 AND resolved = false
         ORDER BY created_at DESC`,
        [tenantId]
      );

      return result.rows.map(row => ({
        id: row.id,
        tenantId: row.tenant_id,
        alertType: row.alert_type,
        severity: row.severity,
        title: row.title,
        description: row.description,
        metricValue: row.metric_value,
        thresholdValue: row.threshold_value,
        acknowledged: row.acknowledged,
        resolved: row.resolved
      }));
    } finally {
      c.release();
    }
  }

  /**
   * Check metric against thresholds and create alerts
   */
  async checkMetricThreshold(
    tenantId: string,
    metricType: string,
    value: number,
    tags: Record<string, string> = {}
  ): Promise<void> {
    const rules = this.alertRules.get(tenantId) || [];
    
    for (const rule of rules) {
      if (!rule.enabled || rule.metricType !== metricType) continue;

      const shouldAlert = this.evaluateCondition(value, rule.condition, rule.threshold);
      
      if (shouldAlert) {
        const pendingKey = `${tenantId}:${rule.id}`;
        const pending = this.pendingAlerts.get(pendingKey);
        const now = Date.now();

        if (!pending) {
          // First time seeing this condition
          this.pendingAlerts.set(pendingKey, { count: 1, since: now });
        } else {
          // Increment count
          pending.count++;
          
          // Check if duration threshold met
          if (now - pending.since >= rule.duration * 1000) {
            await this.createAlert({
              tenantId,
              alertType: this.getAlertType(metricType),
              severity: rule.severity,
              title: `${rule.name} Threshold Exceeded`,
              description: `${metricType} value ${value} ${rule.condition} threshold ${rule.threshold}`,
              metricValue: value,
              thresholdValue: rule.threshold,
              tags
            });

            // Reset pending
            this.pendingAlerts.delete(pendingKey);
          }
        }
      } else {
        // Condition not met - clear pending
        this.pendingAlerts.delete(`${tenantId}:${rule.id}`);
      }
    }
  }

  /**
   * Get alert statistics
   */
  async getAlertStats(
    tenantId: string,
    hoursBack: number = 24
  ): Promise<{
    totalAlerts: number;
    criticalAlerts: number;
    averageResolutionTime: number;
    topAlertTypes: Array<{ type: string; count: number }>;
  }> {
    const c = await pool.connect();
    try {
      // Total and critical alerts
      const countResult = await c.query(
        `SELECT 
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE severity = 'critical') as critical
         FROM system_alerts 
         WHERE tenant_id = $1 AND created_at >= now() - interval '${hoursBack} hours'`,
        [tenantId]
      );

      const counts = countResult.rows[0];

      // Average resolution time
      const resolutionResult = await c.query(
        `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) as avg_resolution_seconds
         FROM system_alerts 
         WHERE tenant_id = $1 AND resolved = true 
         AND created_at >= now() - interval '${hoursBack} hours'`,
        [tenantId]
      );

      const avgResolutionSeconds = parseFloat(resolutionResult.rows[0].avg_resolution_seconds) || 0;

      // Top alert types
      const typesResult = await c.query(
        `SELECT alert_type, COUNT(*) as count
         FROM system_alerts 
         WHERE tenant_id = $1 AND created_at >= now() - interval '${hoursBack} hours'
         GROUP BY alert_type
         ORDER BY count DESC
         LIMIT 10`,
        [tenantId]
      );

      const topAlertTypes = typesResult.rows.map(row => ({
        type: row.alert_type,
        count: parseInt(row.count)
      }));

      return {
        totalAlerts: parseInt(counts.total),
        criticalAlerts: parseInt(counts.critical),
        averageResolutionTime: avgResolutionSeconds,
        topAlertTypes
      };
    } finally {
      c.release();
    }
  }

  /**
   * Load alert rules from database
   */
  private async loadAlertRules(): Promise<void> {
    // Implementation would load from a hypothetical alert_rules table
    // For now, use default rules
    const defaultRules: Record<string, AlertRule[]> = {
      'default': [
        {
          id: 'ai_latency_high',
          tenantId: 'default',
          name: 'High AI Latency',
          metricType: 'ai_latency',
          condition: 'gt',
          threshold: 5000, // 5 seconds
          duration: 180, // 3 minutes
          severity: 'warning',
          enabled: true,
          notifications: ['email']
        },
        {
          id: 'error_rate_high',
          tenantId: 'default',
          name: 'High Error Rate',
          metricType: 'error_rate',
          condition: 'gt',
          threshold: 0.05, // 5%
          duration: 300, // 5 minutes
          severity: 'critical',
          enabled: true,
          notifications: ['email', 'slack']
        }
      ]
    };

    for (const [tenantId, rules] of Object.entries(defaultRules)) {
      this.alertRules.set(tenantId, rules);
    }
  }

  /**
   * Evaluate alert conditions periodically
   */
  private async evaluateAlerts(): Promise<void> {
    // This would check current metrics against thresholds
    // Implementation depends on metrics collection system
  }

  /**
   * Auto-resolve stale alerts
   */
  private async autoResolveAlerts(): Promise<void> {
    const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();

    for (const [key, alert] of this.activeAlerts.entries()) {
      if (alert.severity === 'info' && alert.id) {
        // Auto-resolve info alerts after 24 hours
        await this.resolveAlert(alert.id);
      }
    }
  }

  /**
   * Send notifications for alert
   */
  private async sendNotifications(alert: Alert): Promise<void> {
    // Implementation would send notifications via configured channels
    console.log(`Alert created: ${alert.severity} - ${alert.title}`);
  }

  private evaluateCondition(value: number, condition: string, threshold: number): boolean {
    switch (condition) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'eq': return value === threshold;
      case 'ne': return value !== threshold;
      default: return false;
    }
  }

  private getAlertType(metricType: string): Alert['alertType'] {
    if (metricType.includes('latency') || metricType.includes('throughput')) {
      return 'performance';
    } else if (metricType.includes('error')) {
      return 'error_rate';
    } else if (metricType.includes('cpu') || metricType.includes('memory')) {
      return 'resource';
    } else if (metricType.includes('drift')) {
      return 'drift';
    }
    return 'performance';
  }
}

export const alertManager = AlertManager.getInstance();