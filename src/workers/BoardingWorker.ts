import { mq } from "../messaging/topology";
import { boardLoan } from "../servicing/boarding";

export async function startBoardingWorker() {
  console.log("[BoardingWorker] Starting boarding worker...");

  // Triggered automatically after finalize is completed AND succeeded
  await mq.consume("loan.finalize.completed.q", async (msg: any, ch: any) => {
    const { tenantId, loanId, error } = JSON.parse(msg.content.toString());
    console.log(`[BoardingWorker] Processing finalize completion for loan ${loanId}`);
    
    try {
      if (!error) {
        const out = await boardLoan(tenantId, loanId);
        console.log(`[BoardingWorker] Loan ${loanId} boarded successfully:`, out);
        await mq.publish("loan.board", "completed", { tenantId, loanId, ...out });
      } else {
        console.log(`[BoardingWorker] Skipping boarding for loan ${loanId} due to finalize error:`, error);
        await mq.publish("loan.board", "completed", { tenantId, loanId, skipped: true, reason: "finalize_error" });
      }
      ch.ack(msg);
    } catch (e: any) {
      console.error(`[BoardingWorker] Error boarding loan ${loanId}:`, e);
      await mq.publish("loan.board", "completed", { tenantId, loanId, error: String(e) });
      ch.nack(msg, false, false);
    }
  });

  // Manual board request (idempotent)
  await mq.consume("loan.board.request.q", async (msg: any, ch: any) => {
    const { tenantId, loanId } = JSON.parse(msg.content.toString());
    console.log(`[BoardingWorker] Processing manual boarding request for loan ${loanId}`);
    
    try {
      const out = await boardLoan(tenantId, loanId);
      console.log(`[BoardingWorker] Manual boarding for loan ${loanId} completed:`, out);
      await mq.publish("loan.board", "completed", { tenantId, loanId, ...out });
      ch.ack(msg);
    } catch (e: any) {
      console.error(`[BoardingWorker] Error in manual boarding for loan ${loanId}:`, e);
      await mq.publish("loan.board", "completed", { tenantId, loanId, error: String(e) });
      ch.nack(msg, false, false);
    }
  });

  console.log("[BoardingWorker] Boarding worker started successfully");
}