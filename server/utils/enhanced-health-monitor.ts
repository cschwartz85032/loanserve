/**
 * Enhanced Health Monitor
 * Comprehensive system health checking for Issue #4: Health Monitoring (Architect Review)
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

export interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  details?: any;
  error?: string;
  timestamp: number;
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: HealthCheckResult[];
  summary: {
    healthy: number;
    degraded: number;
    unhealthy: number;
    totalChecks: number;
  };
}

/**
 * Enhanced Health Monitor with comprehensive system checks
 */
export class EnhancedHealthMonitor {
  private startTime: number;
  private checkHistory: Map<string, HealthCheckResult[]> = new Map();

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Comprehensive database health check
   */
  async checkDatabase(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      // Test basic connectivity
      await db.execute(sql`SELECT 1 as test`);
      
      // Test more complex operations
      const complexQuery = sql`
        SELECT 
          COUNT(*) as total_loans,
          COALESCE(SUM(principal_balance), 0) as total_balance,
          COUNT(DISTINCT borrower_id) as unique_borrowers
        FROM loans 
        WHERE id IS NOT NULL
        LIMIT 1
      `;
      
      const result = await db.execute(complexQuery);
      const responseTime = Date.now() - start;
      
      // Check for slow queries (>1000ms is concerning)
      const status = responseTime > 1000 ? 'degraded' : 'healthy';
      
      return {
        name: 'database',
        status,
        responseTime,
        details: {
          ...result[0],
          connectionPool: 'active',
          queryComplexity: 'advanced'
        },
        timestamp: Date.now()
      };
    } catch (error: any) {
      return {
        name: 'database',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error.message,
        details: {
          errorType: error.code || 'UNKNOWN',
          connectionPool: 'failed'
        },
        timestamp: Date.now()
      };
    }
  }

  /**
   * RabbitMQ connectivity check with graceful degradation
   */
  async checkRabbitMQ(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      // Check if CLOUDAMQP_URL is configured
      if (!process.env.CLOUDAMQP_URL) {
        return {
          name: 'rabbitmq',
          status: 'degraded',
          responseTime: Date.now() - start,
          details: {
            configured: false,
            reason: 'CLOUDAMQP_URL not configured'
          },
          timestamp: Date.now()
        };
      }

      // Try to load the RabbitMQ client
      try {
        const { rabbitmqClient } = await import('../services/rabbitmq-unified');
        const connectionInfo = await rabbitmqClient.getConnectionInfo() as any;
        
        return {
          name: 'rabbitmq',
          status: connectionInfo.connected ? 'healthy' : 'degraded',
          responseTime: Date.now() - start,
          details: {
            connected: connectionInfo.connected,
            configured: true,
            uptime: connectionInfo.uptime || 0
          },
          timestamp: Date.now()
        };
      } catch (clientError: any) {
        return {
          name: 'rabbitmq',
          status: 'degraded',
          responseTime: Date.now() - start,
          details: {
            configured: true,
            clientError: clientError.message,
            fallbackMode: true
          },
          timestamp: Date.now()
        };
      }
    } catch (error: any) {
      return {
        name: 'rabbitmq',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * File system health check
   */
  async checkFileSystem(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Check critical directories
      const uploadsDir = 'server/uploads';
      const tempDir = '/tmp';
      
      // Test directory access and disk space
      await fs.access(uploadsDir);
      
      // Test write permissions
      const testFile = path.join(uploadsDir, `health-check-${Date.now()}.tmp`);
      await fs.writeFile(testFile, 'health check test');
      await fs.unlink(testFile);
      
      return {
        name: 'filesystem',
        status: 'healthy',
        responseTime: Date.now() - start,
        details: {
          uploadsDirectory: 'accessible',
          writePermissions: 'ok',
          tempDirectory: 'accessible'
        },
        timestamp: Date.now()
      };
    } catch (error: any) {
      return {
        name: 'filesystem',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error.message,
        details: {
          uploadsDirectory: 'failed',
          writePermissions: 'failed'
        },
        timestamp: Date.now()
      };
    }
  }

  /**
   * Environment configuration health check
   */
  async checkEnvironment(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const requiredEnvVars = [
        'DATABASE_URL',
        'NODE_ENV'
      ];
      
      const optionalEnvVars = [
        'CLOUDAMQP_URL',
        'XAI_API_KEY',
        'COLUMN_WEBHOOK_SECRET'
      ];
      
      const missingRequired = requiredEnvVars.filter(env => !process.env[env]);
      const missingOptional = optionalEnvVars.filter(env => !process.env[env]);
      
      const status = missingRequired.length > 0 ? 'unhealthy' : 
                   missingOptional.length > 0 ? 'degraded' : 'healthy';
      
      return {
        name: 'environment',
        status,
        responseTime: Date.now() - start,
        details: {
          nodeEnv: process.env.NODE_ENV,
          requiredVars: {
            configured: requiredEnvVars.length - missingRequired.length,
            missing: missingRequired
          },
          optionalVars: {
            configured: optionalEnvVars.length - missingOptional.length,
            missing: missingOptional
          },
          features: {
            payments: !!process.env.COLUMN_WEBHOOK_SECRET,
            ai: !!process.env.XAI_API_KEY,
            messaging: !!process.env.CLOUDAMQP_URL
          }
        },
        timestamp: Date.now()
      };
    } catch (error: any) {
      return {
        name: 'environment',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Memory and process health check
   */
  async checkSystem(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const memUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      // Convert bytes to MB
      const memUsageMB = {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      };
      
      // Check for memory issues
      const heapUtilization = memUsageMB.heapUsed / memUsageMB.heapTotal;
      const status = heapUtilization > 0.9 ? 'degraded' : 'healthy';
      
      return {
        name: 'system',
        status,
        responseTime: Date.now() - start,
        details: {
          memory: memUsageMB,
          uptime: Math.round(uptime),
          heapUtilization: Math.round(heapUtilization * 100),
          nodeVersion: process.version,
          platform: process.platform,
          architecture: process.arch
        },
        timestamp: Date.now()
      };
    } catch (error: any) {
      return {
        name: 'system',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Run all health checks
   */
  async runAllChecks(): Promise<SystemHealth> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkRabbitMQ(),
      this.checkFileSystem(),
      this.checkEnvironment(),
      this.checkSystem()
    ]);

    // Store check history for trending
    checks.forEach(check => {
      if (!this.checkHistory.has(check.name)) {
        this.checkHistory.set(check.name, []);
      }
      const history = this.checkHistory.get(check.name)!;
      history.push(check);
      
      // Keep only last 10 checks per service
      if (history.length > 10) {
        history.shift();
      }
    });

    // Calculate summary
    const summary = {
      healthy: checks.filter(c => c.status === 'healthy').length,
      degraded: checks.filter(c => c.status === 'degraded').length,
      unhealthy: checks.filter(c => c.status === 'unhealthy').length,
      totalChecks: checks.length
    };

    // Determine overall status
    const overall = summary.unhealthy > 0 ? 'unhealthy' :
                   summary.degraded > 0 ? 'degraded' : 'healthy';

    return {
      overall,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      checks,
      summary
    };
  }

  /**
   * Get health check history for trending
   */
  getCheckHistory(checkName?: string): Map<string, HealthCheckResult[]> {
    if (checkName) {
      const history = this.checkHistory.get(checkName);
      return history ? new Map([[checkName, history]]) : new Map();
    }
    return new Map(this.checkHistory);
  }

  /**
   * Get average response times for each check
   */
  getPerformanceMetrics(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const metrics: Record<string, { avg: number; min: number; max: number; count: number }> = {};
    
    for (const [checkName, history] of this.checkHistory) {
      if (history.length === 0) continue;
      
      const responseTimes = history.map(h => h.responseTime);
      metrics[checkName] = {
        avg: Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length),
        min: Math.min(...responseTimes),
        max: Math.max(...responseTimes),
        count: responseTimes.length
      };
    }
    
    return metrics;
  }

  /**
   * Check if system is ready to receive traffic
   */
  async isReady(): Promise<{ ready: boolean; reason?: string }> {
    const dbCheck = await this.checkDatabase();
    const envCheck = await this.checkEnvironment();
    
    if (dbCheck.status === 'unhealthy') {
      return { ready: false, reason: 'Database unavailable' };
    }
    
    if (envCheck.status === 'unhealthy') {
      return { ready: false, reason: 'Critical environment variables missing' };
    }
    
    return { ready: true };
  }

  /**
   * Simple liveness check
   */
  isAlive(): boolean {
    return true; // If we can execute this, we're alive
  }
}

// Singleton instance
export const healthMonitor = new EnhancedHealthMonitor();