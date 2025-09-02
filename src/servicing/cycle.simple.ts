import { pool } from "../../server/db";

export async function testSimpleCycle(tenantId: string, asOfISO?: string) {
  const asOf = asOfISO || "2025-01-15";
  const client = await pool.connect();
  
  try {
    console.log('Testing simple cycle execution...');
    
    // Test 1: Simple select
    console.log('Test 1: Simple tenant check');
    const test1 = await client.query(`SELECT COUNT(*) FROM svc_accounts`);
    console.log('Accounts found:', test1.rows[0].count);
    
    // Test 2: Parameterized query
    console.log('Test 2: Parameterized query');
    const test2 = await client.query(`SELECT COUNT(*) FROM svc_accounts WHERE state = $1`, ['Active']);
    console.log('Active accounts:', test2.rows[0].count);
    
    // Test 3: Complex query similar to cycle
    console.log('Test 3: Complex query like in cycle');
    const test3 = await client.query(`
      SELECT COUNT(*) FROM svc_cycle_runs WHERE tenant_id = $1 AND as_of_date = $2
    `, [tenantId, asOf]);
    console.log('Existing cycle runs:', test3.rows[0].count);
    
    return { ok: true, tests: 3 };
    
  } catch (error) {
    console.error('Simple cycle test failed:', error);
    throw error;
  } finally {
    client.release();
  }
}