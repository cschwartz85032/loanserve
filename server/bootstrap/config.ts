import Ajv from "ajv";
import schema from "../../config/schema.json" assert { type: "json" };

export type NodeEnv = "local" | "dev" | "staging" | "prod";

export interface AppConfig {
  nodeEnv: NodeEnv;
  serviceName: string;
  httpPort: number;
  amqpUrl: string;
  rabbitHeartbeatSec: number;
  rabbitPrefetch: number;
  rabbitReconnectMax: number;
  rabbitReconnectBaseMs: number;
  otelEndpoint: string;
  otelSamplingRatio: number;
  otelResourceAttributes: string;
  logLevel: "trace"|"debug"|"info"|"warn"|"error"|"fatal";
  logPretty: boolean;
  dbUrl?: string;
  dbHealthQuery?: string;
}

const ajv = new Ajv({ allErrors: true, useDefaults: true });

export function loadConfig(): AppConfig {
  const cfg: AppConfig = {
    nodeEnv: (process.env.NODE_ENV as NodeEnv) || "local",
    serviceName: process.env.SERVICE_NAME || "loanserve-core",
    httpPort: parseInt(process.env.HTTP_PORT || "8080", 10),
    amqpUrl: process.env.CLOUDAMQP_URL || "",
    rabbitHeartbeatSec: parseInt(process.env.RABBIT_HEARTBEAT_SEC || "30", 10),
    rabbitPrefetch: parseInt(process.env.RABBIT_PREFETCH || "10", 10),
    rabbitReconnectMax: parseInt(process.env.RABBIT_RECONNECT_MAX || "10", 10),
    rabbitReconnectBaseMs: parseInt(process.env.RABBIT_RECONNECT_BASE_MS || "5000", 10),
    otelEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "",
    otelSamplingRatio: parseFloat(process.env.OTEL_SAMPLING_RATIO || "1"),
    otelResourceAttributes: process.env.OTEL_RESOURCE_ATTRIBUTES || "",
    logLevel: (process.env.LOG_LEVEL as AppConfig["logLevel"]) || "info",
    logPretty: process.env.LOG_PRETTY === "true",
    dbUrl: process.env.DB_URL || process.env.DATABASE_URL,
    dbHealthQuery: process.env.DB_HEALTH_QUERY || "SELECT 1"
  };

  const validate = ajv.compile(schema);
  if (!validate(cfg)) {
    const msgs = (validate.errors || []).map(e => `${e.instancePath} ${e.message}`).join("; ");
    throw new Error(`Invalid configuration: ${msgs}`);
  }
  return cfg;
}