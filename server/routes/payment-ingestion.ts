import { Router } from 'express';
import { paymentIngestionService } from '../services/payment-ingestion';
import { z } from 'zod';

const router = Router();

// Schema for ingestion request
const ingestionRequestSchema = z.object({
  channel: z.enum(['ach', 'wire', 'realtime', 'check', 'card', 'paypal', 'venmo', 'book']),
  sourceReference: z.string().optional(),
  rawPayload: z.any(), // Required field
  normalizedEnvelope: z.object({}).passthrough(),
  artifactUris: z.array(z.string()).optional(),
  artifactHashes: z.array(z.string()).optional(),
  // For idempotency key calculation
  method: z.string(),
  normalizedReference: z.string(),
  valueDate: z.string(),
  amountCents: z.number(),
  loanId: z.number()
});

/**
 * POST /api/payment-ingestions
 * Create a new payment ingestion with idempotency
 */
router.post('/', async (req, res) => {
  try {
    const validatedData = ingestionRequestSchema.parse(req.body);
    
    const ingestion = await paymentIngestionService.persistIngestion(validatedData);
    
    res.json({
      success: true,
      data: ingestion,
      message: ingestion.status === 'received' 
        ? 'Payment ingestion created successfully' 
        : 'Duplicate payment detected, returning existing ingestion'
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }
    
    if (error.message?.includes('Invalid normalized JSON')) {
      return res.status(400).json({
        error: 'Schema error',
        message: error.message
      });
    }
    
    console.error('[PaymentIngestion] Error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/payment-ingestions/:id
 * Get ingestion by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const ingestion = await paymentIngestionService.getById(req.params.id);
    
    if (!ingestion) {
      return res.status(404).json({
        error: 'Ingestion not found'
      });
    }
    
    res.json({
      success: true,
      data: ingestion
    });
  } catch (error: any) {
    console.error('[PaymentIngestion] Error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/payment-ingestions/idempotency/:key
 * Get ingestion by idempotency key
 */
router.get('/idempotency/:key', async (req, res) => {
  try {
    const ingestion = await paymentIngestionService.getByIdempotencyKey(req.params.key);
    
    if (!ingestion) {
      return res.status(404).json({
        error: 'Ingestion not found'
      });
    }
    
    res.json({
      success: true,
      data: ingestion
    });
  } catch (error: any) {
    console.error('[PaymentIngestion] Error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/payment-ingestions/channel/:channel
 * List ingestions by channel
 */
router.get('/channel/:channel', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const ingestions = await paymentIngestionService.listByChannel(req.params.channel, limit);
    
    res.json({
      success: true,
      data: ingestions,
      count: ingestions.length
    });
  } catch (error: any) {
    console.error('[PaymentIngestion] Error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * PATCH /api/payment-ingestions/:id/status
 * Update ingestion status
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const statusSchema = z.object({
      status: z.enum(['received', 'normalized', 'published'])
    });
    
    const { status } = statusSchema.parse(req.body);
    
    const updated = await paymentIngestionService.updateStatus(req.params.id, status);
    
    if (!updated) {
      return res.status(404).json({
        error: 'Ingestion not found'
      });
    }
    
    res.json({
      success: true,
      data: updated
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }
    
    console.error('[PaymentIngestion] Error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

export default router;