import { validateAndPostPayment } from "../payments/post";
import { createReceiptPdf } from "../payments/receipt";

// Payment processing worker
export async function startPaymentWorker() {
  console.log('[PaymentWorker] Worker started (placeholder implementation)');
  
  // In production, this would consume from payment processing queues:
  // - "payments.validate.q" - Payment validation queue
  // - "payments.post.q" - Payment posting queue
  // - "receipts.generate.q" - Receipt generation queue
  
  // Example of how the worker would function:
  // await mq.consume("payments.validate.q", async (msg: any, ch: any) => {
  //   const { tenantId, paymentId } = JSON.parse(msg.content.toString());
  //   try {
  //     const result = await validateAndPostPayment({ tenantId, paymentId });
  //     
  //     if (result.status === 'Posted') {
  //       // Trigger receipt generation
  //       await mq.publish("receipts", "generate", { tenantId, paymentId });
  //     }
  //     
  //     await mq.publish("payments", "processed", { tenantId, paymentId, ...result });
  //     ch.ack(msg);
  //   } catch (e: any) {
  //     await mq.publish("payments", "failed", { tenantId, paymentId, error: String(e) });
  //     ch.nack(msg, false, false);
  //   }
  // });
}

// Manual trigger functions for testing
export async function triggerPaymentProcessing(tenantId: string, paymentId: string) {
  try {
    console.log(`[PaymentWorker] Processing payment ${paymentId} for tenant ${tenantId}`);
    const result = await validateAndPostPayment({ tenantId, paymentId });
    console.log(`[PaymentWorker] Payment processed:`, result);
    return result;
  } catch (error) {
    console.error(`[PaymentWorker] Payment processing failed:`, error);
    throw error;
  }
}

export async function triggerReceiptGeneration(tenantId: string, paymentId: string, loanId: number, allocation: any) {
  try {
    console.log(`[PaymentWorker] Generating receipt for payment ${paymentId}`);
    const result = await createReceiptPdf({ tenantId, paymentId, loanId, allocation });
    console.log(`[PaymentWorker] Receipt generated:`, result);
    return result;
  } catch (error) {
    console.error(`[PaymentWorker] Receipt generation failed:`, error);
    throw error;
  }
}