import { pool } from "../../../server/db";
import dayjs from "dayjs";
import { createHash } from "crypto";

interface ParquetExportJob {
  table: string;
  s3_key: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  row_count?: number;
  file_size_bytes?: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

interface PIIRedactionConfig {
  enabled: boolean;
  email_fields: string[];
  phone_fields: string[];
  name_fields: string[];
  address_fields: string[];
  salt: string;
}

export class LakehouseExtractor {
  private tenantId: string;
  private bucketName: string;
  private prefix: string;
  private piiConfig: PIIRedactionConfig;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    this.bucketName = process.env.LAKE_BUCKET || 'loanserve-lake';
    this.prefix = process.env.LAKE_PREFIX || 'prod';
    
    this.piiConfig = {
      enabled: process.env.ETL_PII_REDACT === 'true',
      email_fields: ['email', 'borrower_email', 'contact_email'],
      phone_fields: ['phone', 'borrower_phone', 'contact_phone'],
      name_fields: ['borrower_name', 'contact_name', 'full_name'],
      address_fields: ['property_address', 'mailing_address', 'address'],
      salt: process.env.ETL_PII_SALT || 'default-salt-change-in-production'
    };
  }

  private hashPII(value: string, fieldType: string): string {
    if (!this.piiConfig.enabled || !value) return value;
    
    const hash = createHash('sha256');
    hash.update(`${fieldType}:${this.piiConfig.salt}:${value}`);
    return `${fieldType}_${hash.digest('hex').substring(0, 8)}`;
  }

  private redactRow(row: any, tableName: string): any {
    if (!this.piiConfig.enabled) return row;

    const redacted = { ...row };
    
    // Redact email fields
    this.piiConfig.email_fields.forEach(field => {
      if (redacted[field]) {
        redacted[field] = this.hashPII(redacted[field], 'email');
      }
    });

    // Redact phone fields
    this.piiConfig.phone_fields.forEach(field => {
      if (redacted[field]) {
        redacted[field] = this.hashPII(redacted[field], 'phone');
      }
    });

    // Redact name fields (for certain tables)
    if (tableName === 'dim_loan' || tableName === 'dim_user') {
      this.piiConfig.name_fields.forEach(field => {
        if (redacted[field]) {
          redacted[field] = this.hashPII(redacted[field], 'name');
        }
      });
    }

    // Redact address fields
    this.piiConfig.address_fields.forEach(field => {
      if (redacted[field]) {
        redacted[field] = this.hashPII(redacted[field], 'address');
      }
    });

    return redacted;
  }

  async exportTableToParquet(tableName: string, isIncremental: boolean = false): Promise<ParquetExportJob> {
    const job: ParquetExportJob = {
      table: tableName,
      s3_key: this.generateS3Key(tableName, isIncremental),
      status: 'queued',
      started_at: new Date().toISOString()
    };

    try {
      job.status = 'running';
      console.log(`[Lakehouse] Starting export of ${tableName} to ${job.s3_key}`);

      const client = await pool.connect();
      
      try {
        await client.query('SET LOCAL app.tenant_id=$1', [this.tenantId]);

        // Build query based on table type and incremental flag
        const query = this.buildExportQuery(tableName, isIncremental);
        const result = await client.query(query);

        // Process rows with PII redaction
        const processedRows = result.rows.map(row => this.redactRow(row, tableName));

        // Convert to Parquet format (mock implementation)
        const parquetData = this.convertToParquet(processedRows);
        
        // Upload to S3 (mock implementation)
        await this.uploadToS3(job.s3_key, parquetData);

        job.status = 'completed';
        job.completed_at = new Date().toISOString();
        job.row_count = processedRows.length;
        job.file_size_bytes = parquetData.length;

        console.log(`[Lakehouse] Export completed: ${job.row_count} rows, ${job.file_size_bytes} bytes`);

      } finally {
        client.release();
      }

    } catch (error) {
      job.status = 'failed';
      job.completed_at = new Date().toISOString();
      job.error_message = error instanceof Error ? error.message : String(error);
      console.error(`[Lakehouse] Export failed for ${tableName}:`, error);
    }

    return job;
  }

