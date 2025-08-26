/**
 * ACH File Generation and Processing Service
 * Handles NACHA file creation and ACH return processing
 */

import { Pool, PoolClient } from 'pg';
import { CashRepo } from './repo';
import { 
  AchBatch, 
  AchEntry, 
  AchFileRequest,
  AchReturnNormalized,
  NachaFileHeader,
  NachaBatchHeader,
  NachaEntryDetail
} from './types';
import { MessagePublisher } from '../services/message-publisher';
import { randomUUID } from 'crypto';

export class AchService {
  private repo: CashRepo;
  private publisher: MessagePublisher;
  private companyId: string;
  private companyName: string;
  private odfiRouting: string;

  constructor(private pool: Pool) {
    this.repo = new CashRepo(pool);
    this.publisher = new MessagePublisher(pool);
    
    // These should come from configuration
    this.companyId = '1234567890';
    this.companyName = 'LOANSERVE PRO';
    this.odfiRouting = '123456789';
  }

  /**
   * Create a new ACH batch
   */
  async createBatch(
    bankAcctId: string,
    serviceClass: '200' | '220' | '225',
    effectiveDate: string,
    createdBy: string
  ): Promise<string> {
    return await this.repo.withTx(async (client) => {
      const batchId = await this.repo.createAchBatch(client, {
        bank_acct_id: bankAcctId,
        service_class: serviceClass,
        company_id: this.companyId,
        company_name: this.companyName,
        effective_entry_date: effectiveDate,
        created_by: createdBy,
        total_entries: 0,
        total_amount_minor: 0n,
        status: 'open'
      });

      console.log(`[ACH] Created batch ${batchId}`);
      return batchId;
    });
  }

  /**
   * Add entry to an open batch
   */
  async addEntry(
    batchId: string,
    txnCode: '22' | '27' | '32' | '37',
    routing: string,
    accountNumber: string,
    amount: number,
    loanId?: number,
    addenda?: string
  ): Promise<string> {
    return await this.repo.withTx(async (client) => {
      // Verify batch is open
      const batchResult = await client.query(`
        SELECT status FROM ach_batch WHERE ach_batch_id = $1
      `, [batchId]);

      if (batchResult.rows[0]?.status !== 'open') {
        throw new Error(`Batch ${batchId} is not open`);
      }

      // Mask account number for storage
      const accountMask = accountNumber.slice(-4).padStart(accountNumber.length, '*');
      const idempotencyKey = `${batchId}:${routing}:${accountMask}:${amount}:${Date.now()}`;

      const entryId = await this.repo.addAchEntry(client, {
        ach_batch_id: batchId,
        loan_id: loanId,
        txn_code: txnCode,
        rdfi_routing: routing,
        dda_account_mask: accountMask,
        amount_minor: BigInt(Math.round(amount * 100)),
        addenda,
        idempotency_key: idempotencyKey
      });

      console.log(`[ACH] Added entry ${entryId} to batch ${batchId}`);
      return entryId;
    });
  }

