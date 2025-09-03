/**
 * Advanced Distributed Tracing for AI Pipeline
 * Comprehensive tracing with correlation IDs and performance analysis
 */

import { randomUUID } from "crypto";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Record<string, any>;
  logs: Array<{ timestamp: number; message: string; level: string }>;
  success: boolean;
  error?: string;
}

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

/**
 * Distributed Tracer Class
 */
export class DistributedTracer {
  private static instance: DistributedTracer;
  private activeSpans: Map<string, TraceSpan> = new Map();
  private spanBuffer: TraceSpan[] = [];
  private bufferSize = 100;

  constructor() {
    // Flush spans periodically
    setInterval(() => this.flushSpans(), 30000); // 30 seconds
  }

  static getInstance(): DistributedTracer {
    if (!DistributedTracer.instance) {
      DistributedTracer.instance = new DistributedTracer();
    }
    return DistributedTracer.instance;
  }

  /**
   * Start a new trace
   */
  startTrace(operationName: string, serviceName: string, tags: Record<string, any> = {}): TraceContext {
    const traceId = randomUUID();
    const spanId = randomUUID();

    const span: TraceSpan = {
      traceId,
      spanId,
      operationName,
      serviceName,
      startTime: Date.now(),
      tags: { ...tags, root: true },
      logs: [],
      success: true
    };

    this.activeSpans.set(spanId, span);

    return { traceId, spanId };
  }

  /**
   * Start a child span
   */
  startSpan(
    context: TraceContext, 
    operationName: string, 
    serviceName: string, 
    tags: Record<string, any> = {}
  ): TraceContext {
    const spanId = randomUUID();

    const span: TraceSpan = {
      traceId: context.traceId,
      spanId,
      parentSpanId: context.spanId,
      operationName,
      serviceName,
      startTime: Date.now(),
      tags,
      logs: [],
      success: true
    };

    this.activeSpans.set(spanId, span);

    return { traceId: context.traceId, spanId, parentSpanId: context.spanId };
  }

  /**
   * Finish a span
   */
  finishSpan(spanId: string, success: boolean = true, error?: string): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.success = success;
    if (error) span.error = error;

    // Move to buffer for storage
    this.spanBuffer.push(span);
    this.activeSpans.delete(spanId);

