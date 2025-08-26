import { Pool } from '@neondatabase/serverless';
import { RemittanceRepository } from './repo.js';
import { addDays, startOfMonth, endOfMonth, isBefore, isAfter, isWeekend, format } from 'date-fns';

export class RemittanceScheduler {
  private repo: RemittanceRepository;
  private intervalId?: NodeJS.Timeout;

  constructor(private pool: Pool) {
    this.repo = new RemittanceRepository(pool);
  }

  // Calculate business days (excluding weekends for now, holidays configurable later)
  private addBusinessDays(date: Date, days: number): Date {
    let result = new Date(date);
    let addedDays = 0;
    
    while (addedDays < days) {
      result = addDays(result, 1);
      if (!isWeekend(result)) {
        addedDays++;
      }
    }
    
    return result;
  }

  // Calculate period bounds based on cutoff day
  private calculatePeriodBounds(cutoffDay: number, referenceDate: Date = new Date()): {
    periodStart: Date;
    periodEnd: Date;
    settlementDate: Date;
    remittanceDays: number;
  } {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    
    // Cutoff date for current month
    const cutoffDate = new Date(year, month, Math.min(cutoffDay, new Date(year, month + 1, 0).getDate()));
    
    let periodStart: Date;
    let periodEnd: Date;
    
    // If we're past the cutoff, period is from cutoff to end of month
    if (isAfter(referenceDate, cutoffDate)) {
      periodStart = cutoffDate;
      periodEnd = endOfMonth(cutoffDate);
    } else {
      // If before cutoff, period is previous month's cutoff to this month's cutoff
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const prevCutoffDay = Math.min(cutoffDay, new Date(prevYear, prevMonth + 1, 0).getDate());
      periodStart = new Date(prevYear, prevMonth, prevCutoffDay);
      periodEnd = cutoffDate;
    }
    
    // Settlement date is N business days after period end (will be set from contract)
    const settlementDate = periodEnd; // Will be calculated based on remittance_day
    const remittanceDays = 5; // Default, will come from contract
    
    return { periodStart, periodEnd, settlementDate, remittanceDays };
  }

  // Process all contracts and manage their cycles
  async processCycles(): Promise<void> {
    console.log('[RemittanceScheduler] Processing cycles...');
    const now = new Date();
    
    try {
      // Get all active contracts
      const contractsResult = await this.pool.query(
        `SELECT * FROM investor_contract WHERE status = 'active'`
      );
      const contracts = contractsResult.rows;
      
      for (const contract of contracts) {
        await this.processContractCycle(contract, now);
      }
      
      // Auto-close cycles past their period_end
      await this.closeExpiredCycles(now);
      
      // Auto-lock cycles ready for export
      await this.lockCyclesForExport(now);
      
      // Auto-settle cycles on their settlement date
      await this.settleCyclesOnSchedule(now);
      
      console.log('[RemittanceScheduler] Cycle processing complete');
    } catch (error) {
      console.error('[RemittanceScheduler] Error processing cycles:', error);
    }
  }

  // Process individual contract cycle
  private async processContractCycle(contract: any, now: Date): Promise<void> {
    // Check if there's an open cycle for this contract
    const existingCycleResult = await this.pool.query(
      `SELECT * FROM remittance_cycle 
       WHERE contract_id = $1 
       AND status IN ('open', 'locked')
       ORDER BY created_at DESC
       LIMIT 1`,
      [contract.contract_id]
    );
    
    const existingCycle = existingCycleResult.rows[0];
    
    // Calculate current period bounds
    const bounds = this.calculatePeriodBounds(contract.cutoff_day, now);
    
    // If no open cycle exists and we're in a new period, create one
    if (!existingCycle || (existingCycle.status === 'settled' && isAfter(now, bounds.periodStart))) {
      // Check if we already have a cycle for this period
      const periodCycleResult = await this.pool.query(
        `SELECT * FROM remittance_cycle 
         WHERE contract_id = $1 
         AND period_start = $2 
         AND period_end = $3`,
        [contract.contract_id, bounds.periodStart, bounds.periodEnd]
      );
      
      if (periodCycleResult.rows.length === 0) {
        // Create new cycle
        const settlementDate = this.addBusinessDays(bounds.periodEnd, contract.remittance_day);
        
        await this.pool.query(
          `INSERT INTO remittance_cycle (
            contract_id, 
            period_start, 
            period_end,
            settlement_date,
            status,
            total_principal_minor,
            total_interest_minor,
            total_fees_minor,
            servicer_fee_minor,
            investor_due_minor
          ) VALUES ($1, $2, $3, $4, 'open', '0', '0', '0', '0', '0')
          RETURNING cycle_id`,
          [
            contract.contract_id,
            bounds.periodStart,
            bounds.periodEnd,
            settlementDate
          ]
        );
        
        console.log(`[RemittanceScheduler] Created new cycle for contract ${contract.contract_id}`);
      }
    }
  }

