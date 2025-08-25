import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { AppConfig } from "./config";

export async function startTelemetry(cfg: AppConfig) {
  const [serviceName, serviceNamespace, serviceVersion] = parseResource(cfg.otelResourceAttributes, cfg);

  const traceExporter = new OTLPTraceExporter({ url: `${cfg.otelEndpoint}/v1/traces` });
  const metricExporter = new OTLPMetricExporter({ url: `${cfg.otelEndpoint}/v1/metrics` });

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_NAMESPACE]: serviceNamespace,
      [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion
    }),
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({ exporter: metricExporter, exportIntervalMillis: 15000 }),
    sampler: { shouldSample: () => ({ decision: Math.random() < cfg.otelSamplingRatio ? 1 : 0, attributes: {}, traceState: null }) }
  });

  await sdk.start();
  return sdk;
}

function parseResource(attr: string, cfg: AppConfig) {
  // fallback defaults
  let serviceName = cfg.serviceName;
  let serviceNamespace = "servicing";
  let serviceVersion = "0.0.1";
  for (const kv of attr.split(",")) {
    const [k, v] = kv.split("=");
    if (k === "service.name") serviceName = v;
    if (k === "service.namespace") serviceNamespace = v;
    if (k === "service.version") serviceVersion = v;
  }
  return [serviceName, serviceNamespace, serviceVersion] as const;
}