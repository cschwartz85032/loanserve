import amqp from 'amqplib';
import { startConsumer } from '../consumer-utils';
import { Queues } from '../topology';
import { auditAction } from '../../db/auditService';
import { publishEvent } from '../../db/eventOutboxService';
import { drizzle } from 'drizzle-orm/postgres-js';
import axios from 'axios';

export async function initDatapointConsumer(conn: amqp.Connection) {
  await startConsumer(conn, {
    queue: Queues.Datapoint,
    handler: async (payload, { client }) => {
      // Example payload: { messageId, tenantId, documentId, loanId, extractionRules }
      const { documentId, loanId, extractionRules, tenantId } = payload;
      const db = drizzle(client);

      // Get document text for extraction
      const [document] = await db.select()
        .from(loanDocuments)
        .where(eq(loanDocuments.id, documentId));

      if (!document || !document.ocrText) {
        throw new Error('Document OCR text not available');
      }

      // Extract datapoints using GPT/ML model
      const extractedDatapoints = await performDataExtraction(
        document.ocrText,
        extractionRules
      );

      // Insert datapoints with lineage fields
      for (const datapoint of extractedDatapoints) {
        await db.insert(loanDatapoints).values({
          loanId,
          key: datapoint.key,
          value: datapoint.value,
          normalizedValue: datapoint.normalizedValue,
          confidence: datapoint.confidence.toString(),
          ingestSource: 'document_extraction',
          autofilledFrom: 'ai_extraction',
          evidenceDocId: documentId,
          evidencePage: datapoint.page,
          evidenceTextHash: datapoint.textHash,
          extractorVersion: 'v2025.09.03',
          promptVersion: datapoint.promptVersion,
          authorityPriority: 10, // AI extraction priority
        });
      }

      // Check for conflicts with existing datapoints
      await publishEvent(client, {
        tenantId,
        aggregateId: loanId,
        aggregateType: 'loan',
        eventType: 'DatapointsExtracted',
        payload: { 
          documentId,
          extractedCount: extractedDatapoints.length,
          datapoints: extractedDatapoints.map(d => ({ key: d.key, confidence: d.confidence }))
        },
      });

      // Audit log
      await auditAction(client, {
        tenantId,
        targetType: 'loan_datapoints',
        targetId: loanId,
        action: 'datapoints_extracted',
        changes: { extractedCount: extractedDatapoints.length, sourceDocument: documentId },
      });
    },
  });
}

async function performDataExtraction(ocrText: string, rules: any[]): Promise<any[]> {
  // Placeholder - would call GPT/ML extraction service
  const response = await axios.post(process.env.AI_EXTRACTION_API_URL!, {
    text: ocrText,
    extractionRules: rules
  }, {
    headers: { Authorization: `Bearer ${process.env.AI_EXTRACTION_API_KEY}` },
    timeout: 30000,
  });

  return response.data.datapoints || [];
}