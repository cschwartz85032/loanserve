/**
 * Document Processing Consumer - Phase 2: Async Queue-Based Document Processing
 * Handles OCR, AI analysis, and document classification asynchronously
 */

import type { Connection, Channel, ConsumeMessage } from 'amqplib';
import { createEnvelope, validateMessage } from '../../messaging/envelope-helpers';
import { Exchanges, ROUTING_KEYS } from '../topology';
import { z } from 'zod';
import { db } from '../../../server/db';
import { documents } from '../../../shared/schema';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';

// Document processing message schema
export const DocumentProcessingSchema = z.object({
  document_id: z.string(),
  loan_id: z.number(),
  file_path: z.string(),
  file_name: z.string(),
  mime_type: z.string(),
  file_size: z.number(),
  processing_type: z.enum(['ocr', 'ai_analysis', 'classification', 'full']),
  uploaded_by: z.number().optional(),
  folder_id: z.string().optional(),
  
  // OCR specific options
  ocr_language: z.string().default('en'),
  extract_tables: z.boolean().default(false),
  
  // AI analysis options
  analyze_content: z.boolean().default(true),
  classify_document: z.boolean().default(true),
  extract_datapoints: z.boolean().default(true)
});

export type DocumentProcessingMessage = z.infer<typeof DocumentProcessingSchema>;

/**
 * Perform OCR processing on document using AWS Textract with Grok AI fallback
 */
export async function performOCR(message: DocumentProcessingMessage): Promise<{ text: string; confidence: number }> {
  console.log(`[Document OCR] Processing OCR for document: ${message.document_id}`);
  
  const { TextractClient, DetectDocumentTextCommand } = await import('@aws-sdk/client-textract');
  const { readFileSync } = await import('fs');
  
  try {
    // Read document file
    const documentBuffer = readFileSync(message.file_path);
    
    // Initialize Textract client
    const textractClient = new TextractClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
      }
    });
    
    // Call Textract
    const command = new DetectDocumentTextCommand({
      Document: {
        Bytes: documentBuffer
      }
    });
    
    const result = await textractClient.send(command);
    
    // Extract text from Textract response
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
    
    console.log(`[Document OCR] Textract OCR completed for ${message.document_id}`);
    
    return {
      text: extractedText.trim(),
      confidence: averageConfidence
    };
    
  } catch (error: any) {
    console.warn(`[Document OCR] Textract failed for ${message.document_id}:`, error.message);
    
    // Fallback to Grok AI for unsupported documents
    if (error.name === 'UnsupportedDocumentException' || error.message.includes('unsupported')) {
      console.log(`[Document OCR] Falling back to Grok AI for ${message.document_id}`);
      
      const { grokAIService } = await import('../../../server/services/grok-ai-service');
      const documentBuffer = readFileSync(message.file_path);
      
      const grokResult = await grokAIService.analyzeDocument(documentBuffer);
      
      // Extract text from Grok AI analysis
      const grokText = [
        grokResult.extractedData.payerName,
        grokResult.extractedData.amount?.toString(),
        grokResult.extractedData.referenceNumber,
        grokResult.extractedData.transactionDate,
        ...(grokResult.aiInsights || [])
      ].filter(Boolean).join('\n');
      
      return {
        text: grokText || 'Document processed by AI but text extraction failed',
        confidence: grokResult.confidence
      };
    }
    
    // Re-throw other errors
    throw new Error(`OCR processing failed: ${error.message}`);
  }
}

/**
 * Perform AI analysis and classification using Grok AI
 */
