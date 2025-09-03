// AWS S3 Service for LoanServ Pro
// Provides comprehensive S3 operations with error handling and bucket management

import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CreateBucketCommand,
  HeadBucketCommand,
  DeleteObjectsCommand,
  type PutObjectCommandInput,
  type GetObjectCommandInput 
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { fromEnv, fromIni, fromInstanceMetadata } from '@aws-sdk/credential-providers';
import { Readable } from 'stream';
import { createHash } from 'crypto';

export interface S3Config {
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface S3UploadResult {
  key: string;
  bucket: string;
  location: string;
  etag: string;
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}

/**
 * S3Service - Complete AWS S3 integration
 * Handles file operations, bucket management, and error handling
 */
export class S3Service {
  private client: S3Client;
  private bucket: string;
  private region: string;

  /**
   * Hash S3 key for secure logging - prevents PII exposure
   */
  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex').substring(0, 16);
  }

  /**
   * Create safe log representation of S3 key
   */
  private safelog(key: string): string {
    // Hash the key but keep some structure for debugging
    const hash = this.hashKey(key);
    const extension = key.split('.').pop();
    return `key_${hash}${extension ? `.${extension}` : ''}`;
  }

  constructor(config?: Partial<S3Config>) {
    this.region = config?.region || process.env.AWS_REGION || 'us-east-1';
    this.bucket = config?.bucket || process.env.AWS_S3_BUCKET || process.env.AI_PIPELINE_BUCKET || '';

    if (!this.bucket) {
      throw new Error('S3 bucket not configured. Set AWS_S3_BUCKET or AI_PIPELINE_BUCKET environment variable.');
    }

    // Configure S3 client with credential chain
    this.client = new S3Client({
      region: this.region,
      credentials: this.createCredentialsProvider(config)
    });

    console.log(`[S3Service] Initialized for bucket: ${this.bucket}, region: ${this.region}`);
  }

