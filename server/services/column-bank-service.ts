/**
 * Column Bank Service
 * Manages bank accounts, transfers, and payment processing through Column API
 */

import { db } from '../db';
import { paymentArtifacts, paymentIngestions, outboxMessages } from '@shared/schema';
import { columnClient } from './column-api-client';
import crypto from 'crypto';
import type {
  ColumnAccount,
  ColumnTransfer,
  CreateTransferRequest,
  WebhookEvent
} from './column-types';
import { randomUUID } from 'crypto';

interface TransferResult {
  transferId: string;
  status: string;
  amount: number;
  reference: string;
}

export class ColumnBankService {
  private masterAccountId?: string;
  private escrowAccountId?: string;
  private operatingAccountId?: string;

  constructor() {
    // Load account IDs from environment
    this.masterAccountId = process.env.COLUMN_MASTER_ACCOUNT_ID;
    this.escrowAccountId = process.env.COLUMN_ESCROW_ACCOUNT_ID;
    this.operatingAccountId = process.env.COLUMN_OPERATING_ACCOUNT_ID;
  }

  /**
   * Initialize Column accounts
   */
  async initializeAccounts(): Promise<void> {
    console.log('[ColumnBank] Initializing accounts');

    // Create or get master account
    if (!this.masterAccountId) {
      const masterAccount = await columnClient.createAccount({
        type: 'checking',
        holder_name: 'LoanServe Pro Master',
        holder_type: 'business',
        metadata: {
          account_type: 'master',
          created_at: new Date().toISOString()
        }
      });
      this.masterAccountId = masterAccount.id;
      console.log(`[ColumnBank] Created master account: ${this.masterAccountId}`);
    }

    // Create or get escrow account
    if (!this.escrowAccountId) {
      const escrowAccount = await columnClient.createAccount({
        type: 'checking',
        holder_name: 'LoanServe Pro Escrow',
        holder_type: 'business',
        metadata: {
          account_type: 'escrow',
          created_at: new Date().toISOString()
        }
      });
      this.escrowAccountId = escrowAccount.id;
      console.log(`[ColumnBank] Created escrow account: ${this.escrowAccountId}`);
    }

    // Create or get operating account
    if (!this.operatingAccountId) {
      const operatingAccount = await columnClient.createAccount({
        type: 'checking',
        holder_name: 'LoanServe Pro Operating',
        holder_type: 'business',
        metadata: {
          account_type: 'operating',
          created_at: new Date().toISOString()
        }
      });
      this.operatingAccountId = operatingAccount.id;
      console.log(`[ColumnBank] Created operating account: ${this.operatingAccountId}`);
    }

    console.log('[ColumnBank] Account initialization complete');
  }

  /**
   * Process webhook event from Column
   */
  async processWebhook(body: string, signature: string, timestamp: string): Promise<void> {
    console.log('[ColumnBank] Processing webhook event');

    // Parse the webhook event
    const event: WebhookEvent = JSON.parse(body);

    switch (event.type) {
      case 'transfer.created':
      case 'transfer.updated':
        await this.handleTransferEvent(event.data as ColumnTransfer);
        break;

      case 'account.updated':
        await this.handleAccountEvent(event.data as ColumnAccount);
        break;

      default:
        console.log(`[ColumnBank] Unhandled webhook event type: ${event.type}`);
    }
  }

  /**
   * Handle transfer webhook events
   */
  private async handleTransferEvent(transfer: ColumnTransfer): Promise<void> {
    console.log(`[ColumnBank] Handling transfer event: ${transfer.id} (${transfer.status})`);

    // Process incoming payments
    if (transfer.direction === 'credit' && transfer.status === 'completed') {
      await this.processIncomingPayment(transfer);
    }

    // Handle failed transfers
    if (transfer.status === 'failed' || transfer.status === 'cancelled') {
      console.warn(`[ColumnBank] Transfer failed: ${transfer.id}`, transfer);
      // TODO: Handle failed transfer notifications
    }
  }

  /**
   * Handle account webhook events
   */
  private async handleAccountEvent(account: ColumnAccount): Promise<void> {
    console.log(`[ColumnBank] Account updated: ${account.id}`);
    // TODO: Handle account balance updates, freezes, etc.
  }

