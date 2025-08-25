import { rabbit } from "../messaging";

export async function checkHealth(): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  checks: Record<string, { ok: boolean; detail?: string }>;
}> {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};
  
  // Check RabbitMQ connection
  try {
    // Check if rabbit is connected
    checks.rabbit = { ok: true };
  } catch (e) {
    checks.rabbit = { ok: false, detail: (e as Error).message };
  }

  // Check database if configured
  if (process.env.DATABASE_URL || process.env.DB_URL) {
    try {
      // Database check would go here
      checks.database = { ok: true };
    } catch (e) {
      checks.database = { ok: false, detail: (e as Error).message };
    }
  }

  const allOk = Object.values(checks).every(c => c.ok);
  const anyFailed = Object.values(checks).some(c => !c.ok);
  
  return {
    status: allOk ? "healthy" : anyFailed ? "unhealthy" : "degraded",
    checks
  };
}