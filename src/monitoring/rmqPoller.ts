import { rmqQueueDepth, rmqQueueDlqDepth } from "./metrics";

const queuesToWatch = [
  "loan.docs.uploaded.q","loan.docs.chunked.q","loan.ocr.completed.q","loan.extract.completed.q",
  "loan.qc.start.q","loan.qc.completed.q",
  "loan.export.request.q","loan.export.start.q","loan.export.completed.q",
  "notify.request.q","notify.send.q","notify.sent.q","notify.failed.q"
];

export async function startRmqPoller(intervalMs=15000) {
  if (!process.env.RMQ_MGMT_URL) return;
  setInterval(async ()=>{
    try {
      const res = await fetch(`${process.env.RMQ_MGMT_URL}/queues/${encodeURIComponent(process.env.RMQ_VHOST || "/")}`, {
        headers: { "Authorization": "Basic " + Buffer.from(`${process.env.RMQ_MGMT_USER}:${process.env.RMQ_MGMT_PASS}`).toString("base64") }
      });
      if (!res.ok) return;
      const data:any[] = await res.json();
      for (const q of queuesToWatch) {
        const m = data.find(d => d.name === q);
        if (m) {
          rmqQueueDepth.labels(q).set(m.messages ?? 0);
        }
        const dlq = `${q}.dlq`;
        const d = data.find(d0 => d0.name === dlq);
        if (d) {
          rmqQueueDlqDepth.labels(q).set(d.messages ?? 0);
        }
      }
    } catch {}
  }, intervalMs).unref();
}