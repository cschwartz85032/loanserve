/**
 * Prometheus Metrics Endpoint
 * Exposes metrics for monitoring via Prometheus scraping
 */

import { Router } from 'express';
import { register } from '../observability/prometheus-metrics';

const router = Router();

/**
 * GET /metrics - Prometheus metrics endpoint
 * Returns all registered metrics in Prometheus format
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await register.metrics();
    res.set('Content-Type', register.contentType);
    res.send(metrics);
  } catch (error) {
    console.error('[Metrics] Error generating metrics:', error);
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

export default router;