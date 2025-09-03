import { pool } from "../db";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

describe("RLS Isolation", () => {
  it("denies cross-tenant reads", async () => {
  const c = await pool.connect();
  try {
    // Simulate tenant A
    await c.query(`SET LOCAL app.tenant_id = $1`, ['00000000-0000-0000-0000-00000000000A']);
    // Insert a loan for tenant A
    const a = await c.query(`INSERT INTO loan_candidates (id, tenant_id, status) VALUES (gen_random_uuid(), $1, 'new') RETURNING id`, ['00000000-0000-0000-0000-00000000000A']);
    // Switch to tenant B
    await c.query(`SET LOCAL app.tenant_id = $1`, ['00000000-0000-0000-0000-00000000000B']);
    const r = await c.query(`SELECT * FROM loan_candidates WHERE id=$1`, [a.rows[0].id]);
    expect(r.rowCount).toBe(0); // RLS blocked
  } finally { c.release(); }
  });
});