  // Close cycles that have passed their period_end
  private async closeExpiredCycles(now: Date): Promise<void> {
    const result = await this.pool.query(
      `UPDATE remittance_cycle 
       SET status = 'closed'
       WHERE status = 'open' 
       AND period_end < $1
       RETURNING cycle_id, contract_id`,
      [now]
    );
    
    if (result.rows.length > 0) {
      console.log(`[RemittanceScheduler] Closed ${result.rows.length} expired cycles`);
      
      // Trigger waterfall calculation for each closed cycle
      for (const cycle of result.rows) {
        try {
          // Import service to calculate waterfall
          const { RemittanceService } = await import('./service.js');
          const { PgLedgerRepository } = await import('../db/ledger-repository.js');
          const ledgerRepo = new PgLedgerRepository(this.pool);
          const service = new RemittanceService(this.pool, ledgerRepo);
          
          await service.calculateWaterfall(cycle.cycle_id);
          console.log(`[RemittanceScheduler] Calculated waterfall for cycle ${cycle.cycle_id}`);
          
          // After calculation, lock the cycle for export
          await this.pool.query(
            `UPDATE remittance_cycle SET status = 'locked' WHERE cycle_id = $1`,
            [cycle.cycle_id]
          );
        } catch (error) {
          console.error(`[RemittanceScheduler] Error calculating waterfall for cycle ${cycle.cycle_id}:`, error);
        }
      }
    }
  }

  // Lock cycles that are ready for export (after calculation)
  private async lockCyclesForExport(now: Date): Promise<void> {
    // This is now handled in closeExpiredCycles after waterfall calculation
    // Kept for backward compatibility but can be removed
    const result = await this.pool.query(
      `UPDATE remittance_cycle 
       SET status = 'locked'
       WHERE status = 'closed' 
       AND total_principal_minor IS NOT NULL
       AND total_interest_minor IS NOT NULL
       AND status != 'locked'
       RETURNING cycle_id`
    );
    
    if (result.rows.length > 0) {
      console.log(`[RemittanceScheduler] Locked ${result.rows.length} cycles for export`);
    }
  }

  // Settle cycles on their scheduled settlement date
  private async settleCyclesOnSchedule(now: Date): Promise<void> {
    const result = await this.pool.query(
      `SELECT cycle_id FROM remittance_cycle 
       WHERE status = 'locked' 
       AND settlement_date <= $1`,
      [now]
    );
    
    if (result.rows.length > 0) {
      console.log(`[RemittanceScheduler] Found ${result.rows.length} cycles ready for settlement`);
      
      for (const row of result.rows) {
        try {
          // Import service to settle remittance
          const { RemittanceService } = await import('./service.js');
          const { PgLedgerRepository } = await import('../db/ledger-repository.js');
          const ledgerRepo = new PgLedgerRepository(this.pool);
          const service = new RemittanceService(this.pool, ledgerRepo);
          
          await service.settleRemittance(row.cycle_id);
          console.log(`[RemittanceScheduler] Settled cycle ${row.cycle_id}`);
        } catch (error) {
          console.error(`[RemittanceScheduler] Error settling cycle ${row.cycle_id}:`, error);
        }
      }
    }
  }

  // Start the scheduler with daily runs
  start(): void {
    // Run immediately on start
    this.processCycles();
    
    // Schedule to run daily at 2 AM
    const now = new Date();
    const tomorrow2AM = new Date(now);
    tomorrow2AM.setDate(tomorrow2AM.getDate() + 1);
    tomorrow2AM.setHours(2, 0, 0, 0);
    
    // If it's already past 2 AM today, use today's 2 AM
    if (now.getHours() < 2) {
      tomorrow2AM.setDate(now.getDate());
    }
    
    const msUntil2AM = tomorrow2AM.getTime() - now.getTime();
    
    // Schedule first run at 2 AM
    setTimeout(() => {
      // Run immediately
      this.processCycles();
      
      // Then schedule daily runs
      this.intervalId = setInterval(() => {
        this.processCycles();
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntil2AM);
    
    const hoursUntil = Math.round(msUntil2AM / (1000 * 60 * 60));
    console.log(`[RemittanceScheduler] Started. Next run in ${hoursUntil} hours at 2 AM`);
  }

  // Stop the scheduler
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      console.log('[RemittanceScheduler] Stopped');
    }
  }

  // Manual trigger for testing
  async runNow(): Promise<void> {
    await this.processCycles();
  }
}