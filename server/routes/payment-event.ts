import { Router } from 'express';
import { PaymentEventService } from '../services/payment-event';
import crypto from 'crypto';

const router = Router();
const eventService = new PaymentEventService();

// Create a payment event
router.post('/', async (req, res) => {
  try {
    const { 
      type, 
      data, 
      correlationId = crypto.randomUUID(),
      paymentId,
      ingestionId,
      actorType = 'system',
      actorId
    } = req.body;

    if (!type || !data) {
      return res.status(400).json({ error: 'type and data are required' });
    }

    const event = await eventService.createEvent({
      type,
      data,
      correlationId,
      paymentId,
      ingestionId,
      actorType,
      actorId
    });

    res.status(201).json(event);
  } catch (error: any) {
    console.error('[PaymentEvent] Error creating event:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get events by correlation ID
router.get('/correlation/:correlationId', async (req, res) => {
  try {
    const events = await eventService.getEventsByCorrelation(
      req.params.correlationId
    );
    res.json({ events });
  } catch (error: any) {
    console.error('[PaymentEvent] Error fetching events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get events by payment ID
router.get('/payment/:paymentId', async (req, res) => {
  try {
    const events = await eventService.getEventsByPaymentId(
      req.params.paymentId
    );
    res.json({ events });
  } catch (error: any) {
    console.error('[PaymentEvent] Error fetching events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify hash chain integrity
router.post('/verify/:correlationId', async (req, res) => {
  try {
    const result = await eventService.verifyHashChain(
      req.params.correlationId
    );
    
    // Flag discontinuity if found
    if (!result.valid && result.discontinuityAt !== undefined) {
      await eventService.flagDiscontinuity(
        req.params.correlationId,
        result.discontinuityAt,
        result.expectedHash || null,
        result.actualHash || null
      );
    }
    
    res.json(result);
  } catch (error: any) {
    console.error('[PaymentEvent] Error verifying hash chain:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Rebuild hash chain for correlation ID
router.post('/rebuild/:correlationId', async (req, res) => {
  try {
    const result = await eventService.rebuildHashChain(
      req.params.correlationId
    );
    res.json(result);
  } catch (error: any) {
    console.error('[PaymentEvent] Error rebuilding hash chain:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create system event
router.post('/system', async (req, res) => {
  try {
    const { type, data, correlationId, paymentId, ingestionId } = req.body;
    
    if (!type || !data || !correlationId) {
      return res.status(400).json({ 
        error: 'type, data, and correlationId are required' 
      });
    }

    const event = await eventService.createSystemEvent(
      type,
      data,
      correlationId,
      paymentId,
      ingestionId
    );
    
    res.status(201).json(event);
  } catch (error: any) {
    console.error('[PaymentEvent] Error creating system event:', error);
    res.status(400).json({ error: error.message });
  }
});

// Create human event
router.post('/human', async (req, res) => {
  try {
    const { type, data, correlationId, userId, paymentId, ingestionId } = req.body;
    
    if (!type || !data || !correlationId || !userId) {
      return res.status(400).json({ 
        error: 'type, data, correlationId, and userId are required' 
      });
    }

    const event = await eventService.createHumanEvent(
      type,
      data,
      correlationId,
      userId,
      paymentId,
      ingestionId
    );
    
    res.status(201).json(event);
  } catch (error: any) {
    console.error('[PaymentEvent] Error creating human event:', error);
    res.status(400).json({ error: error.message });
  }
});

// Create AI event
router.post('/ai', async (req, res) => {
  try {
    const { type, data, correlationId, aiModel, paymentId, ingestionId } = req.body;
    
    if (!type || !data || !correlationId || !aiModel) {
      return res.status(400).json({ 
        error: 'type, data, correlationId, and aiModel are required' 
      });
    }

    const event = await eventService.createAIEvent(
      type,
      data,
      correlationId,
      aiModel,
      paymentId,
      ingestionId
    );
    
    res.status(201).json(event);
  } catch (error: any) {
    console.error('[PaymentEvent] Error creating AI event:', error);
    res.status(400).json({ error: error.message });
  }
});

export default router;