import express from 'express';
import { metricsEndpoint, registerMetrics } from '../metrics/metrics';
import { healthHandler } from '../server/health';
import { readyHandler, markReady, markNotReady } from '../server/ready';

export function setupHealthAndMetrics(app: express.Application) {
  // Initialize Prometheus metrics
  registerMetrics();
  
  // Health endpoints
  app.get('/health', healthHandler);
  app.get('/healthz', healthHandler);
  app.get('/ready', readyHandler);
  
  // Metrics endpoint
  app.get('/metrics', metricsEndpoint);
  
  // Mark service as ready after initialization
  markReady();
}

export { markReady, markNotReady };