export async function performAIAnalysis(message: DocumentProcessingMessage, ocrText: string): Promise<{
  classification: string;
  confidence: number;
  extracted_data: any;
  summary: string;
}> {
  console.log(`[Document AI] Analyzing document: ${message.document_id}`);
  
  const { grokAIService } = await import('../../../server/services/grok-ai-service');
  const { readFileSync } = await import('fs');
  
  try {
    // Read document for AI analysis
    const documentBuffer = readFileSync(message.file_path);
    
    // Use Grok AI for document analysis
    const grokResult = await grokAIService.analyzeDocument(documentBuffer, message.file_name);
    
    // Convert Grok AI results to expected format
    const classification = grokResult.documentType === 'unknown' 
      ? 'unclassified_document' 
      : grokResult.documentType;
    
    const extractedData = {
      borrower_name: grokResult.extractedData.payerName || null,
      loan_amount: grokResult.extractedData.amount || null,
      loan_identifier: grokResult.extractedData.loanIdentifier || null,
      transaction_date: grokResult.extractedData.transactionDate || null,
      reference_number: grokResult.extractedData.referenceNumber || null,
      payment_method: grokResult.extractedData.paymentMethod || null,
      account_number: grokResult.extractedData.payerAccount || null,
      ...grokResult.extractedData.metadata
    };
    
    const summary = grokResult.aiInsights?.join('. ') || 
      `Document classified as ${classification} with ${grokResult.confidence * 100}% confidence. OCR text length: ${ocrText.length} characters.`;
    
    console.log(`[Document AI] Grok AI analysis completed for ${message.document_id}:`, {
      classification,
      confidence: grokResult.confidence,
      extractedFields: Object.keys(extractedData).length
    });
    
    return {
      classification,
      confidence: grokResult.confidence,
      extracted_data: extractedData,
      summary
    };
    
  } catch (error: any) {
    console.error(`[Document AI] Grok AI analysis failed for ${message.document_id}:`, error);
    
    // Fallback to basic analysis using OCR text
    const classification = message.file_name.toLowerCase().includes('bank') ? 'bank_statement' :
                          message.file_name.toLowerCase().includes('tax') ? 'tax_document' :
                          message.file_name.toLowerCase().includes('pay') ? 'payment_document' :
                          'unclassified_document';
    
    return {
      classification,
      confidence: 0.3, // Low confidence for fallback
      extracted_data: {
        ocr_text_length: ocrText.length,
        filename: message.file_name,
        processing_error: error.message
      },
      summary: `AI analysis failed, classified by filename as ${classification}. Error: ${error.message}`
    };
  }
}

/**
 * Process document message
 */
