/**
 * RLS Isolation Test
 * Verifies that Row Level Security policies prevent cross-tenant data access
 * NON-NEGOTIABLE: This test must pass for regulatory compliance
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withTenantClient } from '../../src/db/withTenantClient';
import { drizzle } from 'drizzle-orm/postgres-js';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL!;

describe('RLS Isolation Test - Cross-Tenant Protection', () => {
  const TENANT_A = '00000000-0000-0000-0000-00000000000A';
  const TENANT_B = '00000000-0000-0000-0000-00000000000B';
  
  let loanIdTenantA: string;
  let loanIdTenantB: string;

  beforeAll(async () => {
    // Set up test data for both tenants
    await withTenantClient(TENANT_A, async (client) => {
      const db = drizzle(client);
      const result = await client.query(`
        INSERT INTO loan_candidates (id, tenant_id, status) 
        VALUES (gen_random_uuid(), $1, 'new') 
        RETURNING id
      `, [TENANT_A]);
      loanIdTenantA = result.rows[0].id;
    });

    await withTenantClient(TENANT_B, async (client) => {
      const db = drizzle(client);
      const result = await client.query(`
        INSERT INTO loan_candidates (id, tenant_id, status) 
        VALUES (gen_random_uuid(), $1, 'new') 
        RETURNING id
      `, [TENANT_B]);
      loanIdTenantB = result.rows[0].id;
    });
  });

  afterAll(async () => {
    // Clean up test data
    const pool = new Pool({ connectionString: DATABASE_URL });
    await pool.query('DELETE FROM loan_candidates WHERE id = $1 OR id = $2', [loanIdTenantA, loanIdTenantB]);
    await pool.end();
  });

  it('should deny cross-tenant reads on loan_candidates', async () => {
    await withTenantClient(TENANT_A, async (client) => {
      // Tenant A should see their own loan
      const ownResult = await client.query(
        'SELECT * FROM loan_candidates WHERE id = $1', 
        [loanIdTenantA]
      );
      expect(ownResult.rowCount).toBe(1);
      expect(ownResult.rows[0].tenant_id).toBe(TENANT_A);

      // Tenant A should NOT see Tenant B's loan (RLS blocks it)
      const crossResult = await client.query(
        'SELECT * FROM loan_candidates WHERE id = $1', 
        [loanIdTenantB]
      );
      expect(crossResult.rowCount).toBe(0); // RLS blocked access
    });
  });

  it('should deny cross-tenant reads on loan_documents', async () => {
    // First, create a document for Tenant A
    let documentIdA: string;
    await withTenantClient(TENANT_A, async (client) => {
      const result = await client.query(`
        INSERT INTO loan_documents (id, loan_id, storage_uri, sha256) 
        VALUES (gen_random_uuid(), $1, 'test://doc-a', 'hash-a') 
        RETURNING id
      `, [loanIdTenantA]);
      documentIdA = result.rows[0].id;
    });

    // Tenant B should not be able to access Tenant A's document
    await withTenantClient(TENANT_B, async (client) => {
      const result = await client.query(
        'SELECT * FROM loan_documents WHERE id = $1', 
        [documentIdA]
      );
      expect(result.rowCount).toBe(0); // RLS blocked access
    });
  });

  it('should deny cross-tenant reads on loan_datapoints', async () => {
    // First, create a datapoint for Tenant A
    let datapointIdA: string;
    await withTenantClient(TENANT_A, async (client) => {
      const result = await client.query(`
        INSERT INTO loan_datapoints (id, loan_id, key, value, ingest_source, autofilled_from) 
        VALUES (gen_random_uuid(), $1, 'InterestRate', '7.125', 'manual_entry', 'payload') 
        RETURNING id
      `, [loanIdTenantA]);
      datapointIdA = result.rows[0].id;
    });

    // Tenant B should not be able to access Tenant A's datapoint
    await withTenantClient(TENANT_B, async (client) => {
      const result = await client.query(
        'SELECT * FROM loan_datapoints WHERE id = $1', 
        [datapointIdA]
      );
      expect(result.rowCount).toBe(0); // RLS blocked access
    });
  });

  it('should deny cross-tenant reads on imports', async () => {
    // First, create an import for Tenant A
    let importIdA: string;
    await withTenantClient(TENANT_A, async (client) => {
      const result = await client.query(`
        INSERT INTO imports (id, tenant_id, type, filename, size_bytes, sha256, status, created_by) 
        VALUES (gen_random_uuid(), $1, 'pdf', 'test.pdf', 1024, 'hash', 'received', gen_random_uuid()) 
        RETURNING id
      `, [TENANT_A]);
      importIdA = result.rows[0].id;
    });

    // Tenant B should not be able to access Tenant A's import
    await withTenantClient(TENANT_B, async (client) => {
      const result = await client.query(
        'SELECT * FROM imports WHERE id = $1', 
        [importIdA]
      );
      expect(result.rowCount).toBe(0); // RLS blocked access
    });
  });

  it('should verify tenant context is enforced', async () => {
    // Test that without SET LOCAL app.tenant_id, no data is accessible
    const pool = new Pool({ connectionString: DATABASE_URL });
    
    try {
      // Without tenant context, RLS should block all access
      const result = await pool.query('SELECT COUNT(*) as count FROM loan_candidates');
      expect(parseInt(result.rows[0].count)).toBe(0);
    } finally {
      await pool.end();
    }
  });

  it('should allow tenant to see their own data only', async () => {
    await withTenantClient(TENANT_A, async (client) => {
      const result = await client.query(
        'SELECT * FROM loan_candidates WHERE tenant_id = $1', 
        [TENANT_A]
      );
      expect(result.rowCount).toBeGreaterThan(0);
      
      // Verify all returned rows belong to the correct tenant
      result.rows.forEach(row => {
        expect(row.tenant_id).toBe(TENANT_A);
      });
    });

    await withTenantClient(TENANT_B, async (client) => {
      const result = await client.query(
        'SELECT * FROM loan_candidates WHERE tenant_id = $1', 
        [TENANT_B]
      );
      expect(result.rowCount).toBeGreaterThan(0);
      
      // Verify all returned rows belong to the correct tenant
      result.rows.forEach(row => {
        expect(row.tenant_id).toBe(TENANT_B);
      });
    });
  });
});