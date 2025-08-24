import { db } from '../db';
import { reconciliations, exceptionCases } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import Decimal from 'decimal.js';

export interface Reconciliation {
  id?: string;
  channel: string;
  periodStart: string;  // date string
  periodEnd: string;    // date string
  bankTotal: string | number;
  sorTotal: string | number;
  variance?: string | number;
  status?: 'open' | 'balanced' | 'variance';
  details?: any;
}

export class ReconciliationService {
  /**
   * Create or update a reconciliation for a channel and period
   */
  async createOrUpdateReconciliation(recon: Reconciliation): Promise<Reconciliation> {
    // Calculate variance
    const bankTotal = new Decimal(recon.bankTotal);
    const sorTotal = new Decimal(recon.sorTotal);
    const variance = bankTotal.minus(sorTotal);
    
    // Determine status based on variance
    let status: 'open' | 'balanced' | 'variance' = 'open';
    if (variance.equals(0)) {
      status = 'balanced';
    } else if (!variance.equals(0)) {
      status = 'variance';
    }

    // Check if reconciliation already exists for this channel and period
    const [existing] = await db
      .select()
      .from(reconciliations)
      .where(
        and(
          eq(reconciliations.channel, recon.channel),
          eq(reconciliations.periodStart, recon.periodStart),
          eq(reconciliations.periodEnd, recon.periodEnd)
        )
      );

    if (existing) {
      // Update existing reconciliation
      const [updated] = await db
        .update(reconciliations)
        .set({
          bankTotal: bankTotal.toString(),
          sorTotal: sorTotal.toString(),
          variance: variance.toString(),
          status,
          details: recon.details
        })
        .where(eq(reconciliations.id, existing.id))
        .returning();

      console.log(`[Reconciliation] Updated reconciliation ${updated.id} for ${recon.channel} (${recon.periodStart} to ${recon.periodEnd}): status=${status}, variance=${variance}`);
      
      // If variance, create exception case
      if (status === 'variance') {
        await this.createExceptionCase(updated.id, recon.channel, variance.toString(), recon.periodStart, recon.periodEnd);
      }

      return updated as Reconciliation;
    } else {
      // Create new reconciliation
      const [created] = await db
        .insert(reconciliations)
        .values({
          channel: recon.channel,
          periodStart: recon.periodStart,
          periodEnd: recon.periodEnd,
          bankTotal: bankTotal.toString(),
          sorTotal: sorTotal.toString(),
          variance: variance.toString(),
          status,
          details: recon.details
        })
        .returning();

      console.log(`[Reconciliation] Created reconciliation ${created.id} for ${recon.channel} (${recon.periodStart} to ${recon.periodEnd}): status=${status}, variance=${variance}`);
      
      // If variance, create exception case
      if (status === 'variance') {
        await this.createExceptionCase(created.id, recon.channel, variance.toString(), recon.periodStart, recon.periodEnd);
      }

      return created as Reconciliation;
    }
  }

  /**
   * Create an exception case for a reconciliation variance
   */
  private async createExceptionCase(
    reconciliationId: string,
    channel: string,
    variance: string,
    periodStart: string,
    periodEnd: string
  ): Promise<void> {
    const severity = this.determineSeverity(variance);
    
    const [exceptionCase] = await db
      .insert(exceptionCases)
      .values({
        exceptionType: 'reconciliation_variance',
        severity,
        aiAnalysis: {
          reconciliationId,
          channel,
          variance,
          periodStart,
          periodEnd,
          message: `Reconciliation variance detected for ${channel} channel`,
          suggestedActions: [
            'Review bank statement for missing transactions',
            'Check for duplicate entries in system of record',
            'Verify payment processing delays',
            'Investigate refunds or reversals'
          ]
        },
        suggestedAction: `Investigate variance of ${variance} for ${channel} channel between ${periodStart} and ${periodEnd}`,
        status: 'open',
        assignedTo: null
      })
      .returning();

    console.log(`[Reconciliation] Created exception case ${exceptionCase.id} for reconciliation variance: ${variance}`);
  }

  /**
   * Determine severity based on variance amount
   */
  private determineSeverity(variance: string): 'low' | 'medium' | 'high' | 'critical' {
    const absVariance = new Decimal(variance).abs();
    
    if (absVariance.lessThan(100)) {
      return 'low';
    } else if (absVariance.lessThan(1000)) {
      return 'medium';
    } else if (absVariance.lessThan(10000)) {
      return 'high';
    } else {
      return 'critical';
    }
  }

  /**
   * Get reconciliation by ID
   */
  async getReconciliationById(id: string): Promise<Reconciliation | null> {
    const [recon] = await db
      .select()
      .from(reconciliations)
      .where(eq(reconciliations.id, id));

    return recon as Reconciliation || null;
  }

  /**
   * Get reconciliation for a specific channel and period
   */
  async getReconciliationByChannelPeriod(
    channel: string,
    periodStart: string,
    periodEnd: string
  ): Promise<Reconciliation | null> {
    const [recon] = await db
      .select()
      .from(reconciliations)
      .where(
        and(
          eq(reconciliations.channel, channel),
          eq(reconciliations.periodStart, periodStart),
          eq(reconciliations.periodEnd, periodEnd)
        )
      );

    return recon as Reconciliation || null;
  }

  /**
   * Perform reconciliation for a channel and period
   */
  async performReconciliation(
    channel: string,
    periodStart: string,
    periodEnd: string,
    bankTotal: number,
    sorTotal: number,
    details?: any
  ): Promise<Reconciliation> {
    return this.createOrUpdateReconciliation({
      channel,
      periodStart,
      periodEnd,
      bankTotal,
      sorTotal,
      details
    });
  }

  /**
   * Get all reconciliations with variance
   */
  async getReconciliationsWithVariance(): Promise<Reconciliation[]> {
    const recons = await db
      .select()
      .from(reconciliations)
      .where(eq(reconciliations.status, 'variance'));

    return recons as Reconciliation[];
  }

  /**
   * Get all balanced reconciliations
   */
  async getBalancedReconciliations(): Promise<Reconciliation[]> {
    const recons = await db
      .select()
      .from(reconciliations)
      .where(eq(reconciliations.status, 'balanced'));

    return recons as Reconciliation[];
  }

  /**
   * Mark reconciliation as resolved
   */
  async markResolved(
    id: string,
    resolutionDetails: any
  ): Promise<void> {
    await db
      .update(reconciliations)
      .set({
        status: 'balanced',
        details: resolutionDetails
      })
      .where(eq(reconciliations.id, id));

    console.log(`[Reconciliation] Marked reconciliation ${id} as resolved`);
  }
}