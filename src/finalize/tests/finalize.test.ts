import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { finalizeLoan, canFinalizeLoan, getFinalizationStatus } from '../engine';
import { sha256Json } from '../../utils/hash';
import { pool } from '../../../server/db';

describe('Finalization Engine', () => {
  const testTenantId = 'test-tenant-001';
  const testLoanId = 'test-loan-001';
  const testUserId = 'test-user-001';

  beforeEach(async () => {
    // Set up test data
    const client = await pool.connect();
    try {
      await client.query(`SET LOCAL app.tenant_id = $1`, [testTenantId]);
      
      // Insert test loan
      await client.query(`
        INSERT INTO loan_candidates (id, tenant_id, state) 
        VALUES ($1, $2, 'qc') 
        ON CONFLICT (id) DO UPDATE SET state = 'qc'
      `, [testLoanId, testTenantId]);

      // Insert test QC rules
      await client.query(`
        INSERT INTO qc_rules (id, code, name, severity, enabled) 
        VALUES 
          ('rule-1', 'R001', 'Income Verification', 'Warning', true),
          ('rule-2', 'R002', 'Property Appraisal', 'Critical', true)
        ON CONFLICT (id) DO NOTHING
      `);

      // Insert test canonical data points
      await client.query(`
        INSERT INTO loan_datapoints (loan_id, key, value, confidence) 
        VALUES 
          ($1, 'BorrowerFullName', 'John Doe', 0.95),
          ($1, 'NoteAmount', '250000', 1.0),
          ($1, 'InterestRate', '6.5', 1.0)
        ON CONFLICT (loan_id, key) DO UPDATE SET value = EXCLUDED.value
      `, [testLoanId]);

    } finally {
      client.release();
    }
  });

  afterEach(async () => {
    // Clean up test data
    const client = await pool.connect();
    try {
      await client.query(`SET LOCAL app.tenant_id = $1`, [testTenantId]);
      await client.query(`DELETE FROM qc_certificates WHERE tenant_id = $1 AND loan_id = $2`, [testTenantId, testLoanId]);
      await client.query(`DELETE FROM discrepancy_reports WHERE tenant_id = $1 AND loan_id = $2`, [testTenantId, testLoanId]);
      await client.query(`DELETE FROM qc_defects WHERE loan_id = $1`, [testLoanId]);
      await client.query(`DELETE FROM loan_datapoints WHERE loan_id = $1`, [testLoanId]);
      await client.query(`DELETE FROM loan_candidates WHERE id = $1`, [testLoanId]);
    } finally {
      client.release();
    }
  });

  describe('canFinalizeLoan', () => {
    it('should allow finalization when no critical defects exist', async () => {
      const result = await canFinalizeLoan(testTenantId, testLoanId);
      expect(result.canFinalize).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('should block finalization when critical defects exist', async () => {
      // Add a critical defect
      const client = await pool.connect();
      try {
        await client.query(`SET LOCAL app.tenant_id = $1`, [testTenantId]);
        await client.query(`
          INSERT INTO qc_defects (loan_id, rule_id, status, message) 
          VALUES ($1, 'rule-2', 'open', 'Missing property appraisal')
        `, [testLoanId]);
      } finally {
        client.release();
      }

      const result = await canFinalizeLoan(testTenantId, testLoanId);
      expect(result.canFinalize).toBe(false);
      expect(result.reasons).toContain('Critical QC defect: R002 - Property Appraisal');
    });

    it('should block finalization when loan is already finalized', async () => {
      // Mark loan as finalized
      const client = await pool.connect();
      try {
        await client.query(`SET LOCAL app.tenant_id = $1`, [testTenantId]);
        await client.query(`
          UPDATE loan_candidates 
          SET state = 'finalized', finalized_at = now(), finalized_by = $2
          WHERE id = $1
        `, [testLoanId, testUserId]);
      } finally {
        client.release();
      }

      const result = await canFinalizeLoan(testTenantId, testLoanId);
      expect(result.canFinalize).toBe(false);
      expect(result.reasons).toContain('Loan already finalized');
    });
  });

  describe('finalizeLoan', () => {
    it('should successfully finalize a loan with no critical defects', async () => {
      const result = await finalizeLoan(testTenantId, testLoanId, testUserId);
      
      expect(result.success).toBe(true);
      expect(result.certificateUri).toBeDefined();
      expect(result.discrepancyReportUri).toBeDefined();
      expect(result.hashes.docset).toBeDefined();
      expect(result.hashes.canonical).toBeDefined();
      
      // Verify loan state was updated
      const status = await getFinalizationStatus(testTenantId, testLoanId);
      expect(status.state).toBe('finalized');
      expect(status.finalizedBy).toBe(testUserId);
      expect(status.certificate).not.toBeNull();
    });

    it('should throw error when trying to finalize loan with critical defects', async () => {
      // Add a critical defect
      const client = await pool.connect();
      try {
        await client.query(`SET LOCAL app.tenant_id = $1`, [testTenantId]);
        await client.query(`
          INSERT INTO qc_defects (loan_id, rule_id, status, message) 
          VALUES ($1, 'rule-2', 'open', 'Missing property appraisal')
        `, [testLoanId]);
      } finally {
        client.release();
      }

      await expect(finalizeLoan(testTenantId, testLoanId, testUserId))
        .rejects.toThrow('Cannot finalize with open Critical QC defects');
    });
  });

  describe('getFinalizationStatus', () => {
    it('should return correct status for unfinalized loan', async () => {
      const status = await getFinalizationStatus(testTenantId, testLoanId);
      
      expect(status.state).toBe('qc');
      expect(status.finalizedAt).toBeNull();
      expect(status.finalizedBy).toBeNull();
      expect(status.certificate).toBeNull();
      expect(status.discrepancyReport).toBeNull();
    });

    it('should return complete status for finalized loan', async () => {
      // Finalize the loan first
      await finalizeLoan(testTenantId, testLoanId, testUserId);
      
      const status = await getFinalizationStatus(testTenantId, testLoanId);
      
      expect(status.state).toBe('finalized');
      expect(status.finalizedAt).not.toBeNull();
      expect(status.finalizedBy).toBe(testUserId);
      expect(status.certificate).not.toBeNull();
      expect(status.discrepancyReport).not.toBeNull();
      expect(status.certificate.version).toBe(process.env.FINALIZE_VERSION || 'v2025.09.03');
    });

    it('should throw error for non-existent loan', async () => {
      await expect(getFinalizationStatus(testTenantId, 'non-existent-loan'))
        .rejects.toThrow('Loan not found');
    });
  });

  describe('Hash Integrity', () => {
    it('should generate consistent hashes for same data', () => {
      const testData = { 
        BorrowerFullName: 'John Doe', 
        NoteAmount: '250000',
        InterestRate: '6.5' 
      };
      
      const hash1 = sha256Json(testData);
      const hash2 = sha256Json(testData);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // Valid SHA-256 hex format
    });

    it('should generate different hashes for different data', () => {
      const data1 = { BorrowerFullName: 'John Doe', NoteAmount: '250000' };
      const data2 = { BorrowerFullName: 'Jane Smith', NoteAmount: '300000' };
      
      const hash1 = sha256Json(data1);
      const hash2 = sha256Json(data2);
      
      expect(hash1).not.toBe(hash2);
    });
  });
});