async function processDocumentMessage(message: DocumentProcessingMessage, publishEvent: Function): Promise<void> {
  console.log(`[Document Consumer] Processing document: ${message.document_id}`);
  
  try {
    // Update document status to processing
    await db.update(documents)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(documents.id, message.document_id));
    
    let ocrText = '';
    let ocrConfidence = 0;
    let classification = '';
    let aiConfidence = 0;
    let extractedData = {};
    let summary = '';
    
    // Perform OCR if requested
    if (['ocr', 'full'].includes(message.processing_type)) {
      const ocrResult = await performOCR(message);
      ocrText = ocrResult.text;
      ocrConfidence = ocrResult.confidence;
      
      // Store OCR results
      await db.update(documents)
        .set({ 
          ocrText: ocrText,
          ocrConfidence: ocrConfidence,
          updatedAt: new Date()
        })
        .where(eq(documents.id, message.document_id));
      
      console.log(`[Document Consumer] OCR completed for ${message.document_id}`);
    }
    
    // Perform AI analysis if requested
    if (['ai_analysis', 'classification', 'full'].includes(message.processing_type)) {
      const aiResult = await performAIAnalysis(message, ocrText);
      classification = aiResult.classification;
      aiConfidence = aiResult.confidence;
      extractedData = aiResult.extracted_data;
      summary = aiResult.summary;
      
      // Store AI analysis results
      await db.update(documents)
        .set({
          classification: classification,
          aiConfidence: aiConfidence,
          extractedData: JSON.stringify(extractedData),
          summary: summary,
          updatedAt: new Date()
        })
        .where(eq(documents.id, message.document_id));
      
      console.log(`[Document Consumer] AI analysis completed for ${message.document_id}`);
    }
    
    // Update document status to completed
    await db.update(documents)
      .set({ 
        status: 'processed',
        processedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(documents.id, message.document_id));
    
    console.log(`[Document Consumer] Document processed successfully: ${message.document_id}`);
    
    // Publish document processed event
    const processedEvent = createEnvelope({
      tenantId: 'default',
      correlationId: ulid(),
      payload: {
        eventType: 'document.processed',
        document_id: message.document_id,
        loan_id: message.loan_id,
        processing_type: message.processing_type,
        classification: classification,
        ai_confidence: aiConfidence,
        ocr_confidence: ocrConfidence,
        has_extracted_data: Object.keys(extractedData).length > 0,
        processed_at: new Date().toISOString()
      }
    });
    
    await publishEvent(Exchanges.Events, 'document.processed', processedEvent);
    
  } catch (error) {
    console.error(`[Document Consumer] Error processing document ${message.document_id}:`, error);
    
    // Update document status to failed
    await db.update(documents)
      .set({ 
        status: 'failed', 
        errorMessage: error.message,
        updatedAt: new Date()
      })
      .where(eq(documents.id, message.document_id));
    
    // Publish document failed event
    const failedEvent = createEnvelope({
      tenantId: 'default',
      correlationId: ulid(),
      payload: {
        eventType: 'document.failed',
        document_id: message.document_id,
        loan_id: message.loan_id,
        error: error.message,
        failed_at: new Date().toISOString()
      }
    });
    
    await publishEvent(Exchanges.Events, 'document.failed', failedEvent);
    
    throw error; // Re-throw to trigger retry mechanism
  }
}

/**
 * Initialize document processing consumer
 */
export async function initDocumentConsumer(connection: Connection, publishEvent: Function): Promise<void> {
  const channel = await connection.createChannel();
  
  // Set prefetch count for controlled processing
  await channel.prefetch(2); // Allow 2 concurrent document processing
  
  console.log('[Document Consumer] Initializing document processing consumer...');
  
  // Add document processing queue to topology if not exists
  const DOCUMENT_QUEUE = 'document.process.v1';
  await channel.assertQueue(DOCUMENT_QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': Exchanges.Dlq,
      'x-queue-type': 'quorum'
    }
  });
  
  // Bind to commands exchange
  await channel.bindQueue(DOCUMENT_QUEUE, Exchanges.Commands, 'tenant.*.document.process');
  
  // Consume document processing messages
  await channel.consume(DOCUMENT_QUEUE, async (msg: ConsumeMessage | null) => {
    if (!msg) return;
    
    try {
      const envelope = JSON.parse(msg.content.toString());
      const message = validateMessage(envelope, DocumentProcessingSchema);
      
      console.log(`[Document Consumer] Received document processing message:`, {
        correlationId: envelope.correlationId,
        documentId: message.document_id,
        loanId: message.loan_id,
        processingType: message.processing_type
      });
      
      await processDocumentMessage(message, publishEvent);
      
      channel.ack(msg);
      console.log(`[Document Consumer] Document processing completed: ${message.document_id}`);
      
    } catch (error) {
      console.error('[Document Consumer] Error processing message:', error);
      
      // Check retry count and either retry or send to DLQ
      const retryCount = (msg.properties.headers?.['x-retry-count'] || 0) as number;
      
      if (retryCount < 3) {
        // Reject and retry
        channel.nack(msg, false, false);
        console.log(`[Document Consumer] Message rejected for retry (attempt ${retryCount + 1})`);
      } else {
        // Send to DLQ after max retries
        channel.nack(msg, false, false);
        console.log(`[Document Consumer] Message sent to DLQ after ${retryCount + 1} attempts`);
      }
    }
  });
  
  console.log('[Document Consumer] ✅ Document processing consumer initialized');
}