/**
 * Escrow Management API Routes
 * 
 * Provides endpoints for managing and monitoring the escrow subsystem
 */

import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireAuth, loadUserPolicy } from '../auth/middleware';
import { getEscrowManager } from './escrow-manager';
import { EscrowForecastService } from './forecast-service';
import { EscrowDisbursementService } from './disbursement-service';
import { EscrowAnalysisService } from './analysis-service';
import { getEnhancedRabbitMQService as getRabbitMQService } from '../services/rabbitmq-enhanced';
import { pool } from '../db';

const router = Router();

// Services
const forecastService = new EscrowForecastService();
const disbursementService = new EscrowDisbursementService();
const analysisService = new EscrowAnalysisService();

// Middleware for admin-only routes
const requireAdmin = async (req: Request, res: Response, next: Function) => {
  await loadUserPolicy(req, res, () => {
    if (!req.userPolicy?.hasResourcePermission('admin_dashboard', 'read')) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
};

/**
 * Get escrow subsystem status
 */
router.get('/status', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const manager = getEscrowManager();
  const status = manager.getStatus();
  
  res.json({
    subsystem: 'escrow',
    ...status,
    timestamp: new Date().toISOString()
  });
});

/**
 * Manually trigger escrow daily cycle
 */
router.post('/cycle', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { cycle_date } = req.body;
    const date = cycle_date || new Date().toISOString().split('T')[0];
    
    console.log(`[EscrowRoutes] Manual cycle triggered by user ${req.user?.username} for ${date}`);
    
    const manager = getEscrowManager();
    
    // Run cycle asynchronously
    manager.runDailyCycle(date).catch(error => {
      console.error('[EscrowRoutes] Manual cycle failed:', error);
    });
    
    res.json({
      message: 'Escrow daily cycle initiated',
      cycle_date: date,
      status: 'processing'
    });
    
  } catch (error) {
    console.error('[EscrowRoutes] Error initiating cycle:', error);
    res.status(500).json({ error: 'Failed to initiate escrow cycle' });
  }
});

/**
 * Get loan escrow forecast
 */
router.get('/forecast/:loanId', requireAuth, async (req: Request, res: Response) => {
  try {
    const loanId = parseInt(req.params.loanId);
    
    // Check loan access
    const loanResult = await pool.query(
      'SELECT id FROM loans WHERE id = $1',
      [loanId]
    );
    
    if (loanResult.rows.length === 0) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    
    const forecasts = await forecastService.getForecast(loanId);
    
    res.json({
      loan_id: loanId,
      forecasts: forecasts.map(f => ({
        escrow_id: f.escrow_id,
        due_date: f.due_date,
        amount: (Number(f.amount_minor) / 100).toFixed(2)
      })),
      count: forecasts.length
    });
    
  } catch (error) {
    console.error('[EscrowRoutes] Error getting forecast:', error);
    res.status(500).json({ error: 'Failed to get escrow forecast' });
  }
});

/**
 * Generate forecast for a loan
 */
router.post('/forecast/:loanId', requireAuth, async (req: Request, res: Response) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const { as_of_date } = req.body;
    
    const date = as_of_date || new Date().toISOString().split('T')[0];
    
    console.log(`[EscrowRoutes] Forecast generation requested for loan ${loanId} by user ${req.user?.username}`);
    
    // Queue forecast generation
    const rabbitmq = getRabbitMQService();
    await rabbitmq.publishMessage(
      'escrow.saga',
      'forecast.request',
      {
        loan_id: loanId,
        as_of_date: date,
        correlation_id: `manual_forecast_${loanId}_${Date.now()}`
      },
      { persistent: true }
    );
    
    res.json({
      message: 'Forecast generation initiated',
      loan_id: loanId,
      as_of_date: date,
      status: 'queued'
    });
    
  } catch (error) {
    console.error('[EscrowRoutes] Error initiating forecast:', error);
    res.status(500).json({ error: 'Failed to initiate forecast generation' });
  }
});

/**
 * Get loan disbursement history
 */
router.get('/disbursements/:loanId', requireAuth, async (req: Request, res: Response) => {
  try {
    const loanId = parseInt(req.params.loanId);
    
    const disbursements = await disbursementService.getDisbursementHistory(loanId);
    
    res.json({
      loan_id: loanId,
      disbursements: disbursements.map(d => ({
        disb_id: d.disb_id,
        escrow_id: d.escrow_id,
        due_date: d.due_date,
        amount: (Number(d.amount_minor) / 100).toFixed(2),
        status: d.status,
        event_id: d.event_id,
        scheduled_at: d.scheduled_at,
        posted_at: d.posted_at
      })),
      count: disbursements.length
    });
    
  } catch (error) {
    console.error('[EscrowRoutes] Error getting disbursements:', error);
    res.status(500).json({ error: 'Failed to get disbursement history' });
  }
});

/**
 * Schedule disbursements for a loan
 */
router.post('/disbursements/:loanId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const { effective_date } = req.body;
    
    const date = effective_date || new Date().toISOString().split('T')[0];
    
    console.log(`[EscrowRoutes] Disbursement scheduling requested for loan ${loanId} by user ${req.user?.username}`);
    
    // Queue disbursement scheduling
    const rabbitmq = getRabbitMQService();
    await rabbitmq.publishMessage(
      'escrow.saga',
      'disbursement.schedule',
      {
        loan_id: loanId,
        effective_date: date,
        correlation_id: `manual_disbursement_${loanId}_${Date.now()}`
      },
      { persistent: true }
    );
    
    res.json({
      message: 'Disbursement scheduling initiated',
      loan_id: loanId,
      effective_date: date,
      status: 'queued'
    });
    
  } catch (error) {
    console.error('[EscrowRoutes] Error scheduling disbursements:', error);
    res.status(500).json({ error: 'Failed to schedule disbursements' });
  }
});

