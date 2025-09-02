import { queueDueDisbursements } from "../servicing/disbursements";

export async function startDisbursementBridgeWorker() {
  // For now, we'll use a simple approach since message queue integration needs more setup
  // In production, this would consume from "svc.cycle.completed.q"
  
  console.log('[DisbursementBridgeWorker] Worker started (placeholder implementation)');
  
  // Example of how the worker would function:
  // await mq.consume("svc.cycle.completed.q", async (msg: any, ch: any) => {
  //   const { tenantId, asOf, error } = JSON.parse(msg.content.toString());
  //   try {
  //     if (!error) {
  //       const due = await queueDueDisbursements(tenantId, asOf);
  //       for (const d of due) {
  //         await mq.publish("svc.disb", "request", {
  //           tenantId, disbursementId: d.id, loanId: d.loan_id, vendorId: d.vendor_id,
  //           billId: d.bill_id, method: d.method, amount: d.amount
  //         });
  //       }
  //     }
  //     ch.ack(msg);
  //   } catch (e: any) {
  //     ch.nack(msg, false, false);
  //   }
  // });
}

// Manual trigger function for testing
export async function processDueDisbursements(tenantId: string, asOf: string) {
  try {
    console.log(`[DisbursementBridgeWorker] Processing due disbursements for tenant ${tenantId}`);
    const dueDisbursements = await queueDueDisbursements(tenantId, asOf);
    console.log(`[DisbursementBridgeWorker] Found ${dueDisbursements.length} due disbursements`);
    
    // In production, these would be published to the disbursement queue
    // For now, just log them
    dueDisbursements.forEach(d => {
      console.log(`[DisbursementBridgeWorker] Due disbursement: ${d.id} - $${d.amount} via ${d.method}`);
    });
    
    return dueDisbursements;
  } catch (error) {
    console.error(`[DisbursementBridgeWorker] Failed to process disbursements:`, error);
    throw error;
  }
}