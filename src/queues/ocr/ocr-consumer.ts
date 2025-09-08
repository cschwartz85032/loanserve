import amqp from 'amqplib';
import { startConsumer } from '../consumer-utils';
import { Queues } from '../topology';
import { auditAction } from '../../db/auditService';
import { publishEvent } from '../../db/eventOutboxService';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import axios from 'axios';
import { documents } from '../../../shared/schema';

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
      
      // Update document with OCR text
      await db.update(documents)
        .set({ 
          extractedText: ocrResult.text,
          ocrConfidence: ocrResult.confidence.toString(),
          ocrProcessedAt: new Date()
        })
        .where(eq(documents.id, documentId));

      // Audit log
      await auditAction(client, {
        tenantId,
        targetType: 'documents',
        targetId: documentId,
        action: 'ocr_completed',
        changes: { textLength: ocrResult.text.length, confidence: ocrResult.confidence },
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
  // Real AWS Textract integration
  const AWS = require('aws-sdk');
  const textract = new AWS.Textract({ region: process.env.AWS_REGION || 'us-east-1' });
  
  try {
    const params = {
      Document: {
        Bytes: content
      },
      FeatureTypes: ['TABLES', 'FORMS']
    };
    
    const result = await textract.detectDocumentText(params).promise();
    
    let extractedText = '';
    let totalConfidence = 0;
    let blockCount = 0;
    
    for (const block of result.Blocks || []) {
      if (block.BlockType === 'LINE') {
        extractedText += block.Text + '\n';
        totalConfidence += block.Confidence || 0;
        blockCount++;
      }
    }
    
    const averageConfidence = blockCount > 0 ? totalConfidence / blockCount / 100 : 0;
    
    return {
      text: extractedText.trim(),
      confidence: averageConfidence
    };
  } catch (error) {
    console.error('Textract OCR failed:', error);
    // Fallback to basic text extraction or throw error
    throw new Error(`OCR processing failed: ${error.message}`);
  }
}