  private generateS3Key(tableName: string, isIncremental: boolean): string {
    const date = dayjs().format('YYYY/MM/DD');
    const timestamp = dayjs().format('HHmmss');
    const type = isIncremental ? 'incremental' : 'full';
    
    return `${this.prefix}/tables/${tableName}/${type}/${date}/${tableName}_${timestamp}.parquet`;
  }

  private buildExportQuery(tableName: string, isIncremental: boolean): string {
    const baseQueries: { [key: string]: string } = {
      'dim_loan': `
        SELECT loan_sk, loan_id, loan_number, borrower_name, property_city, 
               property_state, property_zip, program_code, investor_id, 
               loan_purpose, property_type, occupancy_type, created_at, updated_at
        FROM reporting.dim_loan
      `,
      'dim_investor': `
        SELECT investor_sk, investor_id, investor_name, delivery_type, 
               active, remittance_frequency, created_at, updated_at
        FROM reporting.dim_investor
      `,
      'dim_user': `
        SELECT user_sk, user_id, username, email, role, department, 
               active, created_at, updated_at
        FROM reporting.dim_user
      `,
      'fact_txn': `
        SELECT txn_sk, tenant_id, loan_id, user_id, d, type, amount, 
               alloc_principal, alloc_interest, alloc_escrow, alloc_fees,
               payment_method, ref, created_at
        FROM reporting.fact_txn
      `,
      'fact_qc': `
        SELECT qc_sk, tenant_id, loan_id, rule_code, rule_category, severity, 
               status, resolution_notes, assigned_user_id, d, created_at, resolved_at
        FROM reporting.fact_qc
      `,
      'fact_servicing': `
        SELECT svc_sk, tenant_id, loan_id, d, upb, escrow_balance, 
               delinquency_dpd, delinquency_bucket, payment_due, interest_rate,
               maturity_date, next_payment_date, created_at
        FROM reporting.fact_servicing
      `,
      'fact_remit': `
        SELECT remit_sk, tenant_id, investor_id, loan_id, remit_period_start,
               remit_period_end, d, principal, interest, escrow, svc_fee,
               strip_io, net, participation_pct, created_at
        FROM reporting.fact_remit
      `,
      'fact_export': `
        SELECT export_sk, tenant_id, loan_id, template, status, file_size_bytes,
               processing_time_ms, error_message, d, created_at
        FROM reporting.fact_export
      `,
      'fact_notify': `
        SELECT notify_sk, tenant_id, loan_id, template_code, channel, status,
               delivery_time_ms, recipient_count, d, created_at
        FROM reporting.fact_notify
      `,
      'fact_document': `
        SELECT doc_sk, tenant_id, loan_id, document_type, processing_status,
               ai_confidence_score, extraction_count, validation_errors,
               processing_time_ms, file_size_bytes, d, created_at
        FROM reporting.fact_document
      `
    };

    let query = baseQueries[tableName];
    if (!query) {
      throw new Error(`Unknown table for export: ${tableName}`);
    }

    // Add incremental filter for fact tables
    if (isIncremental && tableName.startsWith('fact_')) {
      const cutoffHours = tableName === 'fact_servicing' ? 48 : 25; // Daily snapshot vs hourly facts
      query += ` WHERE created_at >= NOW() - INTERVAL '${cutoffHours} hours'`;
    }

    query += ' ORDER BY created_at';
    return query;
  }

  private convertToParquet(rows: any[]): Buffer {
    // Mock Parquet conversion - in real implementation would use parquet-js or similar
    const jsonData = JSON.stringify(rows, null, 2);
    return Buffer.from(jsonData, 'utf-8');
  }

