import { Router } from 'express';
import { db } from '../db';
import { 
  servicingRuns, 
  servicingEvents, 
  servicingExceptions,
  paymentsInbox,
  interestAccruals,
  investorDistributions,
  escrowAdvances,
  loans,
  investors,
  escrowDisbursements,
  escrowAccounts,
  loanLedger,
  loanFees
} from '@shared/schema';
import { eq, and, gte, lte, desc, asc, sql, inArray } from 'drizzle-orm';
import { ServicingCycleService } from '../services/servicing-cycle-service';
import crypto from 'crypto';

const router = Router();

// Initialize the servicing cycle service
const servicingService = new ServicingCycleService(db);

// Get current/active servicing run
router.get('/current', async (req, res) => {
  try {
    const currentRun = await db.query.servicingRuns.findFirst({
      where: eq(servicingRuns.status, 'running'),
      orderBy: desc(servicingRuns.startTime)
    });
    
    res.json(currentRun || null);
  } catch (error) {
    console.error('Error fetching current run:', error);
    res.status(500).json({ error: 'Failed to fetch current servicing run' });
  }
});

// Get recent servicing runs
router.get('/runs', async (req, res) => {
  try {
    const runs = await db.query.servicingRuns.findMany({
      orderBy: desc(servicingRuns.startTime),
      limit: 20
    });
    
    res.json(runs);
  } catch (error) {
    console.error('Error fetching runs:', error);
    res.status(500).json({ error: 'Failed to fetch servicing runs' });
  }
});

// Get exceptions
router.get('/exceptions', async (req, res) => {
  try {
    const exceptions = await db.select({
      id: servicingExceptions.id,
      runId: servicingExceptions.runId,
      loanId: servicingExceptions.loanId,
      loanNumber: loans.loanNumber,
      severity: servicingExceptions.severity,
      type: servicingExceptions.type,
      message: servicingExceptions.message,
      suggestedAction: servicingExceptions.suggestedAction,
      dueDate: servicingExceptions.dueDate,
      status: servicingExceptions.status,
      createdAt: servicingExceptions.createdAt
    })
    .from(servicingExceptions)
    .leftJoin(loans, eq(servicingExceptions.loanId, loans.id))
    .orderBy(desc(servicingExceptions.createdAt))
    .limit(100);
    
    res.json(exceptions);
  } catch (error) {
    console.error('Error fetching exceptions:', error);
    res.status(500).json({ error: 'Failed to fetch exceptions' });
  }
});

