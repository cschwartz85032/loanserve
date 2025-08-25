import { Pool } from "pg";

// Placeholder for database operations
// This module will be expanded in later phases

export function createDbPool(connectionString: string): Pool {
  return new Pool({ connectionString });
}

export async function pingDb(pool: Pool): Promise<boolean> {
  try {
    const result = await pool.query("SELECT 1");
    return result.rowCount > 0;
  } catch {
    return false;
  }
}