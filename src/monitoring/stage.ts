import { pipelineStageStarted, pipelineStageCompleted, pipelineStageDuration } from "./metrics";

const stageStartCache = new Map<string, number>(); // key: `${loanId}:${stage}`

export function stageStart(loanId:string, stage:"import"|"split"|"ocr"|"extract"|"qc"|"export"|"notify") {
  const key = `${loanId}:${stage}`;
  pipelineStageStarted.labels(stage).inc();
  stageStartCache.set(key, Date.now());
}

export function stageComplete(loanId:string, stage:"import"|"split"|"ocr"|"extract"|"qc"|"export"|"notify") {
  const key = `${loanId}:${stage}`;
  pipelineStageCompleted.labels(stage).inc();
  const t0 = stageStartCache.get(key);
  if (t0) {
    const secs = (Date.now() - t0) / 1000;
    pipelineStageDuration.labels(stage).observe(secs);
    stageStartCache.delete(key);
  }
}