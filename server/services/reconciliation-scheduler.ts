/**
 * Reconciliation Scheduler Service
 * Manages scheduled daily reconciliation tasks
 */

import { dailyReconciler } from './daily-reconciler';
import { db } from '../db';
import { outboxMessages } from '@shared/schema';
import { randomUUID } from 'crypto';

export class ReconciliationScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Start the reconciliation scheduler
   * Runs daily at 2 AM UTC
   */
  start(): void {
    if (this.intervalId) {
      console.log('[ReconciliationScheduler] Already running');
      return;
    }

    console.log('[ReconciliationScheduler] Starting daily reconciliation scheduler');

    // Run immediately on startup if needed
    this.checkAndRunReconciliation();

    // Schedule daily run at 2 AM UTC
    this.intervalId = setInterval(() => {
      this.checkAndRunReconciliation();
    }, 60 * 60 * 1000); // Check every hour

    console.log('[ReconciliationScheduler] Scheduler started');
  }

  /**
   * Stop the reconciliation scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[ReconciliationScheduler] Scheduler stopped');
    }
  }

  /**
   * Check if reconciliation should run and execute if needed
   */
  private async checkAndRunReconciliation(): Promise<void> {
    const now = new Date();
    const currentHour = now.getUTCHours();

    // Run at 2 AM UTC
    if (currentHour === 2 && !this.isRunning) {
      await this.runDailyReconciliation();
    }
  }

  /**
   * Run daily reconciliation for yesterday's transactions
   */
  async runDailyReconciliation(): Promise<void> {
    if (this.isRunning) {
      console.log('[ReconciliationScheduler] Reconciliation already in progress');
      return;
    }

    this.isRunning = true;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    try {
      console.log(`[ReconciliationScheduler] Starting daily reconciliation for ${yesterday.toISOString().split('T')[0]}`);

      // Publish reconciliation start event
      await db.insert(outboxMessages).values({
        aggregateType: 'reconciliation',
        aggregateId: randomUUID(),
        eventType: 'reconciliation.started',
        payload: {
          date: yesterday.toISOString().split('T')[0],
          startedAt: new Date().toISOString()
        }
      });

      // Run reconciliation
      const results = await dailyReconciler.reconcileDay(yesterday);

      // Calculate summary
      const summary = {
        date: yesterday.toISOString().split('T')[0],
        totalChannels: results.length,
        balanced: results.filter(r => r.status === 'balanced').length,
        variances: results.filter(r => r.status === 'variance').length,
        totalVariance: results.reduce((sum, r) => sum + Math.abs(r.variance), 0)
      };

      // Publish completion event
      await db.insert(outboxMessages).values({
        aggregateType: 'reconciliation',
        aggregateId: randomUUID(),
        eventType: 'reconciliation.completed',
        payload: {
          ...summary,
          completedAt: new Date().toISOString(),
          results
        }
      });

      console.log(`[ReconciliationScheduler] Daily reconciliation completed:`, summary);

      // Send notification if variances detected
      if (summary.variances > 0) {
        await this.sendVarianceNotification(summary, results);
      }

    } catch (error) {
      console.error('[ReconciliationScheduler] Error during daily reconciliation:', error);

      // Publish error event
      await db.insert(outboxMessages).values({
        aggregateType: 'reconciliation',
        aggregateId: randomUUID(),
        eventType: 'reconciliation.failed',
        payload: {
          date: yesterday.toISOString().split('T')[0],
          error: error instanceof Error ? error.message : 'Unknown error',
          failedAt: new Date().toISOString()
        }
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Send notification about variance detection
   */
  private async sendVarianceNotification(
    summary: any,
    results: any[]
  ): Promise<void> {
    const varianceDetails = results
      .filter(r => r.status === 'variance')
      .map(r => ({
        channel: r.channel,
        variance: r.variance,
        bankTotal: r.bankTotal,
        sorTotal: r.sorTotal,
        missingCount: r.missingIdentifiers?.length || 0,
        excessCount: r.excessIdentifiers?.length || 0
      }));

    await db.insert(outboxMessages).values({
      aggregateType: 'notification',
      aggregateId: randomUUID(),
      eventType: 'notification.variance_alert',
      payload: {
        type: 'reconciliation_variance',
        date: summary.date,
        totalVariance: summary.totalVariance,
        channelsAffected: summary.variances,
        details: varianceDetails,
        message: `Reconciliation variance detected: $${summary.totalVariance.toFixed(2)} across ${summary.variances} channels`,
        severity: summary.totalVariance > 10000 ? 'critical' : 'warning'
      }
    });
  }

  /**
   * Manually trigger reconciliation for a specific date
   */
  async runReconciliationForDate(date: Date): Promise<any> {
    console.log(`[ReconciliationScheduler] Manual reconciliation triggered for ${date.toISOString().split('T')[0]}`);
    
    try {
      const results = await dailyReconciler.reconcileDay(date);
      
      console.log(`[ReconciliationScheduler] Manual reconciliation completed for ${date.toISOString().split('T')[0]}`);
      
      return {
        success: true,
        date: date.toISOString().split('T')[0],
        results
      };
    } catch (error) {
      console.error('[ReconciliationScheduler] Manual reconciliation failed:', error);
      
      return {
        success: false,
        date: date.toISOString().split('T')[0],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Run reconciliation for a date range
   */
  async runReconciliationForDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    console.log(`[ReconciliationScheduler] Batch reconciliation for ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    
    try {
      const results = await dailyReconciler.reconcileDateRange(startDate, endDate);
      
      const summary = {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        daysProcessed: results.length,
        totalVariances: results.filter(r => r.status === 'variance').length,
        totalVarianceAmount: results.reduce((sum, r) => sum + Math.abs(r.variance), 0)
      };
      
      console.log(`[ReconciliationScheduler] Batch reconciliation completed:`, summary);
      
      return {
        success: true,
        ...summary,
        results
      };
    } catch (error) {
      console.error('[ReconciliationScheduler] Batch reconciliation failed:', error);
      
      return {
        success: false,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export singleton instance
export const reconciliationScheduler = new ReconciliationScheduler();