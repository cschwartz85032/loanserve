/**
 * OpenTelemetry Configuration
 * Sets up distributed tracing with correlation IDs
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { 
  BasicTracerProvider,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  BatchSpanProcessor
} from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { AmqplibInstrumentation } from '@opentelemetry/instrumentation-amqplib';
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { AsyncLocalStorage } from 'async_hooks';

// Create async local storage for correlation IDs
export const correlationStorage = new AsyncLocalStorage<{ correlationId: string }>();

// Service name and version
const SERVICE_NAME = process.env.SERVICE_NAME || 'loanserve-pro';
const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';

// Create resource
const resource = Resource.default().merge(
  new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
  })
);

// Create tracer provider
const tracerProvider = new BasicTracerProvider({
  resource,
});

// Configure Jaeger exporter if enabled
if (process.env.JAEGER_ENDPOINT) {
  const jaegerExporter = new JaegerExporter({
    endpoint: process.env.JAEGER_ENDPOINT,
  });
  tracerProvider.addSpanProcessor(new BatchSpanProcessor(jaegerExporter));
}

// Add console exporter for development
if (process.env.NODE_ENV === 'development') {
  tracerProvider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
}

// Register tracer provider
tracerProvider.register();

// Create Prometheus exporter for metrics
const prometheusExporter = new PrometheusExporter(
  {
    port: parseInt(process.env.METRICS_PORT || '9090'),
    endpoint: '/metrics',
  },
  () => {
    console.log('[Telemetry] Prometheus metrics server started on port', process.env.METRICS_PORT || 9090);
  }
);

// Create meter provider
const meterProvider = new MeterProvider({
  resource,
  readers: [prometheusExporter],
});

// Register instrumentations
registerInstrumentations({
  instrumentations: [
    new HttpInstrumentation({
      requestHook: (span, request) => {
        // Add correlation ID to span
        const correlationId = (request as any).correlationId || 
                            (request as any).headers?.['x-correlation-id'];
        if (correlationId) {
          span.setAttribute('correlation.id', correlationId);
        }
      },
    }),
    new ExpressInstrumentation(),
    new AmqplibInstrumentation({
      publishHook: (span, publishInfo) => {
        // Add correlation ID to published messages
        const correlationId = correlationStorage.getStore()?.correlationId;
        if (correlationId) {
          span.setAttribute('correlation.id', correlationId);
          span.setAttribute('messaging.message.correlation_id', correlationId);
        }
      },
      consumeHook: (span, consumeInfo) => {
        // Extract correlation ID from consumed messages
        const correlationId = consumeInfo.msg.properties?.correlationId;
        if (correlationId) {
          span.setAttribute('correlation.id', correlationId);
          span.setAttribute('messaging.message.correlation_id', correlationId);
        }
      },
    }),
    ...getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: false, // Disable fs instrumentation to reduce noise
      },
    }),
  ],
});

// Export tracer
export const tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);

// Export meter for custom metrics
export const meter = meterProvider.getMeter(SERVICE_NAME, SERVICE_VERSION);

// Helper to create a span with correlation ID
export function createSpan(name: string, options?: any) {
  const correlationId = correlationStorage.getStore()?.correlationId;
  const span = tracer.startSpan(name, options);
  
  if (correlationId) {
    span.setAttribute('correlation.id', correlationId);
  }
  
  return span;
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
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
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
  console.log('[Telemetry] Initializing OpenTelemetry...');
  console.log('[Telemetry] Service:', SERVICE_NAME);
  console.log('[Telemetry] Version:', SERVICE_VERSION);
  console.log('[Telemetry] Environment:', process.env.NODE_ENV);
  
  if (process.env.JAEGER_ENDPOINT) {
    console.log('[Telemetry] Jaeger endpoint:', process.env.JAEGER_ENDPOINT);
  }
  
  console.log('[Telemetry] Metrics endpoint: http://localhost:' + (process.env.METRICS_PORT || 9090) + '/metrics');
}

// Shutdown telemetry gracefully
export async function shutdownTelemetry() {
  console.log('[Telemetry] Shutting down...');
  await tracerProvider.shutdown();
  await meterProvider.shutdown();
}