import { Router } from "express";
import { client } from "../monitoring/metrics";

export const metricsRouter = Router();

metricsRouter.get("/metrics", async (_req,res)=>{
  res.set("Content-Type","text/plain");
  res.end(await client.register.metrics());
});