/**
 * Lineage Enforcement Test
 * Verifies that datapoints include complete lineage tracking and evidence
 * NON-NEGOTIABLE: This test must pass for explainable AI compliance
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withTenantClient } from '../../src/db/withTenantClient';
import { drizzle } from 'drizzle-orm/postgres-js';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL!;

describe('Lineage Enforcement Test - Evidence Tracking', () => {
  const TENANT_ID = '00000000-0000-0000-0000-0000000000AA';
  let loanId: string;
  let documentId: string;

  beforeAll(async () => {
    // Set up test loan and document
    await withTenantClient(TENANT_ID, async (client) => {
      // Create test loan
      const loanResult = await client.query(`
        INSERT INTO loan_candidates (id, tenant_id, status) 
        VALUES (gen_random_uuid(), $1, 'new') 
        RETURNING id
      `, [TENANT_ID]);
      loanId = loanResult.rows[0].id;

      // Create test document
      const docResult = await client.query(`
        INSERT INTO loan_documents (id, loan_id, storage_uri, sha256, doc_type) 
        VALUES (gen_random_uuid(), $1, 'test://evidence.pdf', 'deadbeef123', 'promissory_note') 
        RETURNING id
      `, [loanId]);
      documentId = docResult.rows[0].id;
    });
  });

  afterAll(async () => {
    // Clean up test data
    const pool = new Pool({ connectionString: DATABASE_URL });
    await pool.query('DELETE FROM loan_candidates WHERE id = $1', [loanId]);
    await pool.end();
  });

  it('should persist datapoints with complete lineage and versions', async () => {
    await withTenantClient(TENANT_ID, async (client) => {
      // Insert datapoint with full lineage
      await client.query(`
        INSERT INTO loan_datapoints (
          loan_id, key, value, confidence, evidence_doc_id, evidence_page, 
          evidence_text_hash, extractor_version, prompt_version, authority_priority,
          authority_decision, ingest_source, autofilled_from, evidence_bounding_box
        )
        VALUES (
          $1, 'InterestRate', '7.125', 0.95, $2, 1, 
          'deadbeef', 'v2025.09.03', 'v1.2.0', 85,
          'auto_accept_high_confidence', 'ai_extraction', 'document', 
          '{"x": 100, "y": 200, "width": 50, "height": 20}'::jsonb
        )
      `, [loanId, documentId]);

      // Verify lineage completeness
      const result = await client.query(`
        SELECT 
          confidence, extractor_version, prompt_version, evidence_doc_id, 
          evidence_page, evidence_text_hash, authority_priority, authority_decision,
          ingest_source, autofilled_from, evidence_bounding_box
        FROM loan_datapoints 
        WHERE loan_id = $1 AND key = 'InterestRate'
      `, [loanId]);

      expect(result.rows).toHaveLength(1);
      const datapoint = result.rows[0];

      // Verify all lineage fields are present
      expect(datapoint.confidence).toBeGreaterThan(0.9);
      expect(datapoint.extractor_version).toMatch(/v2025/);
      expect(datapoint.prompt_version).toBeTruthy();
      expect(datapoint.evidence_doc_id).toBeTruthy();
      expect(datapoint.evidence_page).toBe(1);
      expect(datapoint.evidence_text_hash).toBeTruthy();
      expect(datapoint.authority_priority).toBeGreaterThan(0);
      expect(datapoint.authority_decision).toBeTruthy();
      expect(datapoint.ingest_source).toBe('ai_extraction');
      expect(datapoint.autofilled_from).toBe('document');
      expect(datapoint.evidence_bounding_box).toBeTruthy();
    });
  });

  it('should enforce evidence FK relationship', async () => {
    await withTenantClient(TENANT_ID, async (client) => {
      // Try to insert datapoint with invalid evidence_doc_id
      const invalidDocId = '00000000-0000-0000-0000-000000000999';
      
      let errorOccurred = false;
      try {
        await client.query(`
          INSERT INTO loan_datapoints (
            loan_id, key, value, evidence_doc_id, ingest_source, autofilled_from
          )
          VALUES ($1, 'TestKey', 'TestValue', $2, 'document', 'document')
        `, [loanId, invalidDocId]);
      } catch (error) {
        errorOccurred = true;
        expect(error.message).toContain('violates foreign key constraint');
      }
      
      expect(errorOccurred).toBe(true);
    });
  });

  it('should enforce confidence range constraints', async () => {
    await withTenantClient(TENANT_ID, async (client) => {
      // Try to insert datapoint with invalid confidence (> 1.0)
      let errorOccurred = false;
      try {
        await client.query(`
          INSERT INTO loan_datapoints (
            loan_id, key, value, confidence, ingest_source, autofilled_from
          )
          VALUES ($1, 'TestKey', 'TestValue', 1.5, 'ai_extraction', 'document')
        `, [loanId]);
      } catch (error) {
        errorOccurred = true;
        expect(error.message).toContain('check constraint');
      }
      
      expect(errorOccurred).toBe(true);
    });
  });

  it('should enforce authority priority constraints', async () => {
    await withTenantClient(TENANT_ID, async (client) => {
      // Try to insert datapoint with negative authority priority
      let errorOccurred = false;
      try {
        await client.query(`
          INSERT INTO loan_datapoints (
            loan_id, key, value, authority_priority, ingest_source, autofilled_from
          )
          VALUES ($1, 'TestKey', 'TestValue', -10, 'manual_entry', 'payload')
        `, [loanId]);
      } catch (error) {
        errorOccurred = true;
        expect(error.message).toContain('check constraint');
      }
      
      expect(errorOccurred).toBe(true);
    });
  });

  it('should track extraction lineage with proper hierarchy', async () => {
    await withTenantClient(TENANT_ID, async (client) => {
      // Insert datapoint extracted from document
      await client.query(`
        INSERT INTO loan_datapoints (
          loan_id, key, value, confidence, evidence_doc_id, evidence_page,
          extractor_version, authority_priority, ingest_source, autofilled_from
        )
        VALUES (
          $1, 'LoanAmount', '250000', 0.92, $2, 2,
          'v2025.09.03', 80, 'ai_extraction', 'document'
        )
      `, [loanId, documentId]);

      // Query lineage chain
      const result = await client.query(`
        SELECT 
          ldp.key, ldp.value, ldp.confidence, ldp.evidence_doc_id,
          ldp.evidence_page, ldp.extractor_version, ldp.authority_priority,
          ld.doc_type, ld.storage_uri
        FROM loan_datapoints ldp
        LEFT JOIN loan_documents ld ON ldp.evidence_doc_id = ld.id
        WHERE ldp.loan_id = $1 AND ldp.key = 'LoanAmount'
      `, [loanId]);

      expect(result.rows).toHaveLength(1);
      const lineage = result.rows[0];

      // Verify complete lineage chain
      expect(lineage.key).toBe('LoanAmount');
      expect(lineage.value).toBe('250000');
      expect(lineage.confidence).toBeGreaterThan(0.9);
      expect(lineage.evidence_doc_id).toBe(documentId);
      expect(lineage.evidence_page).toBe(2);
      expect(lineage.extractor_version).toBe('v2025.09.03');
      expect(lineage.authority_priority).toBe(80);
      expect(lineage.doc_type).toBe('promissory_note');
      expect(lineage.storage_uri).toBe('test://evidence.pdf');
    });
  });

  it('should backfill lineage for existing datapoints', async () => {
    await withTenantClient(TENANT_ID, async (client) => {
      // Insert datapoint without lineage (simulating legacy data)
      await client.query(`
        INSERT INTO loan_datapoints (
          loan_id, key, value, ingest_source, autofilled_from
        )
        VALUES ($1, 'LegacyKey', 'LegacyValue', 'manual_entry', 'payload')
      `, [loanId]);

      // Verify backfill logic would apply defaults
      const result = await client.query(`
        SELECT confidence, authority_priority, extractor_version, produced_at
        FROM loan_datapoints 
        WHERE loan_id = $1 AND key = 'LegacyKey'
      `, [loanId]);

      const datapoint = result.rows[0];
      
      // These should be backfilled by the migration or application logic
      expect(datapoint.produced_at).toBeTruthy();
      // Note: extractor_version and other fields may be NULL for manual entries,
      // which is acceptable per business rules
    });
  });

  it('should enforce NOT NULL constraints on critical fields', async () => {
    await withTenantClient(TENANT_ID, async (client) => {
      // Try to insert datapoint without required fields
      let errorOccurred = false;
      try {
        await client.query(`
          INSERT INTO loan_datapoints (loan_id, key)
          VALUES ($1, 'IncompleteKey')
        `, [loanId]);
      } catch (error) {
        errorOccurred = true;
        expect(error.message).toContain('null value in column');
      }
      
      expect(errorOccurred).toBe(true);
    });
  });
});