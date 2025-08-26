/**
 * Escrow Daily Servicing Cycle
 * 
 * Coordinates daily escrow operations including:
 * - Forecast generation
 * - Disbursement scheduling
 * - Due disbursement processing
 * - Annual analysis (when required)
 */

import { getEnhancedRabbitMQService as getRabbitMQService } from '../services/rabbitmq-enhanced';
import { EscrowForecastService } from './forecast-service';
import { EscrowDisbursementService } from './disbursement-service';
import { EscrowAnalysisService } from './analysis-service';
import { pool } from '../db';

export class EscrowDailyCycle {
  private forecastService: EscrowForecastService;
  private disbursementService: EscrowDisbursementService;
  private analysisService: EscrowAnalysisService;
  
  constructor() {
    this.forecastService = new EscrowForecastService();
    this.disbursementService = new EscrowDisbursementService();
    this.analysisService = new EscrowAnalysisService();
  }
  
  /**
   * Run daily escrow cycle
   */
  async runCycle(cycleDate: string): Promise<void> {
    const startTime = Date.now();
    console.log(`[EscrowCycle] Starting daily escrow cycle for ${cycleDate}`);
    
    try {
      const stats = {
        loansProcessed: 0,
        forecastsGenerated: 0,
        disbursementsScheduled: 0,
        disbursementsPosted: 0,
        analysesPerformed: 0,
        errors: [] as string[]
      };
      
      // Step 1: Process due disbursements
      console.log('[EscrowCycle] Step 1: Processing due disbursements');
      try {
        const postedCount = await this.disbursementService.processDueDisbursements(cycleDate);
        stats.disbursementsPosted = postedCount;
      } catch (error) {
        console.error('[EscrowCycle] Error processing disbursements:', error);
        stats.errors.push(`Disbursement processing: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      // Step 2: Get loans requiring escrow processing
      const loansResult = await pool.query(`
        SELECT DISTINCT l.id, l.loan_number, ea.id as escrow_account_id
        FROM loans l
        JOIN escrow_accounts ea ON ea.loan_id = l.id
        WHERE l.status IN ('active', 'current', 'delinquent', 'default')
          AND ea.is_active = true
        ORDER BY l.id
      `);
      
      stats.loansProcessed = loansResult.rows.length;
      console.log(`[EscrowCycle] Processing ${stats.loansProcessed} loans with active escrow accounts`);
      
      const rabbitmq = getRabbitMQService();
      
      // Step 3: Generate forecasts for each loan
      console.log('[EscrowCycle] Step 2: Generating forecasts');
      for (const loan of loansResult.rows) {
        try {
          await rabbitmq.publishMessage(
            'escrow.saga',
            'forecast.request',
            {
              loan_id: loan.id,
              as_of_date: cycleDate,
              correlation_id: `cycle_forecast_${loan.id}_${cycleDate}`
            },
            { persistent: true }
          );
          stats.forecastsGenerated++;
        } catch (error) {
          console.error(`[EscrowCycle] Error queueing forecast for loan ${loan.id}:`, error);
          stats.errors.push(`Forecast loan ${loan.id}: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }
      
      // Step 4: Schedule upcoming disbursements
      console.log('[EscrowCycle] Step 3: Scheduling disbursements');
      for (const loan of loansResult.rows) {
        try {
          await rabbitmq.publishMessage(
            'escrow.saga',
            'disbursement.schedule',
            {
              loan_id: loan.id,
              effective_date: cycleDate,
              correlation_id: `cycle_disbursement_${loan.id}_${cycleDate}`
            },
            { persistent: true }
          );
          stats.disbursementsScheduled++;
        } catch (error) {
          console.error(`[EscrowCycle] Error queueing disbursement schedule for loan ${loan.id}:`, error);
          stats.errors.push(`Schedule loan ${loan.id}: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }
      
      // Step 5: Perform annual analysis for loans due
      console.log('[EscrowCycle] Step 4: Checking for required annual analyses');
      const analysisDate = new Date(cycleDate);
      
      // Check which loans need analysis (anniversary or shortage detected)
      const analysisDueResult = await pool.query(`
        SELECT l.id, l.loan_number
        FROM loans l
        JOIN escrow_accounts ea ON ea.loan_id = l.id
        WHERE l.status IN ('active', 'current', 'delinquent', 'default')
          AND ea.is_active = true
          AND (
            -- Anniversary analysis
            DATE_PART('month', l.closing_date) = DATE_PART('month', $1::date)
            AND DATE_PART('day', l.closing_date) = DATE_PART('day', $1::date)
            OR
            -- No analysis in last 11 months
            NOT EXISTS (
              SELECT 1 FROM escrow_analysis ea2
              WHERE ea2.loan_id = l.id
                AND ea2.as_of_date > $1::date - INTERVAL '11 months'
            )
          )
      `, [cycleDate]);
      
      for (const loan of analysisDueResult.rows) {
        try {
          await rabbitmq.publishMessage(
            'escrow.saga',
            'analysis.request',
            {
              loan_id: loan.id,
              as_of_date: cycleDate,
              generate_statement: true,
              correlation_id: `cycle_analysis_${loan.id}_${cycleDate}`
            },
            { persistent: true }
          );
          stats.analysesPerformed++;
          console.log(`[EscrowCycle] Queued annual analysis for loan ${loan.loan_number}`);
        } catch (error) {
          console.error(`[EscrowCycle] Error queueing analysis for loan ${loan.id}:`, error);
          stats.errors.push(`Analysis loan ${loan.id}: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }
      
      const duration = Date.now() - startTime;
      
      // Log cycle summary
      console.log('[EscrowCycle] ========================================');
      console.log(`[EscrowCycle] Daily Escrow Cycle Complete for ${cycleDate}`);
      console.log('[EscrowCycle] ----------------------------------------');
      console.log(`[EscrowCycle] Duration: ${duration}ms`);
      console.log(`[EscrowCycle] Loans Processed: ${stats.loansProcessed}`);
      console.log(`[EscrowCycle] Forecasts Generated: ${stats.forecastsGenerated}`);
      console.log(`[EscrowCycle] Disbursements Posted: ${stats.disbursementsPosted}`);
      console.log(`[EscrowCycle] Disbursements Scheduled: ${stats.disbursementsScheduled}`);
      console.log(`[EscrowCycle] Analyses Performed: ${stats.analysesPerformed}`);
      if (stats.errors.length > 0) {
        console.log(`[EscrowCycle] Errors: ${stats.errors.length}`);
        stats.errors.forEach(err => console.error(`[EscrowCycle]   - ${err}`));
      }
      console.log('[EscrowCycle] ========================================');
      
      // Publish cycle completion event
      await rabbitmq.publishMessage(
        'escrow.events',
        'cycle.completed',
        {
          cycleDate,
          stats,
          timestamp: new Date().toISOString()
        },
        { persistent: true }
      );
      
    } catch (error) {
      console.error('[EscrowCycle] Fatal error in daily cycle:', error);
      throw error;
    }
  }
  
  /**
   * Schedule daily cycle to run at specific time
   */
  scheduleDaily(hour: number = 2, minute: number = 0): void {
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(hour, minute, 0, 0);
    
    // If scheduled time has passed today, schedule for tomorrow
    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }
    
    const msUntilRun = scheduledTime.getTime() - now.getTime();
    
    console.log(`[EscrowCycle] Daily cycle scheduled for ${scheduledTime.toISOString()}`);
    console.log(`[EscrowCycle] Will run in ${Math.round(msUntilRun / 1000 / 60)} minutes`);
    
    setTimeout(() => {
      // Run the cycle
      const cycleDate = new Date().toISOString().split('T')[0];
      this.runCycle(cycleDate).catch(error => {
        console.error('[EscrowCycle] Daily cycle failed:', error);
      });
      
      // Schedule next run
      this.scheduleDaily(hour, minute);
    }, msUntilRun);
  }
}