  /**
   * Seal batch and generate NACHA file
   */
  async generateNachaFile(request: AchFileRequest): Promise<Buffer> {
    return await this.repo.withTx(async (client) => {
      const { achBatchId } = request;

      // Seal the batch
      await this.repo.sealAchBatch(client, achBatchId);

      // Get batch and entries
      const batchResult = await client.query(`
        SELECT * FROM ach_batch WHERE ach_batch_id = $1
      `, [achBatchId]);

      if (batchResult.rows.length === 0) {
        throw new Error(`Batch ${achBatchId} not found`);
      }

      const batch = batchResult.rows[0];

      const entriesResult = await client.query(`
        SELECT * FROM ach_entry 
        WHERE ach_batch_id = $1
        ORDER BY created_at
      `, [achBatchId]);

      const entries = entriesResult.rows;

      // Generate NACHA file content
      const fileLines: string[] = [];
      
      // File Header
      const fileHeader = this.createFileHeader();
      fileLines.push(this.formatNachaRecord(fileHeader));

      // Batch Header
      const batchHeader = this.createBatchHeader(batch, 1);
      fileLines.push(this.formatNachaRecord(batchHeader));

      // Entry Details
      let entryCount = 0;
      let hashTotal = 0;
      let debitTotal = 0n;
      let creditTotal = 0n;

      for (const entry of entries) {
        const entryDetail = this.createEntryDetail(entry, ++entryCount);
        fileLines.push(this.formatNachaRecord(entryDetail));

        // Calculate hash (first 8 digits of routing)
        hashTotal += parseInt(entry.rdfi_routing.substring(0, 8));

        // Sum debits and credits
        const amount = BigInt(entry.amount_minor);
        if (entry.txn_code === '27' || entry.txn_code === '37') {
          debitTotal += amount;
        } else {
          creditTotal += amount;
        }
      }

      // Batch Control
      const batchControl = this.createBatchControl(
        batch.service_class,
        entryCount,
        hashTotal,
        debitTotal,
        creditTotal,
        batch.company_id,
        1
      );
      fileLines.push(batchControl);

      // File Control
      const fileControl = this.createFileControl(
        1, // batch count
        entryCount,
        hashTotal,
        debitTotal,
        creditTotal
      );
      fileLines.push(fileControl);

      // Pad to block size (10 records per block)
      const totalRecords = fileLines.length;
      const blocksNeeded = Math.ceil(totalRecords / 10);
      const recordsToAdd = (blocksNeeded * 10) - totalRecords;

      for (let i = 0; i < recordsToAdd; i++) {
        fileLines.push('9'.repeat(94)); // Padding records
      }

      // Update batch status
      await this.repo.updateBatchStatus(client, achBatchId, 'filed');

      // Publish event
      await this.publisher.publish({
        exchange: 'cash.events',
        routingKey: 'ach.file.created.v1',
        message: {
          ach_batch_id: achBatchId,
          entry_count: entryCount,
          total_amount_minor: (debitTotal + creditTotal).toString(),
          effective_date: batch.effective_entry_date
        },
        correlationId: `ach:file:${achBatchId}`
      });

      console.log(`[ACH] Generated NACHA file for batch ${achBatchId}`);
      return Buffer.from(fileLines.join('\n'));
    });
  }

  /**
   * Process ACH return
   */
  async processReturn(returnData: AchReturnNormalized): Promise<void> {
    await this.repo.withTx(async (client) => {
      // Find original entry by trace number
      const entry = await this.repo.findAchEntryByTrace(returnData.traceNumber);
      
      if (!entry) {
        console.error(`[ACH] Entry not found for trace ${returnData.traceNumber}`);
        return;
      }

      // Record the return
      const returnId = await this.repo.recordAchReturn(client, {
        ach_entry_id: entry.ach_entry_id,
        return_code: returnData.returnCode,
        return_date: returnData.returnDate,
        amount_minor: returnData.amountMinor,
        addenda: returnData.addenda,
        processed_at: new Date()
      });

      if (!returnId) {
        console.log(`[ACH] Return already recorded for entry ${entry.ach_entry_id}`);
        return;
      }

      // Publish events
      await this.publisher.publish({
        exchange: 'cash.events',
        routingKey: 'ach.return.received.v1',
        message: {
          ach_return_id: returnId,
          ach_entry_id: entry.ach_entry_id,
          loan_id: entry.loan_id,
          return_code: returnData.returnCode,
          amount_minor: returnData.amountMinor.toString()
        },
        correlationId: `ach:return:${entry.ach_entry_id}`
      });

      // Trigger payment reversal if loan payment
      if (entry.loan_id) {
        await this.publisher.publish({
          exchange: 'payments.topic',
          routingKey: 'payment.reversal.requested',
          message: {
            loan_id: entry.loan_id,
            reason: `ACH Return ${returnData.returnCode}`,
            amount_minor: returnData.amountMinor.toString(),
            ach_entry_id: entry.ach_entry_id
          },
          correlationId: `ach:return:reversal:${entry.ach_entry_id}`
        });
      }

      console.log(`[ACH] Processed return ${returnId} for entry ${entry.ach_entry_id}`);
    });
  }

