import { Router } from "express";
export const healthRouter = Router();

healthRouter.get("/healthz", (_req,res)=> res.status(200).json({ ok:true }));
healthRouter.get("/readyz", async (_req,res)=>{
  // Simple checks: DB connect, AMQP connect available in your app context
  try {
    // Example: await pool.query("select 1");
    // Example: await mq.ping();
    return res.status(200).json({ ok:true });
  } catch {
    return res.status(503).json({ ok:false });
  }
});