  private async uploadToS3(s3Key: string, data: Buffer): Promise<void> {
    // Mock S3 upload - in real implementation would use AWS SDK
    console.log(`[Lakehouse] Mock upload to s3://${this.bucketName}/${s3Key} (${data.length} bytes)`);
    
    // Simulate upload time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
  }

  async exportAllTables(isIncremental: boolean = false): Promise<ParquetExportJob[]> {
    const tables = [
      'dim_loan', 'dim_investor', 'dim_user',
      'fact_txn', 'fact_qc', 'fact_servicing', 'fact_remit',
      'fact_export', 'fact_notify', 'fact_document'
    ];

    console.log(`[Lakehouse] Starting ${isIncremental ? 'incremental' : 'full'} export of ${tables.length} tables`);

    const jobs: ParquetExportJob[] = [];
    
    // Export dimensions first (may be referenced by facts)
    for (const table of tables.filter(t => t.startsWith('dim_'))) {
      const job = await this.exportTableToParquet(table, isIncremental);
      jobs.push(job);
    }

    // Export fact tables
    for (const table of tables.filter(t => t.startsWith('fact_'))) {
      const job = await this.exportTableToParquet(table, isIncremental);
      jobs.push(job);
    }

    const successCount = jobs.filter(j => j.status === 'completed').length;
    const failCount = jobs.filter(j => j.status === 'failed').length;
    
    console.log(`[Lakehouse] Export completed: ${successCount} succeeded, ${failCount} failed`);

    return jobs;
  }

  async createExternalTables(): Promise<void> {
    // Generate DDL for external tables (Athena/Trino)
    const ddl = this.generateExternalTableDDL();
    console.log('[Lakehouse] External table DDL:');
    console.log(ddl);
    
    // In real implementation, would execute against Athena/Trino
  }

  private generateExternalTableDDL(): string {
    const tables = [
      {
        name: 'ext_dim_loan',
        location: `s3://${this.bucketName}/${this.prefix}/tables/dim_loan/`,
        columns: [
          'loan_sk bigint',
          'loan_id string',
          'loan_number string',
          'borrower_name string',
          'property_city string',
          'property_state string',
          'property_zip string',
          'program_code string',
          'investor_id string',
          'loan_purpose string',
          'property_type string',
          'occupancy_type string',
          'created_at timestamp',
          'updated_at timestamp'
        ]
      },
      {
        name: 'ext_fact_txn',
        location: `s3://${this.bucketName}/${this.prefix}/tables/fact_txn/`,
        columns: [
          'txn_sk bigint',
          'tenant_id string',
          'loan_id string',
          'user_id string',
          'd date',
          'type string',
          'amount decimal(18,2)',
          'alloc_principal decimal(18,2)',
          'alloc_interest decimal(18,2)',
          'alloc_escrow decimal(18,2)',
          'alloc_fees decimal(18,2)',
          'payment_method string',
          'ref string',
          'created_at timestamp'
        ]
      }
    ];

    return tables.map(table => `
CREATE EXTERNAL TABLE ${table.name} (
  ${table.columns.join(',\n  ')}
)
STORED AS PARQUET
LOCATION '${table.location}'
TBLPROPERTIES (
  'projection.enabled' = 'true',
  'projection.d.type' = 'date',
  'projection.d.range' = '2020-01-01,NOW',
  'projection.d.format' = 'yyyy/MM/dd',
  'storage.location.template' = '${table.location}full/\${d}/'
);
    `).join('\n\n');
  }
}

export async function runIncrementalExport(tenantId: string): Promise<ParquetExportJob[]> {
  const extractor = new LakehouseExtractor(tenantId);
  return await extractor.exportAllTables(true);
}

export async function runFullExport(tenantId: string): Promise<ParquetExportJob[]> {
  const extractor = new LakehouseExtractor(tenantId);
  return await extractor.exportAllTables(false);
}