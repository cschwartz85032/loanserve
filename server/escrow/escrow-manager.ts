/**
 * Escrow Manager
 * 
 * Coordinates all escrow subsystem components:
 * - Forecast consumer
 * - Disbursement consumer
 * - Analysis consumer
 * - Daily servicing cycle
 */

import { EscrowForecastConsumer } from './forecast-consumer';
import { EscrowDisbursementConsumer } from './disbursement-consumer';
import { EscrowAnalysisConsumer } from './analysis-consumer';
import { EscrowDailyCycle } from './daily-cycle';

export class EscrowManager {
  private forecastConsumer: EscrowForecastConsumer;
  private disbursementConsumer: EscrowDisbursementConsumer;
  private analysisConsumer: EscrowAnalysisConsumer;
  private dailyCycle: EscrowDailyCycle;
  private isRunning: boolean = false;
  
  constructor() {
    this.forecastConsumer = new EscrowForecastConsumer();
    this.disbursementConsumer = new EscrowDisbursementConsumer();
    this.analysisConsumer = new EscrowAnalysisConsumer();
    this.dailyCycle = new EscrowDailyCycle();
  }
  
  /**
   * Start all escrow consumers and services
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[EscrowManager] Already running');
      return;
    }
    
    console.log('[EscrowManager] Starting escrow subsystem...');
    
    try {
      // Start consumers in parallel
      await Promise.all([
        this.forecastConsumer.start(),
        this.disbursementConsumer.start(),
        this.analysisConsumer.start()
      ]);
      
      // Schedule daily cycle (runs at 2 AM by default)
      this.dailyCycle.scheduleDaily(2, 0);
      
      this.isRunning = true;
      console.log('[EscrowManager] Escrow subsystem started successfully');
      
    } catch (error) {
      console.error('[EscrowManager] Failed to start escrow subsystem:', error);
      
      // Try to stop any started consumers
      await this.stop();
      throw error;
    }
  }
  
  /**
   * Stop all escrow consumers and services
   */
  async stop(): Promise<void> {
    console.log('[EscrowManager] Stopping escrow subsystem...');
    
    const stopTasks = [];
    
    // Stop consumers
    try {
      stopTasks.push(this.forecastConsumer.stop());
    } catch (error) {
      console.error('[EscrowManager] Error stopping forecast consumer:', error);
    }
    
    try {
      stopTasks.push(this.disbursementConsumer.stop());
    } catch (error) {
      console.error('[EscrowManager] Error stopping disbursement consumer:', error);
    }
    
    try {
      stopTasks.push(this.analysisConsumer.stop());
    } catch (error) {
      console.error('[EscrowManager] Error stopping analysis consumer:', error);
    }
    
    await Promise.allSettled(stopTasks);
    
    this.isRunning = false;
    console.log('[EscrowManager] Escrow subsystem stopped');
  }
  
  /**
   * Run escrow daily cycle manually
   */
  async runDailyCycle(cycleDate?: string): Promise<void> {
    const date = cycleDate || new Date().toISOString().split('T')[0];
    console.log(`[EscrowManager] Running manual escrow cycle for ${date}`);
    
    try {
      await this.dailyCycle.runCycle(date);
      console.log('[EscrowManager] Manual escrow cycle completed');
    } catch (error) {
      console.error('[EscrowManager] Manual escrow cycle failed:', error);
      throw error;
    }
  }
  
  /**
   * Get subsystem status
   */
  getStatus(): {
    isRunning: boolean;
    consumers: {
      forecast: boolean;
      disbursement: boolean;
      analysis: boolean;
    };
  } {
    return {
      isRunning: this.isRunning,
      consumers: {
        forecast: this.isRunning,
        disbursement: this.isRunning,
        analysis: this.isRunning
      }
    };
  }
}

// Singleton instance
let escrowManager: EscrowManager | null = null;

/**
 * Get or create the escrow manager instance
 */
export function getEscrowManager(): EscrowManager {
  if (!escrowManager) {
    escrowManager = new EscrowManager();
  }
  return escrowManager;
}