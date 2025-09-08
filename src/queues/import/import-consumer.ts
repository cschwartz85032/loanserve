import amqp from 'amqplib';
import { startConsumer } from '../consumer-utils';
import { Queues } from '../topology';
import { auditAction } from '../../db/auditService';
import { publishEvent } from '../../db/eventOutboxService';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { loans, documents } from '../../../shared/schema';

export async function initImportConsumer(conn: amqp.Connection) {
  await startConsumer(conn, {
    queue: Queues.Import,
    handler: async (payload, { client }) => {
      // Example payload: { messageId, tenantId, importId, fileData }
      const { importId, fileData, tenantId } = payload;
      const db = drizzle(client);

      // Parse CSV/JSON import file from S3
      // This would integrate with S3 to fetch the file content
      const importContent = await fetchImportFile(fileData.s3Key);
      
      // Process each row/record in the import
      const processedRecords = await processImportData(importContent);
      
      // Create loan candidates and documents from import
      for (const record of processedRecords) {
        // Create loan
        const loan = await db.insert(loans).values({
          loanUrn: record.loanNumber,
          status: 'application',
          loanType: 'conventional',
          // Add other required fields based on schema
        }).returning();

        // Create associated documents if any
        if (record.documents) {
          for (const doc of record.documents) {
            await db.insert(documents).values({
              loanId: loan[0].id,
              storageUri: doc.s3Uri,
              sha256: doc.hash,
              category: 'loan_application',
              // Add other required fields
            });
          }
        }
      }

      // Import status would be tracked in a separate imports table
      // For now, just log completion

      // Audit log
      await auditAction(client, {
        tenantId,
        targetType: 'imports',
        targetId: importId,
        action: 'import_processed',
        changes: { status: 'completed', recordCount: processedRecords.length },
      });

      // Publish domain event
      await publishEvent(client, {
        tenantId,
        aggregateId: importId,
        aggregateType: 'import',
        eventType: 'ImportCompleted',
        payload: { recordCount: processedRecords.length },
      });
    },
  });
}

async function fetchImportFile(s3Key: string): Promise<string> {
  const AWS = require('aws-sdk');
  const s3 = new AWS.S3();
  
  const params = {
    Bucket: process.env.ARTIFACT_STORE_BUCKET?.replace('s3://', ''),
    Key: s3Key
  };
  
  const result = await s3.getObject(params).promise();
  return result.Body.toString();
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