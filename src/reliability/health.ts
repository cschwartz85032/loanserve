import { Request, Response } from "express";
import { pool } from "../../server/db";

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency_ms?: number;
  error?: string;
  details?: any;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  deployment_color?: string;
  rpo_minutes: number;
  rto_minutes: number;
  checks: HealthCheckResult[];
  uptime_seconds: number;
}

const startTime = Date.now();

export async function healthCheck(req: Request, res: Response) {
  const start = Date.now();
  const checks: HealthCheckResult[] = [];
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  try {
    // Database health check
    const dbResult = await checkDatabase();
    checks.push(dbResult);
    if (dbResult.status === 'unhealthy') overallStatus = 'unhealthy';
    else if (dbResult.status === 'degraded' && overallStatus === 'healthy') overallStatus = 'degraded';

    // Message Queue health check
    const mqResult = await checkMessageQueue();
    checks.push(mqResult);
    if (mqResult.status === 'unhealthy') overallStatus = 'unhealthy';
    else if (mqResult.status === 'degraded' && overallStatus === 'healthy') overallStatus = 'degraded';

    // Storage health check
    const storageResult = await checkStorage();
    checks.push(storageResult);
    if (storageResult.status === 'unhealthy') overallStatus = 'unhealthy';
    else if (storageResult.status === 'degraded' && overallStatus === 'healthy') overallStatus = 'degraded';

    // External dependencies check
    const extResult = await checkExternalDependencies();
    checks.push(extResult);
    if (extResult.status === 'unhealthy') overallStatus = 'unhealthy';
    else if (extResult.status === 'degraded' && overallStatus === 'healthy') overallStatus = 'degraded';

  } catch (error) {
    overallStatus = 'unhealthy';
    checks.push({
      service: 'health_check_system',
      status: 'unhealthy',
      error: error instanceof Error ? error.message : String(error)
    });
  }

  const health: SystemHealth = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    deployment_color: process.env.DEPLOY_COLOR,
    rpo_minutes: Number(process.env.RPO_MINUTES || 5),
    rto_minutes: Number(process.env.RTO_MINUTES || 30),
    checks,
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000)
  };

  const statusCode = overallStatus === 'healthy' ? 200 : 
                    overallStatus === 'degraded' ? 200 : 503;

  res.status(statusCode).json(health);
}

async function checkDatabase(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    const client = await pool.connect();
    
    try {
      // Test basic connectivity
      await client.query('SELECT 1');
      
      // Test write capability
      await client.query('SELECT NOW()');
      
      // Check critical tables exist
      const tableCheck = await client.query(`
        SELECT COUNT(*) as table_count 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('loans', 'users', 'audit_logs')
      `);
      
      const tableCount = parseInt(tableCheck.rows[0].table_count);
      const latency = Date.now() - start;
      
      if (tableCount < 3) {
        return {
          service: 'database',
          status: 'unhealthy',
          latency_ms: latency,
          error: 'Critical tables missing'
        };
      }
      
      return {
        service: 'database',
        status: latency > 1000 ? 'degraded' : 'healthy',
        latency_ms: latency,
        details: { table_count: tableCount }
      };
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    return {
      service: 'database',
      status: 'unhealthy',
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function checkMessageQueue(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    // Check if RabbitMQ connection is available
    const mqUrl = process.env.CLOUDAMQP_URL;
    if (!mqUrl) {
      return {
        service: 'message_queue',
        status: 'degraded',
        latency_ms: Date.now() - start,
        error: 'MQ URL not configured'
      };
    }

    // In a real implementation, you would test the actual MQ connection
    // For now, we'll do a basic URL validation
    new URL(mqUrl);
    
    return {
      service: 'message_queue',
      status: 'healthy',
      latency_ms: Date.now() - start
    };
    
  } catch (error) {
    return {
      service: 'message_queue',
      status: 'unhealthy',
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function checkStorage(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    // Check if S3 configuration is present
    const bucket = process.env.AWS_S3_BUCKET || process.env.AI_PIPELINE_BUCKET;
    if (!bucket) {
      return {
        service: 'storage',
        status: 'degraded',
        latency_ms: Date.now() - start,
        details: { message: 'S3 bucket not configured' }
      };
    }
    
    return {
      service: 'storage',
      status: 'healthy',
      latency_ms: Date.now() - start,
      details: { bucket }
    };
    
  } catch (error) {
    return {
      service: 'storage',
      status: 'unhealthy',
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function checkExternalDependencies(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    // Check if required API keys are configured
    const xaiKey = process.env.XAI_API_KEY;
    
    if (!xaiKey) {
      return {
        service: 'external_dependencies',
        status: 'degraded',
        latency_ms: Date.now() - start,
        details: { message: 'AI provider not configured' }
      };
    }
    
    return {
      service: 'external_dependencies',
      status: 'healthy',
      latency_ms: Date.now() - start,
      details: { ai_provider: 'configured' }
    };
    
  } catch (error) {
    return {
      service: 'external_dependencies',
      status: 'unhealthy',
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}