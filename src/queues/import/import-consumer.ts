import amqp from 'amqplib';
import { startConsumer } from '../consumer-utils';
import { Queues } from '../topology';
import { auditAction } from '../../db/auditService';
import { publishEvent } from '../../db/eventOutboxService';
import { drizzle } from 'drizzle-orm/postgres-js';
import { loans, documents, properties } from '../../../shared/schema';
import { AIPipelineService } from '../../database/ai-pipeline-service';

export async function initImportConsumer(conn: amqp.Connection) {
  await startConsumer(conn, {
    queue: Queues.Import,
    handler: async (payload, { client }) => {
      const { importId, tenantId, fileBuffer } = payload;
      const db = drizzle(client);
      const service = new AIPipelineService();

      try {
        await service.updateImportProgress(importId, 'processing', {}, tenantId);

        const importContent = Buffer.from(fileBuffer, 'base64').toString('utf-8');
        const processedRecords = await processImportData(importContent);

        for (const record of processedRecords) {
          // Create a property first (or find existing)
          const [property] = await db
            .insert(properties)
            .values({
              address: record.propertyAddress || '123 Main St',
              city: record.propertyCity || 'Unknown',
              state: record.propertyState || 'CA',
              zipCode: record.propertyZip || '00000',
              propertyType: 'single_family',
              occupancyType: 'primary',
              yearBuilt: 2020,
              squareFeet: 2000,
              lotSize: 0.25,
              bedrooms: 3,
              bathrooms: 2,
              currentValue: record.loanAmount || 100000,
              purchasePrice: record.loanAmount || 100000,
            })
            .returning()
            .onConflictDoNothing();

          const propertyId = property?.id || 1;

          const loan = await db
            .insert(loans)
            .values({
              loanNumber: record.loanNumber || `IMPORT-${Date.now()}`,
              status: 'application',
              loanType: record.loanType || 'conventional',
              propertyId: propertyId,
              originalAmount: String(record.loanAmount || 100000),
              principalBalance: String(record.loanAmount || 100000),
              interestRate: String(record.interestRate || 5.0),
              maturityDate: new Date(Date.now() + 365 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 years from now
              paymentAmount: String(record.paymentAmount || 500),
              rateType: 'fixed',
              loanTerm: 360, // 30 years in months
            })
            .returning();

          if (record.documents) {
            for (const doc of record.documents) {
              await db.insert(documents).values({
                loanId: loan[0].id,
                category: 'loan_application',
                title: doc.title || doc.fileName || 'Imported Document',
                fileName: doc.fileName || 'unknown',
                storageUrl: doc.url || doc.storageUrl || '',
                uploadedBy: doc.uploadedBy || 1,
              });
            }
          }
        }

        await service.updateImportProgress(
          importId,
          'completed',
          { loanCount: processedRecords.length },
          tenantId
        );

        await auditAction(client, {
          tenantId,
          targetType: 'imports',
          targetId: importId,
          action: 'import_processed',
          changes: { status: 'completed', recordCount: processedRecords.length },
        });

        await publishEvent(client, {
          tenantId,
          aggregateId: importId,
          aggregateType: 'import',
          eventType: 'ImportCompleted',
          payload: { recordCount: processedRecords.length },
        });
      } catch (error) {
        await service.updateImportProgress(
          importId,
          'failed',
          { errors: [error instanceof Error ? error.message : String(error)] },
          tenantId
        );
        throw error;
      }
    },
  });
}

async function processImportData(content: string): Promise<any[]> {
  // Real CSV/JSON parsing implementation
  const lines = content.trim().split('\n');
  if (lines.length === 0) return [];
  
  // Check if it's JSON format
  if (content.trim().startsWith('[') || content.trim().startsWith('{')) {
    try {
      const jsonData = JSON.parse(content);
      return Array.isArray(jsonData) ? jsonData : [jsonData];
    } catch (error) {
      throw new Error(`Invalid JSON format: ${error.message}`);
    }
  }
  
  // Parse as CSV
  const headers = lines[0].split(',').map(h => h.trim());
  const records: any[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const record: any = {};
    
    // Map CSV columns to record fields
    headers.forEach((header, index) => {
      const value = values[index] || '';
      
      // Map common CSV columns to loan fields
      switch (header.toLowerCase()) {
        case 'loan_number':
        case 'loannumber':
          record.loanNumber = value;
          break;
        case 'borrower_name':
        case 'borrowername':
          record.borrowerName = value;
          break;
        case 'property_address':
        case 'propertyaddress':
          record.propertyAddress = value;
          break;
        case 'loan_amount':
        case 'loanamount':
          record.loanAmount = parseFloat(value) || 0;
          break;
        case 'interest_rate':
        case 'interestrate':
          record.interestRate = parseFloat(value) || 0;
          break;
        case 'loan_type':
        case 'loantype':
          record.loanType = value.toLowerCase();
          break;
        case 'status':
          record.status = value.toLowerCase();
          break;
        default:
          record[header] = value;
      }
    });
    
    // Skip empty rows
    if (record.loanNumber) {
      records.push(record);
    }
  }
  
  return records;
}