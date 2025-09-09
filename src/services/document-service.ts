/**
 * Document Microservice - Phase 3: Independent Document Processing Service
 * Handles all document-related operations independently using queue communication
 */

import express from 'express';
import multer from 'multer';
import type { Connection } from 'amqplib';
import { globalServiceRegistry, type ServiceDefinition } from './service-registry';
import { createEnvelope } from '../messaging/envelope-helpers';
import { Exchanges } from '../queues/topology';
import { DocumentProcessingSchema, type DocumentProcessingMessage } from '../queues/document/document-consumer';
import { z } from 'zod';
import { ulid } from 'ulid';
import path from 'path';
import fs from 'fs/promises';

// Document service API schemas
const UploadDocumentSchema = z.object({
  loan_id: z.number(),
  folder_id: z.string().optional(),
  processing_type: z.enum(['ocr', 'ai_analysis', 'classification', 'full']).default('full'),
  uploaded_by: z.number().optional(),
  
  // OCR options
  ocr_language: z.string().default('en'),
  extract_tables: z.boolean().default(false),
  
  // AI analysis options
  analyze_content: z.boolean().default(true),
  classify_document: z.boolean().default(true),
  extract_datapoints: z.boolean().default(true)
});

const ProcessDocumentSchema = z.object({
  document_id: z.string(),
  processing_type: z.enum(['ocr', 'ai_analysis', 'classification', 'full']),
  processing_options: z.object({
    ocr_language: z.string().default('en'),
    extract_tables: z.boolean().default(false),
    analyze_content: z.boolean().default(true),
    classify_document: z.boolean().default(true),
    extract_datapoints: z.boolean().default(true)
  }).optional()
});

