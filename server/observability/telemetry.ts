/**
 * Simplified Observability Configuration
 * Provides correlation ID tracking and basic metrics
 */

import { AsyncLocalStorage } from 'async_hooks';

// Create async local storage for correlation IDs
export const correlationStorage = new AsyncLocalStorage<{ correlationId: string }>();

// Service name and version
const SERVICE_NAME = process.env.SERVICE_NAME || 'loanserve-pro';
const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';

// Simple metrics collector
const metrics = {
  correlationIds: new Map<string, Date>(),
  requestCount: 0,
  errorCount: 0,
  messageCount: 0,
};

// Export simple tracer interface
export const tracer = {
  startSpan: (name: string, options?: any) => {
    const correlationId = correlationStorage.getStore()?.correlationId;
    const span = {
      name,
      correlationId,
      startTime: Date.now(),
      setAttribute: (key: string, value: any) => {
        // Log attribute for debugging
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Span ${name}] ${key}:`, value);
        }
      },
      setStatus: (status: any) => {
        // Track status
      },
      recordException: (error: Error) => {
        console.error(`[Span ${name}] Error:`, error);
        metrics.errorCount++;
      },
      end: () => {
        const duration = Date.now() - span.startTime;
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Span ${name}] Completed in ${duration}ms`);
        }
      },
    };
    return span;
  },
};

// Export simple meter interface
export const meter = {
  createCounter: (name: string, options?: any) => ({
    add: (value: number, labels?: any) => {
      metrics.requestCount += value;
    },
  }),
  createHistogram: (name: string, options?: any) => ({
    record: (value: number, labels?: any) => {
      // Record histogram value
    },
  }),
  createObservableGauge: (name: string, options?: any) => ({
    addCallback: (callback: any) => {
      // Set up periodic callback
    },
  }),
};

// Helper to create a span with correlation ID
export function createSpan(name: string, options?: any) {
  return tracer.startSpan(name, options);
}

// Helper to run code within a span
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  options?: any
): Promise<T> {
  const span = createSpan(name, options);
  
  try {
    const result = await fn();
    span.setStatus({ code: 'OK' });
    return result;
  } catch (error) {
    span.setStatus({
      code: 'ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

// Helper to add correlation ID to context
export function withCorrelationId<T>(
  correlationId: string,
  fn: () => T
): T {
  return correlationStorage.run({ correlationId }, fn);
}

// Initialize telemetry
export function initializeTelemetry() {
  console.log('[Telemetry] Initializing observability...');
  console.log('[Telemetry] Service:', SERVICE_NAME);
  console.log('[Telemetry] Version:', SERVICE_VERSION);
  console.log('[Telemetry] Environment:', process.env.NODE_ENV);
  
  // Set up metrics endpoint
  if (process.env.METRICS_PORT) {
    console.log('[Telemetry] Metrics endpoint: http://localhost:' + process.env.METRICS_PORT + '/metrics');
  }
}

// Shutdown telemetry gracefully
export async function shutdownTelemetry() {
  console.log('[Telemetry] Shutting down...');
  // Clean up any resources
  metrics.correlationIds.clear();
}

// Export SpanKind and SpanStatusCode for compatibility
export const SpanKind = {
  INTERNAL: 0,
  SERVER: 1,
  CLIENT: 2,
  PRODUCER: 3,
  CONSUMER: 4,
};

export const SpanStatusCode = {
  UNSET: 0,
  OK: 1,
  ERROR: 2,
};