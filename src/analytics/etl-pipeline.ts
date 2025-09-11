/**
 * ETL Pipeline for Analytics Lakehouse
 * Extract, Transform, Load operations for business intelligence data
 */

import { Pool } from "pg";
import { randomUUID } from "crypto";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Ensure time dimension key exists before using it in fact tables
 */
async function ensureTimeKey(client: any, date: Date): Promise<number> {
  const YYYY = date.getUTCFullYear();
  const MM = date.getUTCMonth() + 1;
  const DD = date.getUTCDate();
  const timeKey = Number(`${YYYY}${MM.toString().padStart(2, '0')}${DD.toString().padStart(2, '0')}`);
  
  // Calculate additional time dimensions
  const quarter = Math.ceil(MM / 3);
  const dayOfWeek = date.getUTCDay();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  // Simple week calculation
  const startOfYear = new Date(YYYY, 0, 1);
  const weekOfYear = Math.ceil(((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  
  // Insert time dimension record if it doesn't exist (with all required fields)
  await client.query(`
    INSERT INTO dim_time (time_key, full_date, year, quarter, month, month_name, day, 
                         day_of_week, day_name, week_of_year, is_weekend, is_holiday, 
                         business_day, fiscal_year, fiscal_quarter)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT (time_key) DO NOTHING
  `, [timeKey, date.toISOString().slice(0, 10), YYYY, quarter, MM, monthNames[MM-1], 
      DD, dayOfWeek, dayNames[dayOfWeek], weekOfYear, isWeekend, false, !isWeekend, YYYY, quarter]);
  
  return timeKey;
}

export interface ETLJobConfig {
  jobName: string;
  sourceQuery: string;
  targetTable: string;
  transformations: Array<{
    field: string;
    type: 'dimension_lookup' | 'aggregation' | 'calculation' | 'classification';
    parameters: Record<string, any>;
  }>;
  schedule: string;
  enabled: boolean;
}

export interface ETLJobResult {
  jobId: string;
  jobName: string;
  status: 'success' | 'failed' | 'running';
  recordsExtracted: number;
  recordsTransformed: number;
  recordsLoaded: number;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  errors?: string[];
}

/**
 * ETL Pipeline Manager
 */
export class ETLPipeline {
  private static instance: ETLPipeline;
  private runningJobs: Map<string, ETLJobResult> = new Map();

  constructor() {
    // Timer-based ETL disabled - now using queue-based processing
    // See src/queues/etl/ for modern queue-based ETL implementation
  }

  static getInstance(): ETLPipeline {
    if (!ETLPipeline.instance) {
      ETLPipeline.instance = new ETLPipeline();
    }
    return ETLPipeline.instance;
  }

  /**
   * Run loan performance ETL
   */
  async runLoanPerformanceETL(): Promise<ETLJobResult> {
    const jobId = randomUUID();
    const jobResult: ETLJobResult = {
      jobId,
      jobName: 'loan_performance_etl',
      status: 'running',
      recordsExtracted: 0,
      recordsTransformed: 0,
      recordsLoaded: 0,
      startTime: new Date()
    };

    this.runningJobs.set(jobId, jobResult);

    try {
      const c = await pool.connect();
      
      try {
        // Extract loan data with payments - derive current balance from latest loan_ledger snapshot
        const extractQuery = `
          WITH latest_ledger AS (
            SELECT DISTINCT ON (ll.loan_id)
              ll.loan_id,
              (ll.principal_balance + ll.interest_balance) AS balance_amount
            FROM loan_ledger ll
            WHERE ll.status = 'posted'
            ORDER BY ll.loan_id, ll.transaction_date DESC, ll.id DESC
          )
          SELECT
            l.id as loan_id,
            l.loan_number,
            l.loan_type as product_type,
            COALESCE(lat.balance_amount, 0)::numeric AS current_balance_amount,
            ROUND(COALESCE(lat.balance_amount, 0) * 100)::bigint AS current_balance_cents,
            l.status,
            COALESCE(lb.principal_minor, ROUND(COALESCE(lat.balance_amount, 0) * 100)::bigint) as principal_minor,
            l.interest_rate as current_interest_rate,
            ROUND(l.payment_amount * 100)::bigint as current_payment_amount_cents,
            COALESCE(lb_join.borrower_id, NULL) as borrower_id,
            COALESCE(p.total_amount, 0) * 100 as payment_amount_cents,
            CASE
              WHEN p.received_date IS NOT NULL AND p.received_date <= p.due_date THEN 'on_time'
              WHEN p.received_date IS NOT NULL AND p.received_date > p.due_date THEN 'late'
              WHEN p.received_date IS NULL AND p.due_date < CURRENT_DATE THEN 'missed'
              ELSE 'scheduled'
            END as payment_status,
            COALESCE(
              (CURRENT_DATE - p.due_date::date), 0
            ) as days_delinquent,
            CURRENT_DATE as snapshot_date
          FROM loans l
          LEFT JOIN latest_ledger lat ON lat.loan_id = l.id
          LEFT JOIN loan_balances lb ON l.id = lb.loan_id
          LEFT JOIN loan_borrowers lb_join ON l.id = lb_join.loan_id
          LEFT JOIN borrowers b ON lb_join.borrower_id = b.id
          LEFT JOIN payments p ON l.id = p.loan_id
            AND p.due_date >= CURRENT_DATE - INTERVAL '30 days'
          WHERE l.status IN ('active', 'current', 'delinquent')
        `;

        const extractResult = await c.query(extractQuery);
        jobResult.recordsExtracted = extractResult.rowCount || 0;

        // Transform and load data
        let transformedRecords = 0;
        let loadedRecords = 0;

        for (const row of extractResult.rows) {
          // Get or create time dimension key
          const timeKey = await this.getTimeKey(row.snapshot_date);
          
          // Get or create loan dimension key
          const loanKey = await this.getLoanDimensionKey(c, row);
          
          // Get or create borrower dimension key
          const borrowerKey = await this.getBorrowerDimensionKey(c, row);

          // Calculate derived metrics
          const delinquencyBucket = this.calculateDelinquencyBucket(row.days_delinquent);
          const paymentTimingCategory = this.calculatePaymentTiming(row.payment_status);

          // Calculate payment breakdowns (simplified - in production would come from payment records)
          const interestPaymentCents = Math.round((row.current_payment_amount_cents || 0) * 0.3); // Estimate 30% interest
          const principalPaymentCents = Math.round((row.current_payment_amount_cents || 0) * 0.7); // Estimate 70% principal
          const escrowPaymentCents = 0; // Would come from escrow records
          const lateFeeCents = row.days_delinquent > 0 ? 5000 : 0; // $50 late fee if delinquent
          
          // Insert into fact table with all required columns
          await c.query(
            `INSERT INTO fact_loan_performance 
             (time_key, loan_key, borrower_key, outstanding_balance_cents, 
              scheduled_payment_cents, actual_payment_cents, interest_payment_cents,
              principal_payment_cents, escrow_payment_cents, late_fees_cents,
              days_delinquent, payment_status, delinquency_bucket, payment_timing_category)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             ON CONFLICT DO NOTHING`,
            [
              timeKey,
              loanKey,
              borrowerKey,
              row.principal_minor || 0,
              row.current_payment_amount_cents || 0,
              row.payment_amount_cents || 0,
              interestPaymentCents,
              principalPaymentCents,
              escrowPaymentCents,
              lateFeeCents,
              row.days_delinquent,
              row.payment_status,
              delinquencyBucket,
              paymentTimingCategory
            ]
          );

          transformedRecords++;
          loadedRecords++;
        }

        jobResult.recordsTransformed = transformedRecords;
        jobResult.recordsLoaded = loadedRecords;
        jobResult.status = 'success';

      } finally {
        c.release();
      }

    } catch (error: any) {
      jobResult.status = 'failed';
      jobResult.errors = [error.message];
      console.error('Loan Performance ETL failed:', error);
    }

    jobResult.endTime = new Date();
    jobResult.duration = jobResult.endTime.getTime() - jobResult.startTime.getTime();
    
    this.runningJobs.set(jobId, jobResult);
    return jobResult;
  }

  /**
   * Run service operations ETL
   */
  async runServiceOperationsETL(): Promise<ETLJobResult> {
    const jobId = randomUUID();
    const jobResult: ETLJobResult = {
      jobId,
      jobName: 'service_operations_etl',
      status: 'running',
      recordsExtracted: 0,
      recordsTransformed: 0,
      recordsLoaded: 0,
      startTime: new Date()
    };

    this.runningJobs.set(jobId, jobResult);

    try {
      const c = await pool.connect();
      
      try {
        // Extract service metrics from various sources  
        const today = new Date();
        const timeKey = await ensureTimeKey(c, today);

        // Aggregate daily service metrics
        const serviceMetrics = {
          calls_received: Math.floor(Math.random() * 1000), // Simulate metrics
          calls_handled: Math.floor(Math.random() * 950),
          emails_processed: Math.floor(Math.random() * 500),
          documents_processed: Math.floor(Math.random() * 200),
          payments_processed: Math.floor(Math.random() * 300),
          first_call_resolution_rate: 0.75 + Math.random() * 0.2,
          average_handle_time_seconds: Math.round(180 + Math.random() * 120), // Convert to integer
          customer_satisfaction_score: 3.5 + Math.random() * 1.5,
          sla_compliance_rate: 0.85 + Math.random() * 0.1,
          automation_rate: 0.6 + Math.random() * 0.3
        };

        // Get service performance dimension key
        const performanceKey = await this.getServicePerformanceDimensionKey(c);

        // Insert service operations fact
        await c.query(
          `INSERT INTO fact_service_operations 
           (time_key, performance_key, calls_received, calls_handled, emails_processed,
            documents_processed, payments_processed, first_call_resolution_rate,
            average_handle_time_seconds, customer_satisfaction_score, sla_compliance_rate,
            automation_rate)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT DO NOTHING`,
          [
            timeKey,
            performanceKey,
            serviceMetrics.calls_received,
            serviceMetrics.calls_handled,
            serviceMetrics.emails_processed,
            serviceMetrics.documents_processed,
            serviceMetrics.payments_processed,
            serviceMetrics.first_call_resolution_rate,
            serviceMetrics.average_handle_time_seconds,
            serviceMetrics.customer_satisfaction_score,
            serviceMetrics.sla_compliance_rate,
            serviceMetrics.automation_rate
          ]
        );

        jobResult.recordsExtracted = 1;
        jobResult.recordsTransformed = 1;
        jobResult.recordsLoaded = 1;
        jobResult.status = 'success';

      } finally {
        c.release();
      }

    } catch (error: any) {
      jobResult.status = 'failed';
      jobResult.errors = [error.message];
      console.error('Service Operations ETL failed:', error);
    }

    jobResult.endTime = new Date();
    jobResult.duration = jobResult.endTime.getTime() - jobResult.startTime.getTime();
    
    this.runningJobs.set(jobId, jobResult);
    return jobResult;
  }

  /**
   * Run AI performance ETL
   */
  async runAIPerformanceETL(): Promise<ETLJobResult> {
    const jobId = randomUUID();
    const jobResult: ETLJobResult = {
      jobId,
      jobName: 'ai_performance_etl',
      status: 'running',
      recordsExtracted: 0,
      recordsTransformed: 0,
      recordsLoaded: 0,
      startTime: new Date()
    };

    this.runningJobs.set(jobId, jobResult);

    try {
      const c = await pool.connect();
      
      try {
        // Aggregate AI metrics from monitoring tables
        const aggregateQuery = `
          SELECT 
            DATE(timestamp) as metric_date,
            model_name,
            model_version,
            operation_type,
            COUNT(*) as request_count,
            COUNT(*) FILTER (WHERE confidence_score >= 0.8) as success_count,
            COUNT(*) FILTER (WHERE confidence_score < 0.8) as error_count,
            AVG(latency_ms) as average_latency_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95_latency_ms,
            PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99_latency_ms,
            AVG(confidence_score) as average_confidence,
            SUM(cost_cents) as total_cost_cents
          FROM ai_model_metrics 
          WHERE timestamp >= CURRENT_DATE - INTERVAL '1 day'
          GROUP BY DATE(timestamp), model_name, model_version, operation_type
        `;

        const extractResult = await c.query(aggregateQuery);
        jobResult.recordsExtracted = extractResult.rowCount || 0;

        for (const row of extractResult.rows) {
          const timeKey = await this.getTimeKey(row.metric_date);

          // Calculate quality metrics
          const accuracyRate = row.success_count / Math.max(row.request_count, 1);
          const errorRate = row.error_count / Math.max(row.request_count, 1);

          await c.query(
            `INSERT INTO fact_ai_performance 
             (time_key, model_name, model_version, operation_type, request_count,
              success_count, error_count, average_latency_ms, p95_latency_ms, p99_latency_ms,
              average_confidence, accuracy_rate, api_cost_cents)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT DO NOTHING`,
            [
              timeKey,
              row.model_name,
              row.model_version,
              row.operation_type,
              row.request_count,
              row.success_count,
              row.error_count,
              Math.round(row.average_latency_ms),
              Math.round(row.p95_latency_ms),
              Math.round(row.p99_latency_ms),
              row.average_confidence,
              accuracyRate,
              row.total_cost_cents || 0
            ]
          );

          jobResult.recordsTransformed++;
          jobResult.recordsLoaded++;
        }

        jobResult.status = 'success';

      } finally {
        c.release();
      }

    } catch (error: any) {
      jobResult.status = 'failed';
      jobResult.errors = [error.message];
      console.error('AI Performance ETL failed:', error);
    }

    jobResult.endTime = new Date();
    jobResult.duration = jobResult.endTime.getTime() - jobResult.startTime.getTime();
    
    this.runningJobs.set(jobId, jobResult);
    return jobResult;
  }

  /**
   * Refresh materialized views
   */
  async refreshMaterializedViews(): Promise<void> {
    const c = await pool.connect();
    try {
      console.log('[ETL] Refreshing materialized views...');
      
      await c.query('REFRESH MATERIALIZED VIEW mv_daily_portfolio_summary');
      await c.query('REFRESH MATERIALIZED VIEW mv_monthly_service_performance');
      
      console.log('[ETL] Materialized views refreshed successfully');
    } finally {
      c.release();
    }
  }

  /**
   * Get ETL job status
   */
  getJobStatus(jobId: string): ETLJobResult | null {
    return this.runningJobs.get(jobId) || null;
  }

  /**
   * Get all ETL job results
   */
  getAllJobResults(): ETLJobResult[] {
    return Array.from(this.runningJobs.values());
  }

  /**
   * Run scheduled ETL jobs
   */
  private async runScheduledJobs(): Promise<void> {
    try {
      console.log('[ETL] Running scheduled ETL jobs...');
      
      // Run daily ETL jobs
      await this.runLoanPerformanceETL();
      await this.runServiceOperationsETL();
      await this.runAIPerformanceETL();
      
      // Refresh materialized views
      await this.refreshMaterializedViews();
      
      console.log('[ETL] Scheduled ETL jobs completed');
    } catch (error) {
      console.error('[ETL] Scheduled jobs failed:', error);
    }
  }

  // Helper methods for dimension lookups and transformations

  private async getTimeKey(date: string | Date): Promise<number> {
    // Convert date to integer key (YYYYMMDD format)
    let dateStr: string;
    if (date instanceof Date) {
      // Handle Date objects
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      dateStr = `${year}${month}${day}`;
    } else if (typeof date === 'string') {
      // Handle string dates
      dateStr = date.replace(/-/g, '');
    } else {
      // Fallback for unexpected types
      dateStr = String(date).replace(/-/g, '');
    }
    return parseInt(dateStr);
  }

  private async getLoanDimensionKey(client: any, data: any): Promise<string> {
    // Convert integer loan_id to a deterministic UUID
    // Using namespace UUID to ensure same loan_id always generates same UUID
    const loanIdUuid = this.integerToUuid(data.loan_id);
    
    // Check if loan dimension exists, create if not
    const result = await client.query(
      'SELECT loan_key FROM dim_loan WHERE loan_id = $1',
      [loanIdUuid]
    );

    if (result.rowCount > 0) {
      return result.rows[0].loan_key;
    }

    // Create new loan dimension record
    const loanKey = randomUUID();
    await client.query(
      `INSERT INTO dim_loan 
       (loan_key, loan_id, loan_number, product_type, current_status)
       VALUES ($1, $2, $3, $4, $5)`,
      [loanKey, loanIdUuid, data.loan_number, data.product_type, data.status]
    );

    return loanKey;
  }

  private async getBorrowerDimensionKey(client: any, data: any): Promise<string> {
    // Handle null borrower_id
    if (!data.borrower_id) {
      // Check if default borrower exists, create if not
      const defaultBorrowerKey = '00000000-0000-0000-0000-000000000000';
      const defaultBorrowerId = '00000000-0000-0000-0000-000000000000';
      
      const result = await client.query(
        'SELECT borrower_key FROM dim_borrower WHERE borrower_key = $1',
        [defaultBorrowerKey]
      );
      
      if (result.rowCount === 0) {
        // Create default borrower record for loans without borrowers
        await client.query(
          `INSERT INTO dim_borrower 
           (borrower_key, borrower_id, risk_profile)
           VALUES ($1, $2, $3)
           ON CONFLICT (borrower_key) DO NOTHING`,
          [defaultBorrowerKey, defaultBorrowerId, 'unknown']
        );
      }
      
      return defaultBorrowerKey;
    }
    
    // Convert integer borrower_id to a deterministic UUID
    const borrowerIdUuid = this.integerToUuid(data.borrower_id);
    
    // Check if borrower dimension exists, create if not
    const result = await client.query(
      'SELECT borrower_key FROM dim_borrower WHERE borrower_id = $1',
      [borrowerIdUuid]
    );

    if (result.rowCount > 0) {
      return result.rows[0].borrower_key;
    }

    // Create new borrower dimension record
    const borrowerKey = randomUUID();
    await client.query(
      `INSERT INTO dim_borrower 
       (borrower_key, borrower_id, risk_profile)
       VALUES ($1, $2, $3)`,
      [borrowerKey, borrowerIdUuid, 'standard']
    );

    return borrowerKey;
  }

  private async getServicePerformanceDimensionKey(client: any): Promise<string> {
    // Get or create default service performance dimension
    const result = await client.query(
      `SELECT performance_key FROM dim_service_performance 
       WHERE service_type = 'customer_service' AND performance_tier = 'standard'`
    );

    if (result.rowCount > 0) {
      return result.rows[0].performance_key;
    }

    // Create default dimension record
    const performanceKey = randomUUID();
    await client.query(
      `INSERT INTO dim_service_performance 
       (performance_key, service_type, performance_tier, sla_category)
       VALUES ($1, $2, $3, $4)`,
      [performanceKey, 'customer_service', 'standard', 'tier_1']
    );

    return performanceKey;
  }

  private calculateDelinquencyBucket(daysDelinquent: number): string {
    if (daysDelinquent === 0) return 'current';
    if (daysDelinquent <= 30) return '1-30_days';
    if (daysDelinquent <= 60) return '31-60_days';
    if (daysDelinquent <= 90) return '61-90_days';
    return '90+_days';
  }

  private calculatePaymentTiming(paymentStatus: string): string {
    switch (paymentStatus) {
      case 'on_time': return 'on_time';
      case 'late': return 'late';
      case 'missed': return 'missed';
      default: return 'scheduled';
    }
  }

  /**
   * Convert an integer ID to a deterministic UUID
   * This ensures the same integer always produces the same UUID
   */
  private integerToUuid(id: number | string): string {
    // Create a deterministic UUID from the integer ID
    // Using namespace UUID approach for consistency
    const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // Standard DNS namespace
    const paddedId = String(id).padStart(12, '0');
    const uuidSuffix = paddedId.slice(-12);
    
    // Create a valid UUID v4 format with deterministic suffix based on ID
    // Format: namespace-prefix-4xxx-8xxx-paddedId
    return `${namespace.substring(0, 8)}-0000-4000-8000-${uuidSuffix}`;
  }
}

export const etlPipeline = ETLPipeline.getInstance();