  // NACHA format helpers
  private createFileHeader(): NachaFileHeader {
    const now = new Date();
    return {
      recordType: '1',
      priorityCode: '01',
      immediateDestination: ` ${this.odfiRouting}`,
      immediateOrigin: ` ${this.companyId}`,
      fileCreationDate: this.formatDate(now),
      fileCreationTime: this.formatTime(now),
      fileIdModifier: 'A',
      recordSize: '094',
      blockingFactor: '10',
      formatCode: '1',
      immediateDestinationName: 'BANK NAME'.padEnd(23),
      immediateOriginName: this.companyName.padEnd(23),
      referenceCode: ''.padEnd(8)
    };
  }

  private createBatchHeader(batch: any, batchNumber: number): NachaBatchHeader {
    return {
      recordType: '5',
      serviceClassCode: batch.service_class,
      companyName: batch.company_name.padEnd(16),
      companyDiscretionaryData: ''.padEnd(20),
      companyId: batch.company_id,
      standardEntryClass: 'PPD',
      companyEntryDescription: 'LOAN PMT'.padEnd(10),
      companyDescriptiveDate: ''.padEnd(6),
      effectiveEntryDate: this.formatDateCompact(new Date(batch.effective_entry_date)),
      settlementDate: '   ',
      originatorStatusCode: '1',
      originatingDfiId: this.odfiRouting.substring(0, 8),
      batchNumber: String(batchNumber).padStart(7, '0')
    };
  }

  private createEntryDetail(entry: any, sequence: number): NachaEntryDetail {
    const amount = Math.round(Number(entry.amount_minor) / 100);
    return {
      recordType: '6',
      transactionCode: entry.txn_code,
      receivingDfiId: entry.rdfi_routing.substring(0, 8),
      checkDigit: this.calculateCheckDigit(entry.rdfi_routing),
      dfiAccountNumber: entry.dda_account_mask.padEnd(17),
      amount: String(amount).padStart(10, '0'),
      individualIdNumber: (entry.loan_id || '').toString().padEnd(15),
      individualName: 'BORROWER'.padEnd(22),
      discretionaryData: '  ',
      addendaRecordIndicator: '0',
      traceNumber: entry.trace_number || ''
    };
  }

  private createBatchControl(
    serviceClass: string,
    entryCount: number,
    hashTotal: number,
    debitTotal: bigint,
    creditTotal: bigint,
    companyId: string,
    batchNumber: number
  ): string {
    const debitAmount = Math.round(Number(debitTotal) / 100);
    const creditAmount = Math.round(Number(creditTotal) / 100);
    
    return [
      '8',
      serviceClass,
      String(entryCount).padStart(6, '0'),
      String(hashTotal).padStart(10, '0').slice(-10),
      String(debitAmount).padStart(12, '0'),
      String(creditAmount).padStart(12, '0'),
      companyId,
      ''.padEnd(25),
      this.odfiRouting.substring(0, 8),
      String(batchNumber).padStart(7, '0')
    ].join('');
  }

  private createFileControl(
    batchCount: number,
    entryCount: number,
    hashTotal: number,
    debitTotal: bigint,
    creditTotal: bigint
  ): string {
    const debitAmount = Math.round(Number(debitTotal) / 100);
    const creditAmount = Math.round(Number(creditTotal) / 100);
    
    return [
      '9',
      String(batchCount).padStart(6, '0'),
      String(entryCount).padStart(8, '0'),
      String(entryCount).padStart(8, '0'),
      String(hashTotal).padStart(10, '0').slice(-10),
      String(debitAmount).padStart(12, '0'),
      String(creditAmount).padStart(12, '0'),
      ''.padEnd(39)
    ].join('');
  }

  private formatNachaRecord(record: any): string {
    if (typeof record === 'string') return record;
    return Object.values(record).join('');
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(2, 10).replace(/-/g, '');
  }

  private formatDateCompact(date: Date): string {
    return date.toISOString().slice(2, 10).replace(/-/g, '');
  }

  private formatTime(date: Date): string {
    return date.toISOString().slice(11, 16).replace(/:/g, '');
  }

  private calculateCheckDigit(routing: string): string {
    // Simplified check digit calculation
    return routing.charAt(8) || '0';
  }
}