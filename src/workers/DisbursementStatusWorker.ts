import { updateDisbursementStatus } from "../servicing/disbursements";

export async function startDisbursementStatusWorker() {
  // For now, we'll use a simple approach since message queue integration needs more setup
  // In production, this would consume from "svc.disb.completed.q"
  
  console.log('[DisbursementStatusWorker] Worker started (placeholder implementation)');
  
  // Example of how the worker would function:
  // await mq.consume("svc.disb.completed.q", async (msg: any, ch: any) => {
  //   const { tenantId, disbursementId, status, reference } = JSON.parse(msg.content.toString());
  //   try {
  //     await updateDisbursementStatus(disbursementId, status, reference);
  //     ch.ack(msg);
  //   } catch (e: any) {
  //     ch.nack(msg, false, false);
  //   }
  // });
}

// Manual status update function for testing
export async function updateDisbursementManually(
  disbursementId: string, 
  status: 'Sent' | 'Settled' | 'Failed' | 'Cancelled',
  reference?: string
) {
  try {
    console.log(`[DisbursementStatusWorker] Updating disbursement ${disbursementId} to ${status}`);
    await updateDisbursementStatus(disbursementId, status, reference);
    console.log(`[DisbursementStatusWorker] Status update completed`);
    return { success: true, disbursementId, status, reference };
  } catch (error) {
    console.error(`[DisbursementStatusWorker] Failed to update disbursement status:`, error);
    throw error;
  }
}