  /**
   * Create a borrower account for a loan
   */
  async createBorrowerAccount(loanId: number, borrowerName: string): Promise<{
    accountId: string;
    accountNumber: string;
    routingNumber: string;
    balance: number;
  }> {
    console.log(`[ColumnBank] Creating borrower account for loan ${loanId}`);

    const account = await columnClient.createAccount({
      type: 'checking',
      holder_name: borrowerName,
      holder_type: 'individual',
      metadata: {
        loan_id: loanId,
        account_type: 'borrower',
        created_at: new Date().toISOString()
      }
    });

    // Create ingestion record for tracking
    const ingestionId = randomUUID();
    const accountData = JSON.stringify(account);
    await db.insert(paymentIngestions).values({
      id: ingestionId,
      idempotencyKey: `column-account-${account.id}`,
      channel: 'column',
      sourceReference: account.id,
      rawPayloadHash: crypto.createHash('sha256').update(accountData).digest('hex'),
      artifactUri: [`column://accounts/${account.id}`],
      artifactHash: [crypto.createHash('sha256').update(accountData).digest('hex')],
      receivedAt: new Date(),
      normalizedEnvelope: {
        type: 'account_creation',
        account_id: account.id,
        loan_id: loanId
      },
      status: 'normalized'
    });

    // Store account reference in payment artifacts
    await db.insert(paymentArtifacts).values({
      id: randomUUID(),
      ingestionId,
      type: 'column_account',
      uri: `column://accounts/${account.id}`,
      sha256: crypto.createHash('sha256').update(JSON.stringify(account)).digest('hex'),
      sizeBytes: Buffer.byteLength(JSON.stringify(account)),
      mime: 'application/json',
      sourceMetadata: {
        account_id: account.id,
        account_number: account.account_number,
        routing_number: account.routing_number,
        loan_id: loanId
      }
    });

    return {
      accountId: account.id,
      accountNumber: account.account_number,
      routingNumber: account.routing_number,
      balance: account.balance
    };
  }

  /**
   * Process incoming payment from Column webhook
   */
  async processIncomingPayment(transfer: ColumnTransfer): Promise<void> {
    console.log(`[ColumnBank] Processing incoming payment: ${transfer.id}`);

    // Extract loan ID from transfer metadata or reference
    const loanId = transfer.metadata?.loan_id || 
                   this.parseLoanIdFromReference(transfer.reference_id || '');

    if (!loanId) {
      console.warn(`[ColumnBank] No loan ID found for transfer ${transfer.id}`);
      return;
    }

    // Create payment ingestion record
    const ingestionId = randomUUID();
    const transferData = JSON.stringify(transfer);
    const idempotencyKey = `column-${transfer.id}`;
    
    // Create payment envelope for processing pipeline
    const envelope = {
      message_id: randomUUID(),
      correlation_id: randomUUID(),
      idempotency_key: idempotencyKey,
      timestamp: new Date().toISOString(),
      source: {
        channel: 'column',
        account: transfer.source_account_id || 'external'
      },
      payment: {
        value_date: transfer.created_at,
        reference: transfer.reference_id || transfer.id
      },
      borrower: {
        loan_id: String(loanId)
      },
      amount_cents: Math.round(transfer.amount * 100), // Convert to cents
      method: transfer.type,
      external: {
        column_transfer_id: transfer.id,
        column_status: transfer.status
      }
    };
    
    await db.insert(paymentIngestions).values({
      id: ingestionId,
      idempotencyKey,
      channel: transfer.type.toLowerCase() as 'ach' | 'wire' | 'book',
      sourceReference: transfer.id,
      rawPayloadHash: crypto.createHash('sha256').update(transferData).digest('hex'),
      artifactUri: [`column://transfers/${transfer.id}`],
      artifactHash: [crypto.createHash('sha256').update(transferData).digest('hex')],
      receivedAt: new Date(),
      normalizedEnvelope: envelope,
      status: 'normalized'
    });

    // Create payment artifact
    const artifactId = randomUUID();
    await db.insert(paymentArtifacts).values({
      id: artifactId,
      ingestionId,
      type: 'column_transfer',
      uri: `column://transfers/${transfer.id}`,
      sha256: crypto.createHash('sha256').update(JSON.stringify(transfer)).digest('hex'),
      sizeBytes: Buffer.byteLength(JSON.stringify(transfer)),
      mime: 'application/json',
      sourceMetadata: {
        transfer_id: transfer.id,
        transfer_status: transfer.status,
        transfer,
        processed_at: new Date().toISOString()
      }
    });

    // Publish to payment processing pipeline
    await db.insert(outboxMessages).values({
      id: randomUUID(),
      aggregateType: 'payments',
      aggregateId: randomUUID(),
      eventType: 'payment.received.column',
      payload: envelope,
      createdAt: new Date(),
      publishedAt: null,
      attemptCount: 0,
      lastError: null
    });

    console.log(`[ColumnBank] Payment ingested for loan ${loanId}: ${transfer.id}`);
  }

