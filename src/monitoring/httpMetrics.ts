import { httpRequestDuration } from "./metrics";

export function withHttpMetrics() {
  return (req:any,res:any,next:any)=>{
    const start = process.hrtime.bigint();
    res.on("finish", ()=>{
      const dur = Number((process.hrtime.bigint() - start) / BigInt(1e9)); // seconds int
      httpRequestDuration.labels(req.method, req.route?.path || req.path, String(res.statusCode)).observe(dur);
    });
    next();
  };
}