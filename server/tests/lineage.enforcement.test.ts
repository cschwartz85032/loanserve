import { withTenantClient } from "../../src/db/withTenantClient";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

describe("Lineage Enforcement", () => {
  it("persists datapoints with lineage and versions", async ()=>{
  const tenant = '00000000-0000-0000-0000-0000000000AA';
  const loanId = await withTenantClient(tenant, async (c) => {
    const r = await c.query(`INSERT INTO loan_candidates (id, tenant_id, status) VALUES (gen_random_uuid(), $1, 'new') RETURNING id`, [tenant]);
    return r.rows[0].id;
  });
  await withTenantClient(tenant, async (c) => {
    await c.query(`
      INSERT INTO loan_datapoints (loan_id, key, value, confidence, evidence_doc_id, evidence_page, evidence_text_hash, extractor_version)
      VALUES ($1,'InterestRate','7.125',0.95,gen_random_uuid(),1,'deadbeef', 'v2025.09.03')`, [loanId]);
    const q = await c.query(`SELECT confidence, extractor_version, evidence_doc_id FROM loan_datapoints WHERE loan_id=$1 AND key='InterestRate'`, [loanId]);
    expect(q.rows[0].confidence).toBeGreaterThan(0.9);
    expect(q.rows[0].extractor_version).toMatch(/v2025/);
    expect(q.rows[0].evidence_doc_id).toBeTruthy();
  });
  });
});