// Configure multer for document uploads
const uploadStorage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const uploadDir = 'services/document-service/uploads';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
    } catch (error) {
      console.error('Error creating upload directory:', error);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const randomSuffix = Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    const sanitized = basename.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${timestamp}_${randomSuffix}_${sanitized}${ext}`);
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for documents
    files: 10 // Multiple files per upload
  },
  fileFilter: function (req, file, cb) {
    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/tiff',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  }
});

export class DocumentService {
  private app: express.Application;
  private connection: Connection | null = null;
  private publishChannel: any = null;
  private serviceInstance: any = null;

  constructor() {
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  /**
   * Initialize document service
   */
  async initialize(connection: Connection): Promise<void> {
    this.connection = connection;
    this.publishChannel = await connection.createChannel();
    
    console.log('[Document Service] Initializing independent document microservice...');
    
    // Register with service registry
    const definition: ServiceDefinition = {
      name: 'document-service',
      version: '1.0.0',
      port: 5002,
      healthEndpoint: '/health',
      capabilities: [
        'document.upload',
        'document.processing',
        'document.ocr',
        'document.ai_analysis',
        'document.classification',
        'document.storage'
      ],
      dependencies: ['storage', 'ai-service'],
      queueBindings: {
        consumes: ['tenant.*.document.process'],
        publishes: ['document.processed', 'document.failed', 'document.uploaded']
      }
    };

    this.serviceInstance = await globalServiceRegistry.registerService(definition);
    
    console.log('[Document Service] ✅ Document microservice initialized on port 5002');
  }

  /**
   * Setup REST API routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'document-service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        capabilities: [
          'document.upload',
          'document.processing',
          'document.ocr',
          'document.ai_analysis',
          'document.classification',
          'document.storage'
        ]
      });
    });

    // Upload documents endpoint
    this.app.post('/documents/upload', upload.array('documents', 10), async (req, res) => {
      try {
        const uploadData = UploadDocumentSchema.parse(req.body);
        const files = req.files as Express.Multer.File[];
        
        if (!files || files.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'No files uploaded'
          });
        }

        const uploadResults = [];
        
        for (const file of files) {
          const documentId = ulid();
          const correlationId = ulid();
          
          // Create document processing message
          const documentMessage: DocumentProcessingMessage = {
            document_id: documentId,
            loan_id: uploadData.loan_id,
            file_path: file.path,
            file_name: file.originalname,
            mime_type: file.mimetype,
            file_size: file.size,
            processing_type: uploadData.processing_type,
            uploaded_by: uploadData.uploaded_by,
            folder_id: uploadData.folder_id,
            ocr_language: uploadData.ocr_language,
            extract_tables: uploadData.extract_tables,
            analyze_content: uploadData.analyze_content,
            classify_document: uploadData.classify_document,
            extract_datapoints: uploadData.extract_datapoints
          };

          // Publish to document processing queue
          const envelope = createEnvelope({
            tenantId: 'default',
            correlationId,
            payload: documentMessage
          });

          await this.publishChannel.publish(
            Exchanges.Commands,
            'tenant.default.document.process',
            Buffer.from(JSON.stringify(envelope))
          );

          uploadResults.push({
            document_id: documentId,
            correlation_id: correlationId,
            filename: file.originalname,
            size: file.size,
            status: 'processing'
          });
        }

        res.status(202).json({
          success: true,
          message: `${files.length} documents uploaded and queued for processing`,
          documents: uploadResults
        });

      } catch (error) {
        console.error('[Document Service] Error uploading documents:', error);
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    });

    // Process existing document endpoint
    this.app.post('/documents/:documentId/process', async (req, res) => {
      try {
        const { documentId } = req.params;
        const processData = ProcessDocumentSchema.parse(req.body);
        
        const correlationId = ulid();
        
        // TODO: Get document details from database
        // For now, create a minimal processing message
        const documentMessage: Partial<DocumentProcessingMessage> = {
          document_id: documentId,
          processing_type: processData.processing_type,
          ...processData.processing_options
        };

        // Publish to document processing queue
        const envelope = createEnvelope({
          tenantId: 'default',
          correlationId,
          payload: documentMessage
        });

        await this.publishChannel.publish(
          Exchanges.Commands,
          'tenant.default.document.process',
          Buffer.from(JSON.stringify(envelope))
        );

        res.status(202).json({
          success: true,
          document_id: documentId,
          correlation_id: correlationId,
          processing_type: processData.processing_type,
          status: 'processing',
          message: 'Document queued for processing'
        });

      } catch (error) {
        console.error('[Document Service] Error processing document:', error);
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get document status endpoint
    this.app.get('/documents/:documentId/status', async (req, res) => {
      try {
        const { documentId } = req.params;
        
        // TODO: Query document status from database
        // For now, return a simulated status
        res.json({
          success: true,
          document_id: documentId,
          status: 'processed',
          processing_status: {
            ocr: 'completed',
            ai_analysis: 'completed',
            classification: 'completed'
          },
          results: {
            classification: 'loan_application',
            confidence: 0.95,
            extracted_data: {
              borrower_name: 'John Doe',
              loan_amount: 250000
            }
          },
          processed_at: new Date().toISOString()
        });

      } catch (error) {
        console.error('[Document Service] Error getting document status:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // List documents endpoint
    this.app.get('/documents', async (req, res) => {
      try {
        const { loan_id, status, classification } = req.query;
        
        // TODO: Query documents from database with filters
        // For now, return empty array
        res.json({
          success: true,
          documents: [],
          total: 0,
          filters: {
            loan_id,
            status,
            classification
          }
        });

      } catch (error) {
        console.error('[Document Service] Error listing documents:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }

  /**
   * Start the document service server
   */
  async start(): Promise<void> {
    const port = 5002;
    
    this.app.listen(port, '0.0.0.0', () => {
      console.log(`[Document Service] 🚀 Document microservice running on port ${port}`);
      
      // Update service status to healthy
      if (this.serviceInstance) {
        globalServiceRegistry.updateServiceHealth(this.serviceInstance.serviceId, 'healthy');
      }
    });
  }

  /**
   * Stop the document service
   */
  async stop(): Promise<void> {
    if (this.publishChannel) {
      await this.publishChannel.close();
    }
    
    if (this.serviceInstance) {
      await globalServiceRegistry.deregisterService(this.serviceInstance.serviceId);
    }
    
    console.log('[Document Service] Document microservice stopped');
  }
}

// Export service instance
export const documentService = new DocumentService();