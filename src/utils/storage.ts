/**
 * Object Storage Utilities for AI Pipeline
 * Implements tenant-based S3 storage layout with proper organization
 */

import { createHash } from 'crypto';
// import { ObjectStorageService } from '../database/ai-pipeline-service';

export interface FileMetadata {
  uri: string;
  sha256: string;
  filename: string;
  size: number;
  mime: string;
}

export interface DocumentChunk {
  docId: string;
  pageNumber: number;
  chunkData: Buffer;
  sha256: string;
}

export interface OCRResult {
  docId: string;
  pageNumber: number;
  textractBlocks: any[];
  confidence: number;
  timestamp: Date;
}

export interface EvidenceSnippet {
  docId: string;
  pageNumber: number;
  text: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  textHash: string;
}

/**
 * AI Pipeline Storage Manager
 * Manages document storage with proper tenant isolation and lineage tracking
 */
export class AIPipelineStorageManager {
  // private objectStorage: ObjectStorageService;
  private bucketName: string;
  private s3Prefix: string;

  constructor() {
    // this.objectStorage = new ObjectStorageService();
    this.bucketName = process.env.AI_PIPELINE_BUCKET || 'replit-objstore-484db537-8ad9-444a-8b99-05e67a37f2f2';
    this.s3Prefix = process.env.AI_PIPELINE_PREFIX || 'ai-servicing';
  }