  /**
   * Create outgoing transfer (disbursement)
   */
  async createDisbursement(params: {
    loanId: number;
    amount: number; // in cents
    type: 'ach' | 'wire';
    recipientAccount: {
      accountNumber: string;
      routingNumber: string;
      accountHolderName: string;
      accountType?: 'checking' | 'savings';
    };
    description: string;
    reference?: string;
  }): Promise<TransferResult> {
    console.log(`[ColumnBank] Creating disbursement for loan ${params.loanId}`);

    // Use operating account as source for disbursements
    const sourceAccountId = this.operatingAccountId;
    if (!sourceAccountId) {
      throw new Error('Operating account not configured');
    }

    const transferRequest: CreateTransferRequest = {
      type: params.type,
      direction: 'debit',
      amount: params.amount,
      source_account_id: sourceAccountId,
      external_account: {
        account_number: params.recipientAccount.accountNumber,
        routing_number: params.recipientAccount.routingNumber,
        account_holder_name: params.recipientAccount.accountHolderName,
        account_type: params.recipientAccount.accountType || 'checking'
      },
      description: params.description,
      reference_id: params.reference || `DISB-${params.loanId}-${Date.now()}`,
      metadata: {
        loan_id: params.loanId,
        disbursement_type: 'loan_proceeds',
        created_at: new Date().toISOString()
      }
    };

    const transfer = await columnClient.createTransfer(transferRequest);

    // Create ingestion record for disbursement
    const disbursementIngestionId = randomUUID();
    const transferData = JSON.stringify(transfer);
    await db.insert(paymentIngestions).values({
      id: disbursementIngestionId,
      idempotencyKey: `column-disb-${transfer.id}`,
      channel: params.type,
      sourceReference: transfer.id,
      rawPayloadHash: crypto.createHash('sha256').update(transferData).digest('hex'),
      artifactUri: [`column://disbursements/${transfer.id}`],
      artifactHash: [crypto.createHash('sha256').update(transferData).digest('hex')],
      receivedAt: new Date(),
      normalizedEnvelope: {
        type: 'disbursement',
        transfer_id: transfer.id,
        loan_id: params.loanId
      },
      status: 'normalized'
    });

    // Record the disbursement
    await db.insert(paymentArtifacts).values({
      id: randomUUID(),
      ingestionId: disbursementIngestionId,
      type: 'column_disbursement',
      uri: `column://disbursements/${transfer.id}`,
      sha256: crypto.createHash('sha256').update(JSON.stringify(transfer)).digest('hex'),
      sizeBytes: Buffer.byteLength(JSON.stringify(transfer)),
      mime: 'application/json',
      sourceMetadata: {
        transfer_id: transfer.id,
        transfer,
        loan_id: params.loanId
      }
    });

    return {
      transferId: transfer.id,
      status: transfer.status,
      amount: transfer.amount,
      reference: transfer.reference_id || transfer.id
    };
  }

  /**
   * Create escrow disbursement
   */
  async createEscrowDisbursement(params: {
    loanId: number;
    amount: number; // in cents
    payee: string;
    description: string;
    accountInfo: {
      accountNumber: string;
      routingNumber: string;
      accountType?: 'checking' | 'savings';
    };
  }): Promise<TransferResult> {
    console.log(`[ColumnBank] Creating escrow disbursement for loan ${params.loanId}`);

    // Use escrow account as source
    const sourceAccountId = this.escrowAccountId;
    if (!sourceAccountId) {
      throw new Error('Escrow account not configured');
    }

    const transferRequest: CreateTransferRequest = {
      type: 'ach',
      direction: 'debit',
      amount: params.amount,
      source_account_id: sourceAccountId,
      external_account: {
        account_number: params.accountInfo.accountNumber,
        routing_number: params.accountInfo.routingNumber,
        account_holder_name: params.payee,
        account_type: params.accountInfo.accountType || 'checking'
      },
      description: params.description,
      reference_id: `ESCROW-${params.loanId}-${Date.now()}`,
      metadata: {
        loan_id: params.loanId,
        disbursement_type: 'escrow',
        payee: params.payee,
        created_at: new Date().toISOString()
      }
    };

    const transfer = await columnClient.createTransfer(transferRequest);

    // Create ingestion record for escrow disbursement
    const escrowIngestionId = randomUUID();
    const transferData = JSON.stringify(transfer);
    await db.insert(paymentIngestions).values({
      id: escrowIngestionId,
      idempotencyKey: `column-escrow-${transfer.id}`,
      channel: 'ach',
      sourceReference: transfer.id,
      rawPayloadHash: crypto.createHash('sha256').update(transferData).digest('hex'),
      artifactUri: [`column://escrow-disbursements/${transfer.id}`],
      artifactHash: [crypto.createHash('sha256').update(transferData).digest('hex')],
      receivedAt: new Date(),
      normalizedEnvelope: {
        type: 'escrow_disbursement',
        transfer_id: transfer.id,
        loan_id: params.loanId,
        payee: params.payee
      },
      status: 'normalized'
    });

    // Record the disbursement
    await db.insert(paymentArtifacts).values({
      id: randomUUID(),
      ingestionId: escrowIngestionId,
      type: 'column_escrow_disbursement',
      uri: `column://escrow-disbursements/${transfer.id}`,
      sha256: crypto.createHash('sha256').update(JSON.stringify(transfer)).digest('hex'),
      sizeBytes: Buffer.byteLength(JSON.stringify(transfer)),
      mime: 'application/json',
      sourceMetadata: {
        transfer_id: transfer.id,
        transfer,
        loan_id: params.loanId,
        payee: params.payee
      }
    });

    return {
      transferId: transfer.id,
      status: transfer.status,
      amount: transfer.amount,
      reference: transfer.reference_id || transfer.id
    };
  }

