/**
 * Reconciliation API Routes
 * Endpoints for managing payment reconciliation
 */

import express from 'express';
import { dailyReconciler } from '../services/daily-reconciler';
import { reconciliationScheduler } from '../services/reconciliation-scheduler';
import { z } from 'zod';

const router = express.Router();

// Schema validators
const reconcileDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
});

const reconcileDateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
});

/**
 * GET /api/reconciliation/status/:channel/:date
 * Get reconciliation status for a specific channel and date
 */
router.get('/status/:channel/:date', async (req, res) => {
  try {
    const { channel, date } = req.params;
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const status = await dailyReconciler.getReconciliationStatus(
      channel,
      new Date(date)
    );

    if (!status) {
      return res.status(404).json({ 
        error: 'No reconciliation found for the specified channel and date' 
      });
    }

    res.json(status);
  } catch (error) {
    console.error('[Reconciliation API] Error getting status:', error);
    res.status(500).json({ error: 'Failed to get reconciliation status' });
  }
});

/**
 * POST /api/reconciliation/run
 * Manually trigger reconciliation for a specific date
 */
router.post('/run', async (req, res) => {
  try {
    const validation = reconcileDateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: validation.error.errors 
      });
    }

    const { date } = validation.data;
    
    // Run reconciliation asynchronously
    res.json({ 
      message: 'Reconciliation started',
      date,
      status: 'processing'
    });

    // Execute in background
    reconciliationScheduler.runReconciliationForDate(new Date(date))
      .then(result => {
        console.log('[Reconciliation API] Manual reconciliation completed:', result);
      })
      .catch(error => {
        console.error('[Reconciliation API] Manual reconciliation failed:', error);
      });

  } catch (error) {
    console.error('[Reconciliation API] Error triggering reconciliation:', error);
    res.status(500).json({ error: 'Failed to trigger reconciliation' });
  }
});

/**
 * POST /api/reconciliation/run-range
 * Run reconciliation for a date range
 */
router.post('/run-range', async (req, res) => {
  try {
    const validation = reconcileDateRangeSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: validation.error.errors 
      });
    }

    const { startDate, endDate } = validation.data;
    
    // Validate date range
    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ 
        error: 'Start date must be before or equal to end date' 
      });
    }

    // Calculate days in range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    if (days > 31) {
      return res.status(400).json({ 
        error: 'Date range cannot exceed 31 days' 
      });
    }

    // Run reconciliation asynchronously
    res.json({ 
      message: 'Batch reconciliation started',
      startDate,
      endDate,
      daysToProcess: days,
      status: 'processing'
    });

    // Execute in background
    reconciliationScheduler.runReconciliationForDateRange(start, end)
      .then(result => {
        console.log('[Reconciliation API] Batch reconciliation completed:', result);
      })
      .catch(error => {
        console.error('[Reconciliation API] Batch reconciliation failed:', error);
      });

  } catch (error) {
    console.error('[Reconciliation API] Error triggering batch reconciliation:', error);
    res.status(500).json({ error: 'Failed to trigger batch reconciliation' });
  }
});

/**
 * GET /api/reconciliation/scheduler/status
 * Get scheduler status
 */
router.get('/scheduler/status', (req, res) => {
  res.json({
    status: 'active',
    schedule: 'Daily at 2:00 AM UTC',
    nextRun: getNextRunTime(),
    description: 'Reconciles previous day transactions automatically'
  });
});

/**
 * POST /api/reconciliation/scheduler/start
 * Start the reconciliation scheduler
 */
router.post('/scheduler/start', (req, res) => {
  reconciliationScheduler.start();
  res.json({ 
    message: 'Reconciliation scheduler started',
    schedule: 'Daily at 2:00 AM UTC'
  });
});

/**
 * POST /api/reconciliation/scheduler/stop
 * Stop the reconciliation scheduler
 */
router.post('/scheduler/stop', (req, res) => {
  reconciliationScheduler.stop();
  res.json({ message: 'Reconciliation scheduler stopped' });
});

/**
 * Helper function to calculate next run time
 */
function getNextRunTime(): string {
  const now = new Date();
  const nextRun = new Date();
  
  // Set to 2 AM UTC
  nextRun.setUTCHours(2, 0, 0, 0);
  
  // If it's already past 2 AM today, set to tomorrow
  if (now.getUTCHours() >= 2) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  return nextRun.toISOString();
}

export default router;