  /**
   * Save uploaded file to storage
   * Structure: s3://$BUCKET/$PREFIX/{tenantId}/loans/{loanId}/uploads/{fileNameOrUuid}
   */
  async saveUpload(
    file: Express.Multer.File | Buffer,
    tenantId: string,
    loanId: string,
    originalFilename?: string
  ): Promise<FileMetadata> {
    // Handle both Express.Multer.File and Buffer inputs
    const fileBuffer = Buffer.isBuffer(file) ? file : file.buffer;
    const filename = originalFilename || (file as Express.Multer.File).originalname || 'uploaded-file';
    const size = fileBuffer.length;
    const mime = (file as Express.Multer.File).mimetype || 'application/octet-stream';

    // Compute SHA-256 hash
    const sha256 = createHash('sha256').update(fileBuffer).digest('hex');

    // Generate storage path
    const storageKey = `${this.s3Prefix}/${tenantId}/loans/${loanId}/uploads/${sha256}_${filename}`;
    const uri = `s3://${this.bucketName}/${storageKey}`;

    // Upload to object storage
    try {
      // Implementation would use ObjectStorageService to upload
      // For now, this is a placeholder that would integrate with actual object storage
      console.log(`[Storage] Uploading file to ${uri}`);
      
      // TODO: Actual upload implementation
      // await this.objectStorage.uploadFile(storageKey, fileBuffer, mime);

      return {
        uri,
        sha256,
        filename,
        size,
        mime
      };
    } catch (error) {
      throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Save document chunk from PDF splitting
   * Structure: s3://$BUCKET/$PREFIX/{tenantId}/loans/{loanId}/chunks/{docId}/page-{n}.pdf
   */
  async saveChunk(
    tenantId: string,
    loanId: string,
    docId: string,
    pageNumber: number,
    chunkData: Buffer
  ): Promise<DocumentChunk> {
    const sha256 = createHash('sha256').update(chunkData).digest('hex');
    const storageKey = `${this.s3Prefix}/${tenantId}/loans/${loanId}/chunks/${docId}/page-${pageNumber}.pdf`;
    const uri = `s3://${this.bucketName}/${storageKey}`;

    try {
      console.log(`[Storage] Saving chunk to ${uri}`);
      // TODO: Actual upload implementation
      // await this.objectStorage.uploadFile(storageKey, chunkData, 'application/pdf');

      return {
        docId,
        pageNumber,
        chunkData,
        sha256
      };
    } catch (error) {
      throw new Error(`Failed to save chunk: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Save OCR results from Textract
   * Structure: s3://$BUCKET/$PREFIX/{tenantId}/loans/{loanId}/ocr/{docId}/page-{n}.json
   */
  async saveOCRResult(
    tenantId: string,
    loanId: string,
    docId: string,
    pageNumber: number,
    textractBlocks: any[]
  ): Promise<OCRResult> {
    const ocrResult: OCRResult = {
      docId,
      pageNumber,
      textractBlocks,
      confidence: this.calculateOverallConfidence(textractBlocks),
      timestamp: new Date()
    };

    const storageKey = `${this.s3Prefix}/${tenantId}/loans/${loanId}/ocr/${docId}/page-${pageNumber}.json`;
    const uri = `s3://${this.bucketName}/${storageKey}`;

    try {
      console.log(`[Storage] Saving OCR result to ${uri}`);
      const jsonData = JSON.stringify(ocrResult, null, 2);
      // TODO: Actual upload implementation
      // await this.objectStorage.uploadFile(storageKey, Buffer.from(jsonData), 'application/json');

      return ocrResult;
    } catch (error) {
      throw new Error(`Failed to save OCR result: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Save reflowed text for evidence tracking
   * Structure: s3://$BUCKET/$PREFIX/{tenantId}/loans/{loanId}/text/{docId}.txt
   */
  async saveReflowedText(
    tenantId: string,
    loanId: string,
    docId: string,
    reflowedText: string
  ): Promise<string> {
    const storageKey = `${this.s3Prefix}/${tenantId}/loans/${loanId}/text/${docId}.txt`;
    const uri = `s3://${this.bucketName}/${storageKey}`;

    try {
      console.log(`[Storage] Saving reflowed text to ${uri}`);
      // TODO: Actual upload implementation
      // await this.objectStorage.uploadFile(storageKey, Buffer.from(reflowedText), 'text/plain');

      return uri;
    } catch (error) {
      throw new Error(`Failed to save reflowed text: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Save evidence snippet for lineage tracking
   * Structure: s3://$BUCKET/$PREFIX/{tenantId}/loans/{loanId}/evidence/{docId}/page-{n}.txt
   */
  async saveEvidenceSnippet(
    tenantId: string,
    loanId: string,
    evidence: EvidenceSnippet
  ): Promise<string> {
    const storageKey = `${this.s3Prefix}/${tenantId}/loans/${loanId}/evidence/${evidence.docId}/page-${evidence.pageNumber}.txt`;
    const uri = `s3://${this.bucketName}/${storageKey}`;

    try {
      console.log(`[Storage] Saving evidence snippet to ${uri}`);
      const evidenceData = {
        text: evidence.text,
        boundingBox: evidence.boundingBox,
        textHash: evidence.textHash,
        timestamp: new Date()
      };
      
      const jsonData = JSON.stringify(evidenceData, null, 2);
      // TODO: Actual upload implementation
      // await this.objectStorage.uploadFile(storageKey, Buffer.from(jsonData), 'application/json');

      return uri;
    } catch (error) {
      throw new Error(`Failed to save evidence snippet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get reflowed text for evidence retrieval
   */
  async getText(tenantId: string, loanId: string, docId: string): Promise<string> {
    const storageKey = `${this.s3Prefix}/${tenantId}/loans/${loanId}/text/${docId}.txt`;

    try {
      console.log(`[Storage] Retrieving text from ${storageKey}`);
      // TODO: Actual download implementation
      // const textBuffer = await this.objectStorage.downloadFile(storageKey);
      // return textBuffer.toString('utf-8');
      
      return ""; // Placeholder
    } catch (error) {
      throw new Error(`Failed to retrieve text: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get document chunk
   */
  async getChunk(
    tenantId: string,
    loanId: string,
    docId: string,
    pageNumber: number
  ): Promise<Buffer> {
    const storageKey = `${this.s3Prefix}/${tenantId}/loans/${loanId}/chunks/${docId}/page-${pageNumber}.pdf`;

    try {
      console.log(`[Storage] Retrieving chunk from ${storageKey}`);
      // TODO: Actual download implementation
      // return await this.objectStorage.downloadFile(storageKey);
      
      return Buffer.alloc(0); // Placeholder
    } catch (error) {
      throw new Error(`Failed to retrieve chunk: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get OCR result
   */
  async getOCRResult(
    tenantId: string,
    loanId: string,
    docId: string,
    pageNumber: number
  ): Promise<OCRResult | null> {
    const storageKey = `${this.s3Prefix}/${tenantId}/loans/${loanId}/ocr/${docId}/page-${pageNumber}.json`;

    try {
      console.log(`[Storage] Retrieving OCR result from ${storageKey}`);
      // TODO: Actual download implementation
      // const jsonBuffer = await this.objectStorage.downloadFile(storageKey);
      // return JSON.parse(jsonBuffer.toString('utf-8'));
      
      return null; // Placeholder
    } catch (error) {
      console.warn(`OCR result not found for ${storageKey}: ${error}`);
      return null;
    }
  }

  /**
   * Save export for investor delivery
   * Structure: s3://$BUCKET/$PREFIX/{tenantId}/loans/{loanId}/exports/{exportId}/...
   */
  async saveExport(
    tenantId: string,
    loanId: string,
    exportId: string,
    filename: string,
    data: Buffer,
    mime: string = 'application/octet-stream'
  ): Promise<string> {
    const storageKey = `${this.s3Prefix}/${tenantId}/loans/${loanId}/exports/${exportId}/${filename}`;
    const uri = `s3://${this.bucketName}/${storageKey}`;

    try {
      console.log(`[Storage] Saving export to ${uri}`);
      // TODO: Actual upload implementation
      // await this.objectStorage.uploadFile(storageKey, data, mime);

      return uri;
    } catch (error) {
      throw new Error(`Failed to save export: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Verify file integrity using SHA-256
   */
  async verifyFileIntegrity(
    tenantId: string,
    loanId: string,
    docId: string,
    expectedSha256: string
  ): Promise<boolean> {
    try {
      // Get the original upload
      const storageKey = `${this.s3Prefix}/${tenantId}/loans/${loanId}/uploads/${expectedSha256}_*`;
      // TODO: Implement file verification
      // const fileBuffer = await this.objectStorage.downloadFile(storageKey);
      // const actualSha256 = createHash('sha256').update(fileBuffer).digest('hex');
      // return actualSha256 === expectedSha256;
      
      return true; // Placeholder
    } catch (error) {
      console.error(`File integrity verification failed: ${error}`);
      return false;
    }
  }

  /**
   * Clean up temporary files for a loan
   */
  async cleanupLoanFiles(tenantId: string, loanId: string): Promise<void> {
    const prefixToClean = `${this.s3Prefix}/${tenantId}/loans/${loanId}/`;
    
    try {
      console.log(`[Storage] Cleaning up files for loan ${loanId}`);
      // TODO: Implement cleanup
      // await this.objectStorage.deletePrefix(prefixToClean);
    } catch (error) {
      console.error(`Failed to cleanup loan files: ${error}`);
      throw error;
    }
  }

  /**
   * Calculate overall confidence from Textract blocks
   */
  private calculateOverallConfidence(textractBlocks: any[]): number {
    if (!textractBlocks || textractBlocks.length === 0) {
      return 0;
    }

    const confidences = textractBlocks
      .filter(block => block.Confidence !== undefined)
      .map(block => block.Confidence);

    if (confidences.length === 0) {
      return 0;
    }

    return confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length / 100;
  }

  /**
   * Generate storage path for document
   */
  getDocumentPath(tenantId: string, loanId: string, docId: string, type: 'uploads' | 'chunks' | 'ocr' | 'text' | 'evidence' | 'exports'): string {
    return `${this.s3Prefix}/${tenantId}/loans/${loanId}/${type}/${docId}`;
  }
}

// Legacy compatibility functions
export async function saveUpload(file: Express.Multer.File): Promise<FileMetadata> {
  const storage = new AIPipelineStorageManager();
  // Extract tenant and loan IDs from request context or default values
  const tenantId = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';
  const loanId = 'legacy-upload'; // Would need proper context
  
  return await storage.saveUpload(file, tenantId, loanId);
}

export async function getText(docId: string): Promise<string> {
  const storage = new AIPipelineStorageManager();
  // Extract tenant and loan IDs from request context or default values
  const tenantId = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';
  const loanId = 'legacy-request'; // Would need proper context
  
  return await storage.getText(tenantId, loanId, docId);
}