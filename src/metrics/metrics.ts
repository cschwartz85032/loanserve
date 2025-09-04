import client from 'prom-client';

const queueProcessedTotal = new client.Counter({
  name: 'queue_messages_processed_total',
  help: 'Total number of messages processed by queue and status',
  labelNames: ['queue', 'status'],
});

const queueDuration = new client.Histogram({
  name: 'queue_processing_duration_seconds',
  help: 'Processing duration for messages',
  labelNames: ['queue', 'status'],
  buckets: [0.01, 0.1, 0.5, 1, 2, 5, 10],
});

export function collectMetrics(queue: string, status: string, durationMs: number) {
  queueProcessedTotal.labels(queue, status).inc();
  queueDuration.labels(queue, status).observe(durationMs / 1000);
}

export function registerMetrics() {
  client.collectDefaultMetrics();
}

export function metricsEndpoint(req: any, res: any) {
  res.set('Content-Type', client.register.contentType);
  res.end(client.register.metrics());
}