  /**
   * Create AWS credentials provider with fallback chain
   */
  private createCredentialsProvider(config?: Partial<S3Config>) {
    if (config?.accessKeyId && config?.secretAccessKey) {
      // Use provided credentials
      return {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      };
    }

    // Use AWS credential provider chain
    try {
      // Try environment variables first
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        return fromEnv();
      }

      // Try AWS config files
      return fromIni();
    } catch (error) {
      // Fallback to instance metadata (for EC2/ECS)
      console.warn('[S3Service] Using instance metadata credentials');
      return fromInstanceMetadata();
    }
  }

  /**
   * Ensure bucket exists, create if necessary
   */
  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      console.log(`[S3Service] Bucket ${this.bucket} exists`);
    } catch (error: any) {
      if (error.name === 'NotFound') {
        console.log(`[S3Service] Creating bucket ${this.bucket}`);
        const createParams: any = { Bucket: this.bucket };
        if (this.region !== 'us-east-1') {
          createParams.CreateBucketConfiguration = {
            LocationConstraint: this.region as any
          };
        }
        await this.client.send(new CreateBucketCommand(createParams));
        console.log(`[S3Service] Bucket ${this.bucket} created successfully`);
      } else {
        throw new Error(`Failed to verify bucket: ${error.message}`);
      }
    }
  }

  /**
   * Upload file to S3
   */
  async uploadFile(
    key: string,
    data: Buffer | Readable | string,
    contentType?: string,
    metadata?: Record<string, string>
  ): Promise<S3UploadResult> {
    try {
      const uploadParams: PutObjectCommandInput = {
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType || 'application/octet-stream',
        Metadata: metadata
      };

      let result;
      
      if (Buffer.isBuffer(data) && data.length > 5 * 1024 * 1024) {
        // Use multipart upload for large files (>5MB)
        const upload = new Upload({
          client: this.client,
          params: uploadParams
        });

        result = await upload.done();
      } else {
        // Use simple upload for smaller files
        result = await this.client.send(new PutObjectCommand(uploadParams));
      }

      const location = `s3://${this.bucket}/${key}`;
      console.log(`[S3Service] Uploaded ${this.safelog(key)} to bucket ${this.bucket}`);

      return {
        key,
        bucket: this.bucket,
        location,
        etag: result.ETag || ''
      };
    } catch (error: any) {
      console.error(`[S3Service] Upload failed for ${this.safelog(key)}:`, error.message);
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  /**
   * Download file from S3
   */
  async downloadFile(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      });

      const response = await this.client.send(command);
      
      if (!response.Body) {
        throw new Error('No data received from S3');
      }

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      const stream = response.Body as Readable;
      
      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    } catch (error: any) {
      console.error(`[S3Service] Download failed for ${this.safelog(key)}:`, error.message);
      
      if (error.name === 'NoSuchKey') {
        throw new Error(`File not found in storage`);
      }
      
      throw new Error(`S3 download failed: ${error.message}`);
    }
  }

  /**
   * Download file as stream
   */
  async downloadStream(key: string): Promise<Readable> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      });

      const response = await this.client.send(command);
      
      if (!response.Body) {
        throw new Error('No data received from S3');
      }

      return response.Body as Readable;
    } catch (error: any) {
      console.error(`[S3Service] Stream download failed for ${this.safelog(key)}:`, error.message);
      throw new Error(`S3 stream download failed: ${error.message}`);
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key
      }));
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw new Error(`S3 head object failed: ${error.message}`);
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(key: string): Promise<S3Object> {
    try {
      const response = await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key
      }));

      return {
        key,
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        etag: response.ETag || ''
      };
    } catch (error: any) {
      if (error.name === 'NotFound') {
        throw new Error(`File not found: ${key}`);
      }
      throw new Error(`S3 metadata failed: ${error.message}`);
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key
      }));
      console.log(`[S3Service] Deleted ${this.safelog(key)}`);
    } catch (error: any) {
      console.error(`[S3Service] Delete failed for ${this.safelog(key)}:`, error.message);
      throw new Error(`S3 delete failed: ${error.message}`);
    }
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    try {
      const deleteParams = {
        Bucket: this.bucket,
        Delete: {
          Objects: keys.map(key => ({ Key: key }))
        }
      };

      await this.client.send(new DeleteObjectsCommand(deleteParams));
      console.log(`[S3Service] Deleted ${keys.length} files`);
    } catch (error: any) {
      console.error(`[S3Service] Batch delete failed:`, error);
      throw new Error(`S3 batch delete failed: ${error.message}`);
    }
  }

  /**
   * List files with prefix
   */
  async listFiles(prefix?: string, maxKeys?: number): Promise<S3Object[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys || 1000
      });

      const response = await this.client.send(command);
      
      return (response.Contents || []).map(obj => ({
        key: obj.Key || '',
        size: obj.Size || 0,
        lastModified: obj.LastModified || new Date(),
        etag: obj.ETag || ''
      }));
    } catch (error: any) {
      const safePrefix = prefix ? this.hashKey(prefix).substring(0, 8) : 'none';
      console.error(`[S3Service] List failed for prefix ${safePrefix}:`, error.message);
      throw new Error(`S3 list failed: ${error.message}`);
    }
  }

  /**
   * Delete all files with prefix (for cleanup)
   */
  async deletePrefix(prefix: string): Promise<void> {
    try {
      const objects = await this.listFiles(prefix);
      if (objects.length === 0) {
        const safePrefix = this.hashKey(prefix).substring(0, 8);
        console.log(`[S3Service] No files found with prefix: ${safePrefix}`);
        return;
      }

      const keys = objects.map(obj => obj.key);
      await this.deleteFiles(keys);
      const safePrefix = this.hashKey(prefix).substring(0, 8);
      console.log(`[S3Service] Deleted ${keys.length} files with prefix: ${safePrefix}`);
    } catch (error: any) {
      const safePrefix = this.hashKey(prefix).substring(0, 8);
      console.error(`[S3Service] Delete prefix failed for ${safePrefix}:`, error.message);
      throw new Error(`S3 delete prefix failed: ${error.message}`);
    }
  }

  /**
   * Get S3 URL for a key
   */
  getS3Url(key: string): string {
    return `s3://${this.bucket}/${key}`;
  }

  /**
   * Get HTTP URL for a key (if bucket allows public access)
   */
  getHttpUrl(key: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /**
   * Test S3 connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.ensureBucket();
      
      // Test upload/download with a small test file
      const testKey = 'test-connection.txt';
      const testData = Buffer.from('S3 connection test');
      
      await this.uploadFile(testKey, testData, 'text/plain');
      const downloaded = await this.downloadFile(testKey);
      await this.deleteFile(testKey);
      
      const success = downloaded.equals(testData);
      console.log(`[S3Service] Connection test: ${success ? 'PASSED' : 'FAILED'}`);
      return success;
    } catch (error: any) {
      console.error(`[S3Service] Connection test failed:`, error);
      return false;
    }
  }

  /**
   * Get service configuration
   */
  getConfig(): { bucket: string; region: string } {
    return {
      bucket: this.bucket,
      region: this.region
    };
  }
}