/**
 * Get latest escrow analysis
 */
router.get('/analysis/:loanId', requireAuth, async (req: Request, res: Response) => {
  try {
    const loanId = parseInt(req.params.loanId);
    
    const analysis = await analysisService.getLatestAnalysis(loanId);
    
    if (!analysis) {
      return res.status(404).json({ error: 'No analysis found for loan' });
    }
    
    res.json({
      loan_id: loanId,
      analysis: {
        analysis_id: analysis.analysis_id,
        as_of_date: analysis.as_of_date,
        period_start: analysis.period_start,
        period_end: analysis.period_end,
        annual_expected: (Number(analysis.annual_expected_minor) / 100).toFixed(2),
        cushion_target: (Number(analysis.cushion_target_minor) / 100).toFixed(2),
        current_balance: (Number(analysis.current_balance_minor) / 100).toFixed(2),
        shortage: (Number(analysis.shortage_minor) / 100).toFixed(2),
        deficiency: (Number(analysis.deficiency_minor) / 100).toFixed(2),
        surplus: (Number(analysis.surplus_minor) / 100).toFixed(2),
        new_monthly_target: (Number(analysis.new_monthly_target_minor) / 100).toFixed(2),
        deficiency_recovery_monthly: (Number(analysis.deficiency_recovery_monthly_minor) / 100).toFixed(2),
        version: analysis.version,
        created_at: analysis.created_at
      }
    });
    
  } catch (error) {
    console.error('[EscrowRoutes] Error getting analysis:', error);
    res.status(500).json({ error: 'Failed to get escrow analysis' });
  }
});

/**
 * Perform escrow analysis
 */
router.post('/analysis/:loanId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const { as_of_date, generate_statement } = req.body;
    
    const date = as_of_date || new Date().toISOString().split('T')[0];
    
    console.log(`[EscrowRoutes] Analysis requested for loan ${loanId} by user ${req.user?.username}`);
    
    // Queue analysis
    const rabbitmq = getRabbitMQService();
    await rabbitmq.publishMessage(
      'escrow.saga',
      'analysis.request',
      {
        loan_id: loanId,
        as_of_date: date,
        generate_statement: generate_statement || false,
        correlation_id: `manual_analysis_${loanId}_${Date.now()}`
      },
      { persistent: true }
    );
    
    res.json({
      message: 'Escrow analysis initiated',
      loan_id: loanId,
      as_of_date: date,
      generate_statement: generate_statement || false,
      status: 'queued'
    });
    
  } catch (error) {
    console.error('[EscrowRoutes] Error initiating analysis:', error);
    res.status(500).json({ error: 'Failed to initiate escrow analysis' });
  }
});

/**
 * Get escrow summary statistics
 */
router.get('/stats', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const statsResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT loan_id) as total_loans,
        COUNT(*) as total_forecasts,
        SUM(amount_minor) / 100 as total_forecast_amount
      FROM escrow_forecast
      WHERE due_date >= CURRENT_DATE
        AND due_date <= CURRENT_DATE + INTERVAL '12 months'
    `);
    
    const disbResult = await pool.query(`
      SELECT 
        COUNT(*) as total_disbursements,
        COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
        COUNT(*) FILTER (WHERE status = 'posted') as posted,
        COUNT(*) FILTER (WHERE status = 'canceled') as canceled,
        SUM(amount_minor) FILTER (WHERE status = 'posted') / 100 as total_posted_amount
      FROM escrow_disbursement
      WHERE due_date >= CURRENT_DATE - INTERVAL '30 days'
    `);
    
    const analysisResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT loan_id) as loans_analyzed,
        SUM(shortage_minor) / 100 as total_shortages,
        SUM(deficiency_minor) / 100 as total_deficiencies,
        SUM(surplus_minor) / 100 as total_surpluses
      FROM escrow_analysis
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    `);
    
    res.json({
      forecasts: {
        total_loans: parseInt(statsResult.rows[0].total_loans),
        total_forecasts: parseInt(statsResult.rows[0].total_forecasts),
        total_amount: parseFloat(statsResult.rows[0].total_forecast_amount || 0).toFixed(2)
      },
      disbursements: {
        total: parseInt(disbResult.rows[0].total_disbursements),
        scheduled: parseInt(disbResult.rows[0].scheduled),
        posted: parseInt(disbResult.rows[0].posted),
        canceled: parseInt(disbResult.rows[0].canceled),
        total_posted_amount: parseFloat(disbResult.rows[0].total_posted_amount || 0).toFixed(2)
      },
      analysis: {
        loans_analyzed: parseInt(analysisResult.rows[0].loans_analyzed),
        total_shortages: parseFloat(analysisResult.rows[0].total_shortages || 0).toFixed(2),
        total_deficiencies: parseFloat(analysisResult.rows[0].total_deficiencies || 0).toFixed(2),
        total_surpluses: parseFloat(analysisResult.rows[0].total_surpluses || 0).toFixed(2)
      }
    });
    
  } catch (error) {
    console.error('[EscrowRoutes] Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get escrow statistics' });
  }
});

export { router as escrowRoutes };