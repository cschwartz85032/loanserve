import express from "express";
import { randomUUID } from "crypto";
import { getLogger, withCorrelation } from "../bootstrap/logger";
import { healthRoutes } from "./routes/health";
import type { Pool } from "pg";

export function startHttpServer(port: number, logLevel: string, db?: Pool) {
  const app = express();
  const logger = getLogger(logLevel, process.env.LOG_PRETTY === "true");

  app.use((req, _res, next) => {
    const cid = (req.header("x-correlation-id") || randomUUID()).toString();
    // attach for downstream handlers
    (req as any).correlationId = cid;
    withCorrelation(cid, async () => next());
  });

  app.get("/health/live", (_req, res) => res.redirect(307, "/health/live"));
  app.use("/health", healthRoutes(db));

  const srv = app.listen(port, () => {
    logger.info({ port }, "HTTP server started");
  });

  return { app, srv };
}