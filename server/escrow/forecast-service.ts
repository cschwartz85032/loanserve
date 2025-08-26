/**
 * Escrow Forecast Service
 * 
 * Generates 12-month rolling forecasts for escrow disbursements
 * based on configured escrow items and payment schedules
 */

import { pool } from '../db';
import { randomUUID } from 'crypto';
import type { EscrowForecast, EscrowForecastRequest, EscrowForecastResponse } from './types';

export class EscrowForecastService {
  constructor(private db = pool) {}

  /**
   * Generate 12-month rolling forecast for a loan
   */
  async generateForecast(request: EscrowForecastRequest): Promise<EscrowForecastResponse> {
    const { loan_id, as_of_date, correlation_id } = request;
    
    console.log(`[EscrowForecast] Generating forecast for loan ${loan_id} as of ${as_of_date}`);
    
    try {
      // Begin transaction
      await this.db.query('BEGIN');
      
      // Clear existing forecasts for this loan
      await this.db.query(
        'DELETE FROM escrow_forecast WHERE loan_id = $1',
        [loan_id]
      );
      
      // Get active escrow disbursements for the loan (single source of truth)
      const escrowItemsResult = await this.db.query(`
        SELECT 
          ed.id as escrow_id,
          ed.disbursement_type as escrow_type,
          ed.payee_name,
          ed.payment_amount as amount,
          EXTRACT(DAY FROM ed.next_due_date)::integer as due_day,
          ed.frequency,
          ed.next_due_date
        FROM escrow_disbursements ed
        WHERE ed.loan_id = $1
          AND ed.status = 'active'
          AND ed.is_on_hold = false
        ORDER BY ed.disbursement_type, ed.payee_name
      `, [loan_id]);
      
      if (escrowItemsResult.rows.length === 0) {
        console.log(`[EscrowForecast] No active escrow disbursements for loan ${loan_id}`);
        await this.db.query('COMMIT');
        return {
          loan_id,
          forecasts: [],
          correlation_id
        };
      }
      
      const forecasts: Array<{
        escrow_id: number;
        due_date: string;
        amount_minor: string;
      }> = [];
      
      const asOfDate = new Date(as_of_date);
      const endDate = new Date(asOfDate);
      endDate.setFullYear(endDate.getFullYear() + 1); // 12 months forward
      
      // Generate forecast for each escrow disbursement
      for (const item of escrowItemsResult.rows) {
        const itemForecasts = await this.generateItemForecast(
          loan_id,
          item.escrow_id,
          item.amount || '0',
          item.frequency || 'monthly',
          item.next_due_date || asOfDate.toISOString().split('T')[0],
          asOfDate,
          endDate
        );
        
        forecasts.push(...itemForecasts);
      }
      
      // Sort forecasts by due date
      forecasts.sort((a, b) => a.due_date.localeCompare(b.due_date));
      
      await this.db.query('COMMIT');
      
      console.log(`[EscrowForecast] Generated ${forecasts.length} forecast entries for loan ${loan_id}`);
      
      return {
        loan_id,
        forecasts,
        correlation_id
      };
      
    } catch (error) {
      await this.db.query('ROLLBACK');
      console.error('[EscrowForecast] Error generating forecast:', error);
      throw error;
    }
  }
  
  /**
   * Generate forecast for a single escrow disbursement
   */
  private async generateItemForecast(
    loan_id: number,
    escrow_id: number,
    amount: string,
    frequency: string,
    startDate: string,
    asOfDate: Date,
    endDate: Date
  ): Promise<Array<{ escrow_id: number; due_date: string; amount_minor: string }>> {
    const forecasts: Array<{ escrow_id: number; due_date: string; amount_minor: string }> = [];
    
    // Convert amount to minor units (cents)
    const amountMinor = Math.round(parseFloat(amount) * 100);
    
    let currentDate = new Date(startDate);
    
    // Skip past dates
    while (currentDate < asOfDate) {
      currentDate = this.getNextDueDate(currentDate, frequency);
    }
    
    // Generate forecasts up to end date
    while (currentDate <= endDate) {
      const dueDate = currentDate.toISOString().split('T')[0];
      
      // Insert forecast record
      await this.db.query(`
        INSERT INTO escrow_forecast (
          forecast_id,
          loan_id,
          escrow_id,
          due_date,
          amount_minor,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (loan_id, escrow_id, due_date) DO UPDATE
        SET amount_minor = $5, created_at = NOW()
      `, [randomUUID(), loan_id, escrow_id, dueDate, amountMinor]);
      
      forecasts.push({
        escrow_id,
        due_date: dueDate,
        amount_minor: amountMinor.toString()
      });
      
      // Move to next due date
      currentDate = this.getNextDueDate(currentDate, frequency);
    }
    
    return forecasts;
  }
  
  /**
   * Calculate next due date based on frequency
   */
  private getNextDueDate(currentDate: Date, frequency: string): Date {
    const nextDate = new Date(currentDate);
    
    switch (frequency) {
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case 'quarterly':
        nextDate.setMonth(nextDate.getMonth() + 3);
        break;
      case 'semi_annual':
        nextDate.setMonth(nextDate.getMonth() + 6);
        break;
      case 'annual':
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
      case 'once':
        // For one-time payments, move far into future to stop iteration
        nextDate.setFullYear(nextDate.getFullYear() + 100);
        break;
      default:
        // Default to monthly if unknown
        nextDate.setMonth(nextDate.getMonth() + 1);
    }
    
    return nextDate;
  }
  
  /**
   * Get existing forecast for a loan
   */
  async getForecast(loan_id: number): Promise<EscrowForecast[]> {
    const result = await this.db.query(`
      SELECT 
        forecast_id,
        loan_id,
        escrow_id,
        due_date,
        amount_minor,
        created_at
      FROM escrow_forecast
      WHERE loan_id = $1
      ORDER BY due_date, escrow_id
    `, [loan_id]);
    
    return result.rows.map(row => ({
      forecast_id: row.forecast_id,
      loan_id: row.loan_id,
      escrow_id: row.escrow_id,
      due_date: row.due_date.toISOString().split('T')[0],
      amount_minor: BigInt(row.amount_minor),
      created_at: row.created_at
    }));
  }
  
  /**
   * Get forecast summary for a date range
   */
  async getForecastSummary(
    loan_id: number,
    startDate: string,
    endDate: string
  ): Promise<{ total_amount_minor: bigint; payment_count: number }> {
    const result = await this.db.query(`
      SELECT 
        COALESCE(SUM(amount_minor), 0) as total_amount_minor,
        COUNT(*) as payment_count
      FROM escrow_forecast
      WHERE loan_id = $1
        AND due_date >= $2
        AND due_date <= $3
    `, [loan_id, startDate, endDate]);
    
    return {
      total_amount_minor: BigInt(result.rows[0].total_amount_minor || 0),
      payment_count: parseInt(result.rows[0].payment_count || 0)
    };
  }
}