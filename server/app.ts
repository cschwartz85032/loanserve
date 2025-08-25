import { loadConfig } from "./bootstrap/config";
import { getLogger } from "./bootstrap/logger";
import { startTelemetry } from "./bootstrap/telemetry";
import { rabbit } from "./messaging";
import { startHttpServer } from "./http/server";
import { Pool } from "pg";

async function main() {
  const cfg = loadConfig();
  const log = getLogger(cfg.logLevel, cfg.logPretty);

  // Initialize database pool if configured
  let db: Pool | undefined;
  if (cfg.dbUrl) {
    db = new Pool({ connectionString: cfg.dbUrl });
    log.info("Database pool initialized");
  }

  // Start telemetry only if endpoint is configured
  let otel: any;
  if (cfg.otelEndpoint) {
    try {
      otel = await startTelemetry(cfg);
      log.info("Telemetry started");
    } catch (e) {
      log.warn({ err: e }, "Failed to start telemetry, continuing without it");
    }
  }

  // Connect to RabbitMQ
  try {
    await rabbit.connect();
    log.info("RabbitMQ connected");
  } catch (e) {
    log.error({ err: e }, "Failed to connect to RabbitMQ");
    process.exit(1);
  }

  // Start HTTP server
  const { srv } = startHttpServer(cfg.httpPort, cfg.logLevel, db);

  // Setup graceful shutdown
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.warn({ signal }, "Shutting down...");
    try {
      srv.closeAllConnections?.();
      srv.close(() => { /* closed */ });
      await rabbit.shutdown();
      if (otel) await otel.shutdown();
      if (db) await db.end();
      log.info("Shutdown complete");
      process.exit(0);
    } catch (e) {
      log.error({ err: e }, "Shutdown error");
      process.exit(1);
    }
  }
}

main().catch((err) => {
  // last resort
  console.error(err);
  process.exit(1);
});