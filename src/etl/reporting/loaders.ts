import { pool } from "../../../server/db";
import dayjs from "dayjs";

interface ETLMetrics {
  table: string;
  rows_processed: number;
  processing_time_ms: number;
  last_updated: string;
}

export class ReportingETL {
  private tenantId: string;
  private metrics: ETLMetrics[] = [];

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async loadDimLoan(): Promise<void> {
    const start = Date.now();
    const client = await pool.connect();
    
    try {
      await client.query('SET LOCAL app.tenant_id=$1', [this.tenantId]);
      
      const result = await client.query(`
        INSERT INTO reporting.dim_loan (
          loan_id, loan_number, borrower_name, property_city, property_state, 
          property_zip, program_code, investor_id, loan_purpose, property_type, 
          occupancy_type, updated_at
        )
        SELECT 
          src.loan_id, src.loan_number, src.borrower_name, src.property_city, 
          src.property_state, src.property_zip, src.program_code, src.investor_id,
          src.loan_purpose, src.property_type, src.occupancy_type, NOW()
        FROM reporting.v_dim_loan_source src
        ON CONFLICT (loan_id) DO UPDATE SET
          loan_number = EXCLUDED.loan_number,
          borrower_name = EXCLUDED.borrower_name,
          property_city = EXCLUDED.property_city,
          property_state = EXCLUDED.property_state,
          property_zip = EXCLUDED.property_zip,
          program_code = EXCLUDED.program_code,
          investor_id = EXCLUDED.investor_id,
          loan_purpose = EXCLUDED.loan_purpose,
          property_type = EXCLUDED.property_type,
          occupancy_type = EXCLUDED.occupancy_type,
          updated_at = EXCLUDED.updated_at
      `);

      this.metrics.push({
        table: 'dim_loan',
        rows_processed: result.rowCount || 0,
        processing_time_ms: Date.now() - start,
        last_updated: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  }

  async loadDimInvestor(): Promise<void> {
    const start = Date.now();
    const client = await pool.connect();
    
    try {
      await client.query('SET LOCAL app.tenant_id=$1', [this.tenantId]);
      
      const result = await client.query(`
        INSERT INTO reporting.dim_investor (
          investor_id, investor_name, delivery_type, active, remittance_frequency, updated_at
        )
        SELECT 
          id, name, delivery_type, active, remittance_frequency, NOW()
        FROM inv_investors
        ON CONFLICT (investor_id) DO UPDATE SET
          investor_name = EXCLUDED.investor_name,
          delivery_type = EXCLUDED.delivery_type,
          active = EXCLUDED.active,
          remittance_frequency = EXCLUDED.remittance_frequency,
          updated_at = EXCLUDED.updated_at
      `);

      this.metrics.push({
        table: 'dim_investor',
        rows_processed: result.rowCount || 0,
        processing_time_ms: Date.now() - start,
        last_updated: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  }

  async loadDimUser(): Promise<void> {
    const start = Date.now();
    const client = await pool.connect();
    
    try {
      await client.query('SET LOCAL app.tenant_id=$1', [this.tenantId]);
      
      const result = await client.query(`
        INSERT INTO reporting.dim_user (
          user_id, username, email, role, department, active, updated_at
        )
        SELECT 
          user_id, username, email, role, department, active, NOW()
        FROM reporting.v_dim_user_source
        ON CONFLICT (user_id) DO UPDATE SET
          username = EXCLUDED.username,
          email = EXCLUDED.email,
          role = EXCLUDED.role,
          department = EXCLUDED.department,
          active = EXCLUDED.active,
          updated_at = EXCLUDED.updated_at
      `);

      this.metrics.push({
        table: 'dim_user',
        rows_processed: result.rowCount || 0,
        processing_time_ms: Date.now() - start,
        last_updated: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  }

  async loadFactTxn(sinceISO?: string): Promise<void> {
    const start = Date.now();
    const client = await pool.connect();
    
    try {
      await client.query('SET LOCAL app.tenant_id=$1', [this.tenantId]);
      
      const since = sinceISO || dayjs().subtract(25, 'hour').format('YYYY-MM-DD HH:mm:ss');
      
      const result = await client.query(`
        INSERT INTO reporting.fact_txn (
          tenant_id, loan_id, user_id, d, type, amount, alloc_principal, 
          alloc_interest, alloc_escrow, alloc_fees, payment_method, ref
        )
        SELECT 
          t.tenant_id, t.loan_id, t.user_id, t.ts::date, t.type, t.amount, 
          t.alloc_principal, t.alloc_interest, t.alloc_escrow, t.alloc_fees,
          t.ref->>'payment_method' AS payment_method, t.ref
        FROM svc_txns t 
        WHERE t.ts >= $2
        ON CONFLICT DO NOTHING
      `, [since]);

      this.metrics.push({
        table: 'fact_txn',
        rows_processed: result.rowCount || 0,
        processing_time_ms: Date.now() - start,
        last_updated: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  }

  async loadFactQC(sinceISO?: string): Promise<void> {
    const start = Date.now();
    const client = await pool.connect();
    
    try {
      await client.query('SET LOCAL app.tenant_id=$1', [this.tenantId]);
      
      const since = sinceISO || dayjs().subtract(25, 'hour').format('YYYY-MM-DD HH:mm:ss');
      
      const result = await client.query(`
        INSERT INTO reporting.fact_qc (
          tenant_id, loan_id, rule_code, rule_category, severity, status, 
          resolution_notes, assigned_user_id, d, resolved_at
        )
        SELECT 
          lc.tenant_id, d.loan_id, r.code, r.category, r.severity, d.status,
          d.resolution_notes, d.assigned_user_id, d.created_at::date, d.resolved_at
        FROM qc_defects d 
        JOIN qc_rules r ON r.id = d.rule_id
        JOIN loan_candidates lc ON lc.id = d.loan_id
        WHERE d.created_at >= $2
        ON CONFLICT DO NOTHING
      `, [since]);

      this.metrics.push({
        table: 'fact_qc',
        rows_processed: result.rowCount || 0,
        processing_time_ms: Date.now() - start,
        last_updated: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  }

  async loadFactExport(sinceISO?: string): Promise<void> {
    const start = Date.now();
    const client = await pool.connect();
    
    try {
      await client.query('SET LOCAL app.tenant_id=$1', [this.tenantId]);
      
      const since = sinceISO || dayjs().subtract(25, 'hour').format('YYYY-MM-DD HH:mm:ss');
      
      const result = await client.query(`
        INSERT INTO reporting.fact_export (
          tenant_id, loan_id, template, status, file_size_bytes, 
          processing_time_ms, error_message, d
        )
        SELECT 
          tenant_id, loan_id, template, status, 
          (metadata->>'file_size')::bigint AS file_size_bytes,
          (metadata->>'processing_time_ms')::integer AS processing_time_ms,
          error_message, created_at::date
        FROM exports 
        WHERE created_at >= $2
        ON CONFLICT DO NOTHING
      `, [since]);

      this.metrics.push({
        table: 'fact_export',
        rows_processed: result.rowCount || 0,
        processing_time_ms: Date.now() - start,
        last_updated: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  }

  async loadFactNotify(sinceISO?: string): Promise<void> {
    const start = Date.now();
    const client = await pool.connect();
    
    try {
      await client.query('SET LOCAL app.tenant_id=$1', [this.tenantId]);
      
      const since = sinceISO || dayjs().subtract(25, 'hour').format('YYYY-MM-DD HH:mm:ss');
      
      const result = await client.query(`
        INSERT INTO reporting.fact_notify (
          tenant_id, loan_id, template_code, channel, status, 
          delivery_time_ms, recipient_count, d
        )
        SELECT 
          tenant_id, loan_id, template_code, channel, status,
          (metadata->>'delivery_time_ms')::integer AS delivery_time_ms,
          COALESCE((metadata->>'recipient_count')::integer, 1) AS recipient_count,
          created_at::date
        FROM notifications 
        WHERE created_at >= $2
        ON CONFLICT DO NOTHING
      `, [since]);

      this.metrics.push({
        table: 'fact_notify',
        rows_processed: result.rowCount || 0,
        processing_time_ms: Date.now() - start,
        last_updated: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  }

  async loadFactServicing(): Promise<void> {
    const start = Date.now();
    const client = await pool.connect();
    
    try {
      await client.query('SET LOCAL app.tenant_id=$1', [this.tenantId]);
      
      // Load current snapshot based on latest schedule data
      const result = await client.query(`
        INSERT INTO reporting.fact_servicing (
          tenant_id, loan_id, d, upb, escrow_balance, delinquency_dpd, 
          delinquency_bucket, payment_due, interest_rate, maturity_date, next_payment_date
        )
        SELECT 
          s.tenant_id, s.loan_id, CURRENT_DATE,
          s.principal_balance_after,
          COALESCE((
            SELECT SUM(balance) 
            FROM svc_escrow_sub e 
            WHERE e.loan_id = s.loan_id
          ), 0) AS escrow_balance,
          0 AS delinquency_dpd,  -- Would calculate from payment schedule
          '0+' AS delinquency_bucket,
          s.payment_amount AS payment_due,
          NULL AS interest_rate,  -- Would come from loan terms
          NULL AS maturity_date,  -- Would come from loan terms
          s.due_date AS next_payment_date
        FROM (
          SELECT DISTINCT ON (loan_id) * 
          FROM svc_schedule 
          ORDER BY loan_id, installment_no DESC
        ) s
        ON CONFLICT (tenant_id, loan_id, d) DO UPDATE SET
          upb = EXCLUDED.upb,
          escrow_balance = EXCLUDED.escrow_balance,
          delinquency_dpd = EXCLUDED.delinquency_dpd,
          delinquency_bucket = EXCLUDED.delinquency_bucket,
          payment_due = EXCLUDED.payment_due,
          interest_rate = EXCLUDED.interest_rate,
          maturity_date = EXCLUDED.maturity_date,
          next_payment_date = EXCLUDED.next_payment_date
      `);

      this.metrics.push({
        table: 'fact_servicing',
        rows_processed: result.rowCount || 0,
        processing_time_ms: Date.now() - start,
        last_updated: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  }

  async loadFactRemit(sinceISO?: string): Promise<void> {
    const start = Date.now();
    const client = await pool.connect();
    
    try {
      await client.query('SET LOCAL app.tenant_id=$1', [this.tenantId]);
      
      const since = sinceISO || dayjs().subtract(35, 'day').format('YYYY-MM-DD');
      
      const result = await client.query(`
        INSERT INTO reporting.fact_remit (
          tenant_id, investor_id, loan_id, remit_period_start, remit_period_end, d,
          principal, interest, escrow, svc_fee, strip_io, net, participation_pct
        )
        SELECT 
          r.tenant_id, r.investor_id, i.loan_id, r.period_start, r.period_end, r.period_end::date,
          i.principal_collected, i.interest_collected, i.escrow_collected, 
          i.svc_fee, i.strip_io, i.net_remit,
          h.participation_pct
        FROM inv_remit_items i 
        JOIN inv_remit_runs r ON r.id = i.run_id
        LEFT JOIN inv_holdings h ON h.investor_id = r.investor_id AND h.loan_id = i.loan_id
        WHERE r.period_end >= $2
        ON CONFLICT DO NOTHING
      `, [since]);

      this.metrics.push({
        table: 'fact_remit',
        rows_processed: result.rowCount || 0,
        processing_time_ms: Date.now() - start,
        last_updated: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  }

  async loadFactDocument(sinceISO?: string): Promise<void> {
    const start = Date.now();
    const client = await pool.connect();
    
    try {
      await client.query('SET LOCAL app.tenant_id=$1', [this.tenantId]);
      
      const since = sinceISO || dayjs().subtract(25, 'hour').format('YYYY-MM-DD HH:mm:ss');
      
      const result = await client.query(`
        INSERT INTO reporting.fact_document (
          tenant_id, loan_id, document_type, processing_status, ai_confidence_score,
          extraction_count, validation_errors, processing_time_ms, file_size_bytes, d
        )
        SELECT 
          df.tenant_id, df.loan_id, df.document_type, df.processing_status,
          (df.ai_analysis->>'confidence_score')::numeric(5,4) AS ai_confidence_score,
          COALESCE((df.ai_analysis->>'extraction_count')::integer, 0) AS extraction_count,
          COALESCE((df.ai_analysis->>'validation_errors')::integer, 0) AS validation_errors,
          (df.metadata->>'processing_time_ms')::integer AS processing_time_ms,
          (df.metadata->>'file_size')::bigint AS file_size_bytes,
          df.created_at::date
        FROM document_files df
        WHERE df.created_at >= $2
        ON CONFLICT DO NOTHING
      `, [since]);

      this.metrics.push({
        table: 'fact_document',
        rows_processed: result.rowCount || 0,
        processing_time_ms: Date.now() - start,
        last_updated: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  }

  async runIncrementalETL(sinceISO?: string): Promise<ETLMetrics[]> {
    console.log(`[ETL] Starting incremental ETL for tenant ${this.tenantId}`);
    this.metrics = [];

    try {
      // Load dimensions first (they may be referenced by facts)
      await this.loadDimLoan();
      await this.loadDimInvestor();
      await this.loadDimUser();

      // Load fact tables
      await this.loadFactTxn(sinceISO);
      await this.loadFactQC(sinceISO);
      await this.loadFactExport(sinceISO);
      await this.loadFactNotify(sinceISO);
      await this.loadFactRemit(sinceISO);
      await this.loadFactDocument(sinceISO);

      console.log(`[ETL] Incremental ETL completed successfully`);
      return this.metrics;

    } catch (error) {
      console.error(`[ETL] Incremental ETL failed:`, error);
      throw error;
    }
  }

  async runFullETL(): Promise<ETLMetrics[]> {
    console.log(`[ETL] Starting full ETL for tenant ${this.tenantId}`);
    this.metrics = [];

    try {
      // Load dimensions
      await this.loadDimLoan();
      await this.loadDimInvestor();
      await this.loadDimUser();

      // Full load of current servicing snapshot
      await this.loadFactServicing();

      // Load fact tables with longer lookback
      const lookbackDate = dayjs().subtract(
        Number(process.env.ETL_MAX_LOOKBACK_DAYS || 3650), 
        'day'
      ).format('YYYY-MM-DD HH:mm:ss');

      await this.loadFactTxn(lookbackDate);
      await this.loadFactQC(lookbackDate);
      await this.loadFactExport(lookbackDate);
      await this.loadFactNotify(lookbackDate);
      await this.loadFactRemit(lookbackDate);
      await this.loadFactDocument(lookbackDate);

      console.log(`[ETL] Full ETL completed successfully`);
      return this.metrics;

    } catch (error) {
      console.error(`[ETL] Full ETL failed:`, error);
      throw error;
    }
  }

  getMetrics(): ETLMetrics[] {
    return this.metrics;
  }
}

// Convenience functions for backward compatibility
export async function loadDimLoan(tenantId: string): Promise<void> {
  const etl = new ReportingETL(tenantId);
  await etl.loadDimLoan();
}

export async function loadDimInvestor(tenantId: string): Promise<void> {
  const etl = new ReportingETL(tenantId);
  await etl.loadDimInvestor();
}

export async function loadFactTxn(tenantId: string, sinceISO?: string): Promise<void> {
  const etl = new ReportingETL(tenantId);
  await etl.loadFactTxn(sinceISO);
}

export async function loadFactQC(tenantId: string, sinceISO?: string): Promise<void> {
  const etl = new ReportingETL(tenantId);
  await etl.loadFactQC(sinceISO);
}

export async function loadFactExport(tenantId: string, sinceISO?: string): Promise<void> {
  const etl = new ReportingETL(tenantId);
  await etl.loadFactExport(sinceISO);
}

export async function loadFactNotify(tenantId: string, sinceISO?: string): Promise<void> {
  const etl = new ReportingETL(tenantId);
  await etl.loadFactNotify(sinceISO);
}

export async function loadFactServicing(tenantId: string): Promise<void> {
  const etl = new ReportingETL(tenantId);
  await etl.loadFactServicing();
}

export async function loadFactRemit(tenantId: string, sinceISO?: string): Promise<void> {
  const etl = new ReportingETL(tenantId);
  await etl.loadFactRemit(sinceISO);
}