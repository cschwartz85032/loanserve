import client from "prom-client";

// Enable collection of default Node process metrics
if ((process.env.METRICS_ENABLED || "true") === "true") {
  client.collectDefaultMetrics({ prefix: "loanserve_node_" });
}

// ------------- Pipeline stage metrics -------------
export const pipelineStageStarted = new client.Counter({
  name: "loanserve_stage_started_total",
  help: "Pipeline stages started",
  labelNames: ["stage"] // import, split, ocr, extract, qc, export, notify
});

export const pipelineStageCompleted = new client.Counter({
  name: "loanserve_stage_completed_total",
  help: "Pipeline stages completed",
  labelNames: ["stage"]
});

export const pipelineStageDuration = new client.Histogram({
  name: "loanserve_stage_duration_seconds",
  help: "Stage duration seconds (e2e per loan/stage)",
  labelNames: ["stage"],
  buckets: [1, 3, 5, 10, 30, 60, 120, 300, 900, 1800]
});

// ------------- Confidence & HITL -------------
export const extractConfidence = new client.Histogram({
  name: "loanserve_extract_confidence",
  help: "Distribution of extraction confidences",
  labelNames: ["key","source"], // InterestRate|NoteAmount... + deterministic|ai_doc|payload|vendor
  buckets: [0.5,0.6,0.7,0.8,0.9,0.95,0.99,1.0]
});

export const hitlConflicts = new client.Counter({
  name: "loanserve_hitl_conflicts_total",
  help: "Count of conflicts requiring HITL",
  labelNames: ["key"]
});

// ------------- Quality Control -------------
export const qcDefectsOpen = new client.Gauge({
  name: "loanserve_qc_defects_open",
  help: "Open QC defects",
  labelNames: ["rule_code","severity"] // QC001..; Low|Medium|High|Critical
});

// Rolling MTTR timer; record seconds to resolution per defect
export const qcDefectResolution = new client.Histogram({
  name: "loanserve_qc_defect_resolution_seconds",
  help: "Time to resolve QC defects",
  labelNames: ["rule_code","severity"],
  buckets: [600,1800,3600,14400,28800,86400,172800] // 10m..2d
});

// ------------- Do-Not-Ping savings -------------
export const dnpPrevented = new client.Counter({
  name: "loanserve_dnp_prevented_total",
  help: "Count of notifications suppressed by Do-Not-Ping",
  labelNames: ["template_code"]
});

// ------------- RabbitMQ queue health -------------
export const rmqQueueDepth = new client.Gauge({
  name: "loanserve_rmq_queue_depth",
  help: "RabbitMQ queue message count",
  labelNames: ["queue"]
});

export const rmqQueueDlqDepth = new client.Gauge({
  name: "loanserve_rmq_dlq_depth",
  help: "RabbitMQ DLQ message count",
  labelNames: ["queue"]
});

// ------------- Exports -------------
export const exportSuccess = new client.Counter({
  name: "loanserve_export_success_total",
  help: "Successful exports",
  labelNames: ["template"] // fannie|freddie|custom
});

export const exportFailure = new client.Counter({
  name: "loanserve_export_failure_total",
  help: "Failed exports",
  labelNames: ["template"]
});

// ------------- API health (requests, latencies) -------------
export const httpRequestDuration = new client.Histogram({
  name: "loanserve_http_request_duration_seconds",
  help: "HTTP request duration",
  labelNames: ["method","route","code"],
  buckets: [0.03,0.05,0.1,0.2,0.5,1,2,5]
});

export { client };