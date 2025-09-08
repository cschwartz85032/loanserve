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
          notes: ocrResult.text,
          metadata: {
            ocrConfidence: ocrResult.confidence,
            ocrProcessedAt: new Date().toISOString(),
            textLength: ocrResult.text.length
          }
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
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  
  const bucketAndKey = s3Uri.replace('s3://', '').split('/');
  const bucket = bucketAndKey[0];
  const key = bucketAndKey.slice(1).join('/');
  
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
    }
  });
  
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });
  
  const result = await s3Client.send(command);
  
  // Convert stream to buffer
  const chunks: Buffer[] = [];
  const readable = result.Body as any;
  
  return new Promise((resolve, reject) => {
    readable.on('data', (chunk: Buffer) => chunks.push(chunk));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

async function performOcr(content: Buffer): Promise<{ text: string; confidence: number }> {
  // Real AWS Textract integration using AWS SDK v3
  const { TextractClient, DetectDocumentTextCommand } = await import('@aws-sdk/client-textract');
  
  const textractClient = new TextractClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
    }
  });
  
  try {
    const command = new DetectDocumentTextCommand({
      Document: {
        Bytes: content
      }
    });
    
    const result = await textractClient.send(command);
    
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
  } catch (error: any) {
    console.error('Textract OCR failed:', error);
    throw new Error(`OCR processing failed: ${error.message}`);
  }
}