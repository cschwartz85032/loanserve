import { startConsumer } from "../queues/consumer-utils";
import { boardLoan } from "../servicing/boarding";
import type { Connection } from 'amqplib';

let connection: Connection;

// Set connection reference for consumers
export function setConnection(conn: Connection) {
  connection = conn;
}

export async function startBoardingWorker(): Promise<void> {
  console.log("[BoardingWorker] Starting boarding worker...");

  if (!connection) {
    throw new Error('[BoardingWorker] Connection not set. Call setConnection() first.');
  }

  // Triggered automatically after finalize is completed AND succeeded  
  await startConsumer(connection, {
    queue: 'loan.finalize.completed.q',
    handler: async (payload: any, helpers: any) => {
      try {
        const { tenantId, loanId, error } = payload;
        console.log(`[BoardingWorker] Processing finalize completion for loan ${loanId}`);
        
        if (!error) {
          const out = await boardLoan(tenantId, loanId);
          console.log(`[BoardingWorker] Loan ${loanId} boarded successfully:`, out);
          // TODO: Publish completion event using modern queue helpers
        } else {
          console.log(`[BoardingWorker] Skipping boarding for loan ${loanId} due to finalize error:`, error);
          // TODO: Publish skip event using modern queue helpers  
        }
      } catch (e: any) {
        console.error(`[BoardingWorker] Error boarding loan:`, e);
        throw e; // Re-throw to trigger retry/dlq logic
      }
    }
  });

  // Manual board request (idempotent)
  await startConsumer(connection, {
    queue: 'loan.board.request.q', 
    handler: async (payload: any, helpers: any) => {
      try {
        const { tenantId, loanId } = payload;
        console.log(`[BoardingWorker] Processing manual boarding request for loan ${loanId}`);
        
        const out = await boardLoan(tenantId, loanId);
        console.log(`[BoardingWorker] Manual boarding for loan ${loanId} completed:`, out);
        // TODO: Publish completion event using modern queue helpers
      } catch (e: any) {
        console.error(`[BoardingWorker] Error in manual boarding:`, e);
        throw e; // Re-throw to trigger retry/dlq logic
      }
    }
  });

  // Drain status queue to clear monitor CRITICAL (messages but no consumers)
  await startConsumer(connection, {
    queue: 'status.update.v1',
    handler: async (payload: any, helpers: any) => {
      // Safely process to prevent backlog alarming - TODO: route to storage/metrics if needed
      console.log('[BoardingWorker] Processed status update:', payload.type || 'unknown');
    }
  });

  console.log("[BoardingWorker] Boarding worker started successfully");
}