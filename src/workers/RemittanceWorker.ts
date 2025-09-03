import { runRemittance } from "../investor/engine";
import { generateRemittanceStatement } from "../investor/statement";
import { processRemittancePayout } from "../investor/payout";

// Remittance processing worker
export async function startRemittanceWorker() {
  console.log('[RemittanceWorker] Worker started (placeholder implementation)');
  
  // In production, this would consume from remittance processing queues:
  // - "remittances.generate.q" - Remittance generation queue
  // - "statements.generate.q" - Statement generation queue
  // - "payouts.process.q" - Payout processing queue
  
  // Example of how the worker would function:
  // await mq.consume("remittances.generate.q", async (msg: any, ch: any) => {
  //   const { tenantId, investorId, asOf } = JSON.parse(msg.content.toString());
  //   try {
  //     const result = await runRemittance(tenantId, investorId, asOf);
  //     
  //     if (!result.skipped) {
  //       // Trigger statement generation
  //       await mq.publish("statements", "generate", { tenantId, runId: result.runId });
  //       
  //       // Trigger payout processing
  //       await mq.publish("payouts", "process", { tenantId, payoutId: result.payoutId });
  //     }
  //     
  //     await mq.publish("remittances", "completed", { tenantId, investorId, ...result });
  //     ch.ack(msg);
  //   } catch (e: any) {
  //     await mq.publish("remittances", "failed", { tenantId, investorId, error: String(e) });
  //     ch.nack(msg, false, false);
  //   }
  // });
}

// Manual trigger functions for testing
export async function triggerRemittanceGeneration(tenantId: string, investorId: string, asOf?: string) {
  try {
    console.log(`[RemittanceWorker] Generating remittance for investor ${investorId} in tenant ${tenantId}`);
    const result = await runRemittance(tenantId, investorId, asOf);
    console.log(`[RemittanceWorker] Remittance generated:`, result);
    return result;
  } catch (error) {
    console.error(`[RemittanceWorker] Remittance generation failed:`, error);
    throw error;
  }
}

export async function triggerStatementGeneration(tenantId: string, runId: string) {
  try {
    console.log(`[RemittanceWorker] Generating statement for run ${runId}`);
    const result = await generateRemittanceStatement(tenantId, runId);
    console.log(`[RemittanceWorker] Statement generated:`, result);
    return result;
  } catch (error) {
    console.error(`[RemittanceWorker] Statement generation failed:`, error);
    throw error;
  }
}

export async function triggerPayoutProcessing(tenantId: string, payoutId: string) {
  try {
    console.log(`[RemittanceWorker] Processing payout ${payoutId}`);
    const result = await processRemittancePayout(tenantId, payoutId);
    console.log(`[RemittanceWorker] Payout processed:`, result);
    return result;
  } catch (error) {
    console.error(`[RemittanceWorker] Payout processing failed:`, error);
    throw error;
  }
}