/**
 * Phase 4: Document Repository
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import type { DocumentTemplate, DocumentArtifact, NoticeSchedule } from './types';

export class DocsRepo {
  /**
   * Get the latest template for a document type and jurisdiction
   */
  async getLatestTemplate(
    type: string, 
    jurisdiction?: string
  ): Promise<DocumentTemplate | null> {
    const result = await db.execute(sql`
      SELECT 
        template_id, 
        type,
        jurisdiction,
        version,
        engine, 
        html_source, 
        css_source, 
        font_family
      FROM document_template
      WHERE type = ${type} 
        AND (jurisdiction IS NULL OR jurisdiction = ${jurisdiction || null})
        AND retired_at IS NULL
      ORDER BY jurisdiction NULLS LAST, version DESC
      LIMIT 1
    `);
    
    if (!result.rows.length) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      template_id: row.template_id as string,
      type: row.type as any,
      jurisdiction: row.jurisdiction as string | undefined,
      version: row.version as number,
      engine: row.engine as string,
      html_source: row.html_source as string,
      css_source: row.css_source as string,
      font_family: row.font_family as string,
      created_at: new Date()
    };
  }

  /**
   * Insert a document artifact
   */
  async insertArtifact(artifact: {
    type: string;
    loan_id?: number;
    related_id?: string;
    period_start?: string;
    period_end?: string;
    tax_year?: number;
    template_id: string;
    payload_json: any;
    inputs_hash: string;
    pdf_hash: string;
    pdf_bytes: Buffer;
    size_bytes: number;
    event_id?: string;
  }): Promise<string> {
    const result = await db.execute(sql`
      INSERT INTO document_artifact(
        type, loan_id, related_id, period_start, period_end, tax_year,
        template_id, payload_json, inputs_hash, pdf_hash, pdf_bytes, size_bytes, event_id
      )
      VALUES (
        ${artifact.type},
        ${artifact.loan_id || null},
        ${artifact.related_id || null},
        ${artifact.period_start || null},
        ${artifact.period_end || null},
        ${artifact.tax_year || null},
        ${artifact.template_id},
        ${JSON.stringify(artifact.payload_json)},
        ${artifact.inputs_hash},
        ${artifact.pdf_hash},
        ${artifact.pdf_bytes},
        ${artifact.size_bytes},
        ${artifact.event_id || null}
      )
      RETURNING doc_id
    `);
    
    return result.rows[0].doc_id as string;
  }

  /**
   * Get document artifact by ID
   */
  async getArtifact(docId: string): Promise<DocumentArtifact | null> {
    const result = await db.execute(sql`
      SELECT * FROM document_artifact WHERE doc_id = ${docId}
    `);
    
    if (!result.rows.length) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      doc_id: row.doc_id as string,
      type: row.type as any,
      loan_id: row.loan_id as number | undefined,
      related_id: row.related_id as string | undefined,
      period_start: row.period_start as string | undefined,
      period_end: row.period_end as string | undefined,
      tax_year: row.tax_year as number | undefined,
      template_id: row.template_id as string,
      payload_json: row.payload_json,
      inputs_hash: row.inputs_hash as string,
      pdf_hash: row.pdf_hash as string,
      pdf_bytes: row.pdf_bytes as Buffer,
      size_bytes: row.size_bytes as number,
      created_at: row.created_at as Date,
      event_id: row.event_id as string | undefined
    };
  }

  /**
   * Get documents for a loan
   */
  async getDocumentsForLoan(
    loanId: number, 
    type?: string
  ): Promise<DocumentArtifact[]> {
    let query = sql`
      SELECT * FROM document_artifact 
      WHERE loan_id = ${loanId}
    `;
    
    if (type) {
      query = sql`
        SELECT * FROM document_artifact 
        WHERE loan_id = ${loanId} AND type = ${type}
        ORDER BY created_at DESC
      `;
    } else {
      query = sql`
        SELECT * FROM document_artifact 
        WHERE loan_id = ${loanId}
        ORDER BY created_at DESC
      `;
    }
    
    const result = await db.execute(query);
    
    return result.rows.map(row => ({
      doc_id: row.doc_id as string,
      type: row.type as any,
      loan_id: row.loan_id as number | undefined,
      related_id: row.related_id as string | undefined,
      period_start: row.period_start as string | undefined,
      period_end: row.period_end as string | undefined,
      tax_year: row.tax_year as number | undefined,
      template_id: row.template_id as string,
      payload_json: row.payload_json,
      inputs_hash: row.inputs_hash as string,
      pdf_hash: row.pdf_hash as string,
      pdf_bytes: row.pdf_bytes as Buffer,
      size_bytes: row.size_bytes as number,
      created_at: row.created_at as Date,
      event_id: row.event_id as string | undefined
    }));
  }

  /**
   * Link a notice to a sent document
   */
  async linkNoticeSent(noticeId: string, docId: string): Promise<void> {
    await db.execute(sql`
      UPDATE notice_schedule 
      SET status = 'sent', sent_doc_id = ${docId}
      WHERE notice_id = ${noticeId}
    `);
  }

  /**
   * Get scheduled notices
   */
  async getScheduledNotices(before?: Date): Promise<NoticeSchedule[]> {
    const cutoff = before || new Date();
    
    const result = await db.execute(sql`
      SELECT * FROM notice_schedule 
      WHERE status = 'scheduled' AND scheduled_for <= ${cutoff}
      ORDER BY scheduled_for ASC
    `);
    
    return result.rows.map(row => ({
      notice_id: row.notice_id as string,
      loan_id: row.loan_id as number,
      notice_template_id: row.notice_template_id as string,
      trigger_code: row.trigger_code as string,
      params: row.params as Record<string, any>,
      scheduled_for: row.scheduled_for as Date,
      status: row.status as 'scheduled' | 'sent' | 'canceled',
      sent_doc_id: row.sent_doc_id as string | undefined,
      created_at: row.created_at as Date
    }));
  }

  /**
   * Schedule a notice
   */
  async scheduleNotice(notice: {
    loan_id: number;
    notice_template_id: string;
    trigger_code: string;
    params?: Record<string, any>;
    scheduled_for: Date;
  }): Promise<string> {
    const result = await db.execute(sql`
      INSERT INTO notice_schedule(
        loan_id, notice_template_id, trigger_code, params, scheduled_for
      )
      VALUES (
        ${notice.loan_id},
        ${notice.notice_template_id},
        ${notice.trigger_code},
        ${JSON.stringify(notice.params || {})},
        ${notice.scheduled_for}
      )
      ON CONFLICT (loan_id, notice_template_id, scheduled_for) 
      DO NOTHING
      RETURNING notice_id
    `);
    
    if (!result.rows.length) {
      throw new Error('Notice already scheduled');
    }
    
    return result.rows[0].notice_id as string;
  }

  /**
   * Cancel a scheduled notice
   */
  async cancelNotice(noticeId: string): Promise<void> {
    await db.execute(sql`
      UPDATE notice_schedule 
      SET status = 'canceled'
      WHERE notice_id = ${noticeId} AND status = 'scheduled'
    `);
  }

  /**
   * Get lender entity information
   */
  async getLenderEntity(): Promise<any> {
    const result = await db.execute(sql`
      SELECT * FROM lender_entity LIMIT 1
    `);
    
    if (!result.rows.length) {
      return null;
    }
    
    return result.rows[0];
  }

  /**
   * Insert default templates
   */
  async insertDefaultTemplates(): Promise<void> {
    // Insert lender entity if not exists
    await db.execute(sql`
      INSERT INTO lender_entity (legal_name, dba_name, tin, nmls_id, mailing_address, service_email, service_phone)
      VALUES (
        'LoanServe Financial LLC',
        'LoanServe Pro',
        '12-3456789',
        'MLS123456',
        '{"street": "100 Financial Plaza", "city": "New York", "state": "NY", "zip": "10001"}',
        'servicing@loanserve.pro',
        '1-800-555-0100'
      )
      ON CONFLICT DO NOTHING
    `);
    // Insert default billing statement template
    await db.execute(sql`
      INSERT INTO document_template (type, version, engine, html_source, css_source)
      VALUES (
        'billing_statement',
        1,
        'handlebars-html',
        ${this.getDefaultBillingStatementHTML()},
        ${this.getDefaultCSS()}
      )
      ON CONFLICT DO NOTHING
    `);

    // Insert default escrow analysis template
    await db.execute(sql`
      INSERT INTO document_template (type, version, engine, html_source, css_source)
      VALUES (
        'escrow_analysis',
        1,
        'handlebars-html',
        ${this.getDefaultEscrowAnalysisHTML()},
        ${this.getDefaultCSS()}
      )
      ON CONFLICT DO NOTHING
    `);

    // Insert default 1098 template
    await db.execute(sql`
      INSERT INTO document_template (type, version, engine, html_source, css_source)
      VALUES (
        'year_end_1098',
        1,
        'handlebars-html',
        ${this.getDefault1098HTML()},
        ${this.getDefaultCSS()}
      )
      ON CONFLICT DO NOTHING
    `);
  }

  private getDefaultBillingStatementHTML(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Billing Statement</title>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Monthly Billing Statement</h1>
      <div class="period">{{statement_period.start}} - {{statement_period.end}}</div>
    </div>
    
    <div class="borrower-info">
      <h2>Account Information</h2>
      <p>{{borrower.name}}<br>{{borrower.mailing_address}}</p>
      <p>Loan ID: {{loan_id}}</p>
    </div>
    
    <div class="summary">
      <h2>Account Summary</h2>
      <table>
        <tr><td>Previous Balance:</td><td>{{formatMinor previous_balance_minor}}</td></tr>
        <tr><td>Escrow Payment:</td><td>{{formatMinor escrow_monthly_target_minor}}</td></tr>
        <tr><td>Total Due:</td><td class="total">{{formatMinor total_due_minor}}</td></tr>
        <tr><td>Due Date:</td><td>{{statement_period.due_date}}</td></tr>
      </table>
    </div>
    
    <div class="transactions">
      <h2>Transaction History</h2>
      <table>
        <thead>
          <tr><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th></tr>
        </thead>
        <tbody>
          {{#each transactions}}
          <tr>
            <td>{{posted_at}}</td>
            <td>{{description}}</td>
            <td>{{#if debit_minor}}{{formatMinor debit_minor}}{{/if}}</td>
            <td>{{#if credit_minor}}{{formatMinor credit_minor}}{{/if}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    </div>
    
    {{#if messages}}
    <div class="messages">
      {{#each messages}}
      <p>{{this}}</p>
      {{/each}}
    </div>
    {{/if}}
  </div>
</body>
</html>`;
  }

  private getDefaultEscrowAnalysisHTML(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Escrow Analysis</title>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Annual Escrow Analysis</h1>
      <div class="period">Period: {{period_start}} - {{period_end}}</div>
    </div>
    
    <div class="summary">
      <h2>Analysis Summary</h2>
      <table>
        <tr><td>Annual Expected:</td><td>{{formatMinor annual_expected_minor}}</td></tr>
        <tr><td>Cushion Target:</td><td>{{formatMinor cushion_target_minor}}</td></tr>
        <tr><td>Current Balance:</td><td>{{formatMinor current_balance_minor}}</td></tr>
        {{#if shortage_minor}}<tr><td>Shortage:</td><td>{{formatMinor shortage_minor}}</td></tr>{{/if}}
        {{#if deficiency_minor}}<tr><td>Deficiency:</td><td>{{formatMinor deficiency_minor}}</td></tr>{{/if}}
        {{#if surplus_minor}}<tr><td>Surplus:</td><td>{{formatMinor surplus_minor}}</td></tr>{{/if}}
        <tr><td>New Monthly Payment:</td><td class="total">{{formatMinor new_monthly_target_minor}}</td></tr>
      </table>
    </div>
    
    <div class="items">
      <h2>Scheduled Items</h2>
      <table>
        <thead>
          <tr><th>Due Date</th><th>Type</th><th>Payee</th><th>Amount</th></tr>
        </thead>
        <tbody>
          {{#each items}}
          <tr>
            <td>{{due_date}}</td>
            <td>{{type}}</td>
            <td>{{payee}}</td>
            <td>{{formatMinor amount_minor}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
  }

  private getDefault1098HTML(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Form 1098 - Mortgage Interest Statement</title>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Form 1098</h1>
      <h2>Mortgage Interest Statement</h2>
      <div class="tax-year">Tax Year {{tax_year}}</div>
    </div>
    
    <div class="parties">
      <div class="lender">
        <h3>LENDER</h3>
        <p>{{lender.name}}<br>{{lender.address}}</p>
        {{#if lender.tin_last4}}<p>TIN: ***-**-{{lender.tin_last4}}</p>{{/if}}
      </div>
      
      <div class="borrower">
        <h3>BORROWER</h3>
        <p>{{borrower.name}}<br>{{borrower.mailing_address}}</p>
        {{#if borrower.tin_last4}}<p>TIN: ***-**-{{borrower.tin_last4}}</p>{{/if}}
      </div>
    </div>
    
    <div class="amounts">
      <table>
        <tr>
          <td>1. Mortgage Interest Received:</td>
          <td class="amount">{{formatMinor interest_received_minor}}</td>
        </tr>
        {{#if mortgage_insurance_premiums_minor}}
        <tr>
          <td>2. Mortgage Insurance Premiums:</td>
          <td class="amount">{{formatMinor mortgage_insurance_premiums_minor}}</td>
        </tr>
        {{/if}}
        {{#if points_paid_minor}}
        <tr>
          <td>3. Points Paid on Purchase:</td>
          <td class="amount">{{formatMinor points_paid_minor}}</td>
        </tr>
        {{/if}}
      </table>
    </div>
    
    <div class="property">
      <p><strong>Property Address:</strong> {{property_address}}</p>
      <p><strong>Account Number:</strong> {{account_number}}</p>
    </div>
    
    <div class="footer">
      <p>This is important tax information and is being furnished to the Internal Revenue Service.</p>
    </div>
  </div>
</body>
</html>`;
  }

  private getDefaultCSS(): string {
    return `
body { 
  font-family: 'DejaVu Sans', sans-serif; 
  font-size: 12pt; 
  line-height: 1.6; 
  color: #000; 
  margin: 0; 
  padding: 0;
}
.container { 
  max-width: 8.5in; 
  margin: 0 auto; 
  padding: 0.5in;
}
.header { 
  border-bottom: 2px solid #000; 
  padding-bottom: 10px; 
  margin-bottom: 20px;
}
h1 { 
  font-size: 18pt; 
  margin: 0 0 5px 0;
}
h2 { 
  font-size: 14pt; 
  margin: 15px 0 10px 0;
  color: #333;
}
h3 { 
  font-size: 12pt; 
  margin: 10px 0 5px 0;
  color: #555;
}
table { 
  width: 100%; 
  border-collapse: collapse;
  margin: 10px 0;
}
td, th { 
  padding: 5px 10px; 
  text-align: left;
  border-bottom: 1px solid #ddd;
}
th { 
  font-weight: bold; 
  background: #f5f5f5;
}
.total { 
  font-weight: bold; 
  font-size: 14pt;
}
.amount { 
  text-align: right; 
  font-family: monospace;
}
.period { 
  font-size: 10pt; 
  color: #666;
}
.borrower-info, .lender, .borrower { 
  margin: 20px 0;
}
.parties { 
  display: flex; 
  justify-content: space-between;
}
.footer { 
  margin-top: 30px; 
  padding-top: 20px; 
  border-top: 1px solid #ccc; 
  font-size: 10pt; 
  color: #666;
}
.messages { 
  background: #f9f9f9; 
  border: 1px solid #ddd; 
  padding: 10px; 
  margin: 20px 0;
}
@media print {
  body { margin: 0; }
  .container { padding: 0; }
}`;
  }
}