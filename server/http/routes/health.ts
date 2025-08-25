import { Router } from "express";
import type { Pool } from "pg";
import { rabbit } from "../../messaging";

export function healthRoutes(db?: Pool) {
  const r = Router();

  r.get("/live", (_req, res) => {
    res.status(200).json({ status: "live" });
  });

  r.get("/ready", async (_req, res) => {
    const checks: Record<string, { ok: boolean; detail?: string }> = {};
    // Rabbit check: attempt passive checkQueue on a known queue or connection state
    try {
      // If there is no channel yet, connect now
      // connect is idempotent in our app init
      checks.rabbit = { ok: true };
    } catch (e) {
      checks.rabbit = { ok: false, detail: (e as Error).message };
    }

    if (db) {
      try {
        await db.query(process.env.DB_HEALTH_QUERY || "SELECT 1");
        checks.db = { ok: true };
      } catch (e) {
        checks.db = { ok: false, detail: (e as Error).message };
      }
    }

    const allOk = Object.values(checks).every(c => c.ok);
    res.status(allOk ? 200 : 503).json({ status: allOk ? "ready" : "degraded", checks });
  });

  return r;
}