    // Flush if buffer is full
    if (this.spanBuffer.length >= this.bufferSize) {
      this.flushSpans();
    }
  }

  /**
   * Add a log entry to a span
   */
  logToSpan(spanId: string, message: string, level: string = 'info', data?: Record<string, any>): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.logs.push({
      timestamp: Date.now(),
      message,
      level
    });

    if (data) {
      span.tags = { ...span.tags, ...data };
    }
  }

  /**
   * Set tags on a span
   */
  setSpanTags(spanId: string, tags: Record<string, any>): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.tags = { ...span.tags, ...tags };
  }

  /**
   * Get trace timeline
   */
  async getTraceTimeline(traceId: string): Promise<{
    traceId: string;
    totalDuration: number;
    spans: Array<{
      spanId: string;
      parentSpanId?: string;
      operationName: string;
      serviceName: string;
      startTime: number;
      duration: number;
      success: boolean;
      tags: Record<string, any>;
    }>;
    criticalPath: string[];
  }> {
    // In production, this would query from a tracing backend like Jaeger
    // For now, simulate with current data
    const spans = this.spanBuffer.filter(s => s.traceId === traceId);
    
    if (spans.length === 0) {
      throw new Error(`Trace ${traceId} not found`);
    }

    const totalDuration = Math.max(...spans.map(s => s.endTime || s.startTime)) - 
                         Math.min(...spans.map(s => s.startTime));

    // Calculate critical path (longest path through spans)
    const criticalPath = this.calculateCriticalPath(spans);

    return {
      traceId,
      totalDuration,
      spans: spans.map(s => ({
        spanId: s.spanId,
        parentSpanId: s.parentSpanId,
        operationName: s.operationName,
        serviceName: s.serviceName,
        startTime: s.startTime,
        duration: s.duration || 0,
        success: s.success,
        tags: s.tags
      })),
      criticalPath
    };
  }

  /**
   * Get performance analytics from traces
   */
  async getPerformanceAnalytics(
    serviceName?: string,
    operationName?: string,
    hoursBack: number = 24
  ): Promise<{
    totalTraces: number;
    avgDuration: number;
    p95Duration: number;
    errorRate: number;
    throughput: number;
    slowestOperations: Array<{ operation: string; avgDuration: number }>;
  }> {
    const cutoff = Date.now() - (hoursBack * 60 * 60 * 1000);
    
    let spans = this.spanBuffer.filter(s => s.startTime >= cutoff);
    
    if (serviceName) {
      spans = spans.filter(s => s.serviceName === serviceName);
    }
    
    if (operationName) {
      spans = spans.filter(s => s.operationName === operationName);
    }

    if (spans.length === 0) {
      return {
        totalTraces: 0,
        avgDuration: 0,
        p95Duration: 0,
        errorRate: 0,
        throughput: 0,
        slowestOperations: []
      };
    }

    const durations = spans.map(s => s.duration || 0).sort((a, b) => a - b);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const p95Duration = durations[Math.floor(durations.length * 0.95)];
    
    const errorCount = spans.filter(s => !s.success).length;
    const errorRate = errorCount / spans.length;
    
    const throughput = spans.length / hoursBack; // spans per hour

    // Find slowest operations
    const operationStats = new Map<string, { total: number; count: number }>();
    
    for (const span of spans) {
      const key = `${span.serviceName}.${span.operationName}`;
      const existing = operationStats.get(key) || { total: 0, count: 0 };
      existing.total += span.duration || 0;
      existing.count += 1;
      operationStats.set(key, existing);
    }

    const slowestOperations = Array.from(operationStats.entries())
      .map(([operation, stats]) => ({
        operation,
        avgDuration: stats.total / stats.count
      }))
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);

    return {
      totalTraces: new Set(spans.map(s => s.traceId)).size,
      avgDuration,
      p95Duration,
      errorRate,
      throughput,
      slowestOperations
    };
  }

  /**
   * Middleware for Express to auto-trace requests
   */
  traceMiddleware(serviceName: string) {
    return (req: any, res: any, next: any) => {
      const traceId = req.headers['x-trace-id'] || randomUUID();
      const parentSpanId = req.headers['x-parent-span-id'];
      
      const context = this.startTrace(
        `${req.method} ${req.path}`,
        serviceName,
        {
          http: {
            method: req.method,
            url: req.url,
            userAgent: req.headers['user-agent']
          }
        }
      );

      // Add trace context to request
      req.traceContext = context;
      
      // Add headers to response
      res.setHeader('x-trace-id', context.traceId);
      res.setHeader('x-span-id', context.spanId);

      // Hook into response to finish span
      const originalSend = res.send;
      res.send = function(data: any) {
        const span = DistributedTracer.instance.activeSpans.get(context.spanId);
        if (span) {
          span.tags.http = {
            ...span.tags.http,
            statusCode: res.statusCode,
            responseSize: data ? data.length : 0
          };
        }

        DistributedTracer.instance.finishSpan(
          context.spanId, 
          res.statusCode < 400,
          res.statusCode >= 400 ? `HTTP ${res.statusCode}` : undefined
        );

        return originalSend.call(this, data);
      };

      next();
    };
  }

  /**
   * Flush spans to storage
   */
  private async flushSpans(): Promise<void> {
    if (this.spanBuffer.length === 0) return;

    // In production, this would send to Jaeger, Zipkin, or other tracing backend
    console.log(`[Tracer] Flushing ${this.spanBuffer.length} spans`);
    
    // For now, just clear the buffer
    this.spanBuffer = [];
  }

  /**
   * Calculate critical path through trace spans
   */
  private calculateCriticalPath(spans: TraceSpan[]): string[] {
    // Build dependency graph
    const spanMap = new Map(spans.map(s => [s.spanId, s]));
    const children = new Map<string, string[]>();

    for (const span of spans) {
      if (span.parentSpanId) {
        const childList = children.get(span.parentSpanId) || [];
        childList.push(span.spanId);
        children.set(span.parentSpanId, childList);
      }
    }

    // Find root span
    const rootSpan = spans.find(s => !s.parentSpanId);
    if (!rootSpan) return [];

    // DFS to find longest path
    const findLongestPath = (spanId: string): { path: string[], duration: number } => {
      const span = spanMap.get(spanId);
      if (!span) return { path: [], duration: 0 };

      const childSpans = children.get(spanId) || [];
      
      if (childSpans.length === 0) {
        return { path: [spanId], duration: span.duration || 0 };
      }

      let longestPath = { path: [spanId], duration: span.duration || 0 };
      
      for (const childId of childSpans) {
        const childPath = findLongestPath(childId);
        const totalDuration = (span.duration || 0) + childPath.duration;
        
        if (totalDuration > longestPath.duration) {
          longestPath = {
            path: [spanId, ...childPath.path],
            duration: totalDuration
          };
        }
      }

      return longestPath;
    };

    return findLongestPath(rootSpan.spanId).path;
  }
}

export const distributedTracer = DistributedTracer.getInstance();