// Get summary for a specific date
router.get('/summary/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    // Get runs for the date
    const runs = await db.query.servicingRuns.findMany({
      where: eq(servicingRuns.valuationDate, date)
    });
    
    // Calculate summary
    const summary = {
      loansProcessed: runs.reduce((sum, run) => sum + run.loansProcessed, 0),
      totalLoans: runs[0]?.totalLoans || 0,
      paymentsPosted: '0.00',
      paymentCount: 0,
      investorDistributions: '0.00',
      investorCount: 0
    };
    
    if (runs.length > 0) {
      // Get payment events for the date
      const paymentEvents = await db.query.servicingEvents.findMany({
        where: and(
          eq(servicingEvents.valuationDate, date),
          eq(servicingEvents.eventType, 'post_payment')
        )
      });
      
      summary.paymentCount = paymentEvents.length;
      summary.paymentsPosted = paymentEvents
        .reduce((sum, event) => sum + parseFloat(event.amount || '0'), 0)
        .toFixed(2);
      
      // Get investor distributions for the date
      const distributions = await db.query.investorDistributions.findMany({
        where: eq(investorDistributions.distributionDate, date)
      });
      
      const uniqueInvestors = new Set(distributions.map(d => d.investorId));
      summary.investorCount = uniqueInvestors.size;
      summary.investorDistributions = distributions
        .reduce((sum, dist) => sum + parseFloat(dist.netAmount), 0)
        .toFixed(2);
    }
    
    res.json(summary);
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Start a new servicing cycle
router.post('/start', async (req, res) => {
  try {
    const { valuationDate, loanIds, dryRun = true } = req.body;
    const userId = req.user?.id;
    
    // Check if there's already a running cycle
    const runningCycle = await db.query.servicingRuns.findFirst({
      where: eq(servicingRuns.status, 'running')
    });
    
    if (runningCycle) {
      return res.status(400).json({ 
        error: 'A servicing cycle is already running',
        runId: runningCycle.runId 
      });
    }
    
    // Generate unique run ID
    const runId = `RUN-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    
    // Create input hash for idempotency
    const inputHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ valuationDate, loanIds, dryRun }))
      .digest('hex');
    
    // Count total loans to process
    let totalLoans = 0;
    if (loanIds && loanIds.length > 0) {
      totalLoans = loanIds.length;
    } else {
      const loanCount = await db.select({ count: sql<number>`count(*)` })
        .from(loans)
        .where(eq(loans.status, 'active'));
      totalLoans = Number(loanCount[0].count);
    }
    
    // Create the servicing run
    await db.insert(servicingRuns).values({
      runId,
      valuationDate,
      status: 'pending',
      totalLoans,
      loansProcessed: 0,
      eventsCreated: 0,
      exceptionsCreated: 0,
      dryRun,
      loanIds,
      inputHash,
      createdBy: userId
    });
    
    // Start the servicing cycle asynchronously
    servicingService.runCycle(runId, valuationDate, loanIds, dryRun)
      .catch(error => {
        console.error('Servicing cycle failed:', error);
        // Update run status to failed
        db.update(servicingRuns)
          .set({ 
            status: 'failed',
            endTime: new Date(),
            errors: [error.message]
          })
          .where(eq(servicingRuns.runId, runId))
          .catch(console.error);
      });
    
    res.json({
      runId,
      totalLoans,
      status: 'started',
      message: `Servicing cycle started for ${totalLoans} loans`
    });
  } catch (error) {
    console.error('Error starting servicing cycle:', error);
    res.status(500).json({ error: 'Failed to start servicing cycle' });
  }
});

// Cancel a running servicing cycle
router.post('/cancel/:runId', async (req, res) => {
  try {
    const { runId } = req.params;
    
    const run = await db.query.servicingRuns.findFirst({
      where: eq(servicingRuns.runId, runId)
    });
    
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    
    if (run.status !== 'running') {
      return res.status(400).json({ error: 'Can only cancel running cycles' });
    }
    
    await db.update(servicingRuns)
      .set({
        status: 'cancelled',
        endTime: new Date()
      })
      .where(eq(servicingRuns.runId, runId));
    
    res.json({ message: 'Servicing cycle cancelled', runId });
  } catch (error) {
    console.error('Error cancelling servicing cycle:', error);
    res.status(500).json({ error: 'Failed to cancel servicing cycle' });
  }
});

// Reprocess a specific loan for a valuation date
router.post('/reprocess', async (req, res) => {
  try {
    const { runId, loanId, valuationDate } = req.body;
    
    // Validate the run exists
    const run = await db.query.servicingRuns.findFirst({
      where: eq(servicingRuns.runId, runId)
    });
    
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    
    // Reprocess the loan
    const result = await servicingService.reprocessLoan(runId, loanId, valuationDate);
    
    res.json({
      message: 'Loan reprocessed successfully',
      eventsCreated: result.eventsCreated,
      exceptionsCreated: result.exceptionsCreated
    });
  } catch (error) {
    console.error('Error reprocessing loan:', error);
    res.status(500).json({ error: 'Failed to reprocess loan' });
  }
});

// Export run report
router.get('/export/:runId', async (req, res) => {
  try {
    const { runId } = req.params;
    const { format = 'json' } = req.query;
    
    const run = await db.query.servicingRuns.findFirst({
      where: eq(servicingRuns.runId, runId)
    });
    
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    
    // Get all events for this run
    const events = await db.query.servicingEvents.findMany({
      where: eq(servicingEvents.runId, runId)
    });
    
    // Get all exceptions for this run
    const exceptions = await db.query.servicingExceptions.findMany({
      where: eq(servicingExceptions.runId, runId)
    });
    
    const report = {
      run: {
        runId: run.runId,
        valuationDate: run.valuationDate,
        status: run.status,
        dryRun: run.dryRun,
        startTime: run.startTime,
        endTime: run.endTime,
        loansProcessed: run.loansProcessed,
        totalLoans: run.totalLoans,
        eventsCreated: run.eventsCreated,
        exceptionsCreated: run.exceptionsCreated,
        totalDisbursedBeneficiary: run.totalDisbursedBeneficiary,
        totalDisbursedInvestors: run.totalDisbursedInvestors,
        reconciliationStatus: run.reconciliationStatus
      },
      events: events.map(e => ({
        eventType: e.eventType,
        loanId: e.loanId,
        amount: e.amount,
        status: e.status,
        timestamp: e.timestamp
      })),
      exceptions: exceptions.map(e => ({
        loanId: e.loanId,
        severity: e.severity,
        type: e.type,
        message: e.message,
        status: e.status
      })),
      summary: {
        eventsByType: events.reduce((acc, e) => {
          acc[e.eventType] = (acc[e.eventType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        exceptionsBySeverity: exceptions.reduce((acc, e) => {
          acc[e.severity] = (acc[e.severity] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      }
    };
    
    if (format === 'csv') {
      // Convert to CSV format
      const csv = convertToCSV(report);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=servicing-run-${runId}.csv`);
      res.send(csv);
    } else {
      res.json(report);
    }
  } catch (error) {
    console.error('Error exporting report:', error);
    res.status(500).json({ error: 'Failed to export report' });
  }
});

// Helper function to convert report to CSV
function convertToCSV(report: any): string {
  const lines: string[] = [];
  
  // Run summary
  lines.push('RUN SUMMARY');
  lines.push('Field,Value');
  Object.entries(report.run).forEach(([key, value]) => {
    lines.push(`${key},"${value}"`);
  });
  lines.push('');
  
  // Events
  lines.push('EVENTS');
  lines.push('Event Type,Loan ID,Amount,Status,Timestamp');
  report.events.forEach((e: any) => {
    lines.push(`${e.eventType},${e.loanId},${e.amount},${e.status},"${e.timestamp}"`);
  });
  lines.push('');
  
  // Exceptions
  lines.push('EXCEPTIONS');
  lines.push('Loan ID,Severity,Type,Message,Status');
  report.exceptions.forEach((e: any) => {
    lines.push(`${e.loanId},${e.severity},${e.type},"${e.message}",${e.status}`);
  });
  
  return lines.join('\n');
}

export default router;