import amqp from 'amqplib';
import { startConsumer } from '../consumer-utils';
import { Queues } from '../topology';
import { auditAction } from '../../db/auditService';
import { publishEvent } from '../../db/eventOutboxService';
import { drizzle } from 'drizzle-orm/postgres-js';
import axios from 'axios';

export async function initOcrConsumer(conn: amqp.Connection) {
  await startConsumer(conn, {
    queue: Queues.Ocr,
    handler: async (payload, { client }) => {
      // Example payload: { messageId, tenantId, documentId, s3Uri }
      const { documentId, s3Uri, tenantId } = payload;
      const db = drizzle(client);

      // Fetch document from S3
      const documentContent = await fetchDocumentFromS3(s3Uri);
      
      // Run OCR engine (external service)
      const ocrResult = await performOcr(documentContent);
      
      // Store OCR text result
      await db.insert(docText).values({
        documentId,
        extractedText: ocrResult.text,
        confidence: ocrResult.confidence,
        ocrEngine: 'tesseract',
        extractedAt: new Date()
      });

      // Update document OCR status
      await db.update(loanDocuments)
        .set({ 
          ocrStatus: 'completed',
          ocrText: ocrResult.text
        })
        .where(eq(loanDocuments.id, documentId));

      // Audit log
      await auditAction(client, {
        tenantId,
        targetType: 'loan_documents',
        targetId: documentId,
        action: 'ocr_completed',
        changes: { ocrStatus: 'completed', textLength: ocrResult.text.length },
      });

      // Publish domain event
      await publishEvent(client, {
        tenantId,
        aggregateId: documentId,
        aggregateType: 'document',
        eventType: 'OcrCompleted',
        payload: { textLength: ocrResult.text.length, confidence: ocrResult.confidence },
      });
    },
  });
}

async function fetchDocumentFromS3(s3Uri: string): Promise<Buffer> {
  const AWS = require('aws-sdk');
  const s3 = new AWS.S3();
  
  const bucketAndKey = s3Uri.replace('s3://', '').split('/');
  const bucket = bucketAndKey[0];
  const key = bucketAndKey.slice(1).join('/');
  
  const params = { Bucket: bucket, Key: key };
  const result = await s3.getObject(params).promise();
  return Buffer.from(result.Body);
}

async function performOcr(content: Buffer): Promise<{ text: string; confidence: number }> {
  // Placeholder - would call OCR service like Tesseract or AWS Textract
  return {
    text: "Extracted text from document",
    confidence: 0.95
  };
}