  /**
   * Get account balances
   */
  async getAccountBalances(): Promise<{
    master?: { available: number; pending: number; ledger: number };
    escrow?: { available: number; pending: number; ledger: number };
    operating?: { available: number; pending: number; ledger: number };
  }> {
    const balances: any = {};

    if (this.masterAccountId) {
      const account = await columnClient.getAccount(this.masterAccountId);
      balances.master = {
        available: account.available_balance,
        pending: account.pending_balance,
        ledger: account.balance
      };
    }

    if (this.escrowAccountId) {
      const account = await columnClient.getAccount(this.escrowAccountId);
      balances.escrow = {
        available: account.available_balance,
        pending: account.pending_balance,
        ledger: account.balance
      };
    }

    if (this.operatingAccountId) {
      const account = await columnClient.getAccount(this.operatingAccountId);
      balances.operating = {
        available: account.available_balance,
        pending: account.pending_balance,
        ledger: account.balance
      };
    }

    return balances;
  }

  /**
   * Reconcile transactions for a given period
   */
  async reconcileTransactions(
    accountId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    transactionCount: number;
    totalDebits: number;
    totalCredits: number;
    netChange: number;
    reconciled: boolean;
  }> {
    console.log(`[ColumnBank] Reconciling transactions for account ${accountId}`);

    const transactions = await columnClient.listTransactions({
      account_id: accountId,
      created_after: startDate,
      created_before: endDate
    });

    let totalDebits = 0;
    let totalCredits = 0;

    for (const tx of transactions) {
      if (tx.direction === 'debit') {
        totalDebits += tx.amount;
      } else {
        totalCredits += tx.amount;
      }
    }

    const netChange = totalCredits - totalDebits;

    // Get account balance at start and end
    const account = await columnClient.getAccount(accountId);
    const currentBalance = account.balance;

    // TODO: Compare with expected balance based on transactions
    const reconciled = true; // Simplified for now

    return {
      transactionCount: transactions.length,
      totalDebits,
      totalCredits,
      netChange,
      reconciled
    };
  }

  /**
   * Parse loan ID from reference string
   */
  private parseLoanIdFromReference(reference: string): number | null {
    // Try to extract loan ID from reference patterns like "LOAN-42", "loan#42", etc.
    const patterns = [
      /LOAN-(\d+)/i,
      /loan#(\d+)/i,
      /loan\s+(\d+)/i,
      /^(\d+)$/
    ];

    for (const pattern of patterns) {
      const match = reference.match(pattern);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
    }

    return null;
  }

  /**
   * Health check for Column integration
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    accounts: boolean;
    api: boolean;
  }> {
    try {
      // Check if we can list accounts
      const accounts = await columnClient.listAccounts();
      
      return {
        status: 'healthy',
        accounts: accounts.length > 0,
        api: true
      };
    } catch (error) {
      console.error('[ColumnBank] Health check failed:', error);
      
      // Check if API is accessible at all
      let apiAccessible = false;
      try {
        await columnClient.validateAccount({
          account_number: '000000000',
          routing_number: '000000000'
        });
        apiAccessible = true;
      } catch {
        // Expected to fail, but shows API is reachable if we get a proper error
        apiAccessible = false;
      }
      
      return {
        status: apiAccessible ? 'degraded' : 'unhealthy',
        accounts: false,
        api: apiAccessible
      };
    }
  }
}

// Export singleton instance
export const columnBankService = new ColumnBankService();