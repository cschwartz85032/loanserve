import express from 'express';
import crypto from 'crypto';
import { columnWebhookService } from '../services/payments/column-webhook';

const router = express.Router();

/**
 * Enhanced Column webhook handler with proper HMAC verification
 * Uses raw body parsing for signature validation and canonical envelopes
 */
router.post('/webhook/column', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.header('X-Signature') || '';
    const timestamp = req.header('X-Timestamp') || '';
    const correlationId = req.correlationId || crypto.randomUUID();

    if (!signature || !timestamp) {
      return res.status(401).json({ error: 'Missing signature or timestamp headers' });
    }

    // Process webhook using enhanced service
    await columnWebhookService.processWebhook(
      req.body,
      signature,
      timestamp,
      correlationId
    );

    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('[ColumnWebhook] Processing error:', error);
    
    // Return 200 to prevent Column retries on processing errors
    res.status(200).json({ 
      received: true, 
      error: 'Processing error logged' 
    });
  }
});

export default router;