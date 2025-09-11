import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { AIPipelineService } from '../database/ai-pipeline-service';
import { rabbitmqClient } from '../../server/services/rabbitmq-unified';
import { Queues } from '../queues/topology';
import { convert } from 'xmlbuilder2';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';

export const importsRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  } : undefined
});

const S3_BUCKET = process.env.S3_IMPORT_BUCKET || 'loanserve-imports';

// Create import job with S3 upload
importsRouter.post('/imports', upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File required' });
    }

    const tenantId = req.user?.tenantId || '00000000-0000-0000-0000-000000000001';
    const importType = req.body.importType || 'csv';
    const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const service = new AIPipelineService();

    // Generate S3 key with tenant isolation
    const timestamp = Date.now();
    const s3Key = `imports/${tenantId}/${timestamp}-${hash.substring(0, 8)}-${req.file.originalname}`;

    // Upload to S3
    const uploadParams = {
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype || 'application/octet-stream',
      Metadata: {
        tenantId,
        importType,
        sha256: hash,
        originalName: req.file.originalname
      },
      ServerSideEncryption: 'AES256' as const
    };

    const uploadResult = await s3Client.send(new PutObjectCommand(uploadParams));

    // Create import record with S3 location
    const record = await service.createImport({
      tenantId,
      type: importType,
      filename: req.file.originalname,
      sizeBytes: req.file.size,
      sha256: hash,
      s3Bucket: S3_BUCKET,
      s3Key: s3Key,
      s3VersionId: uploadResult.VersionId,
      s3ETag: uploadResult.ETag,
      contentType: req.file.mimetype,
      createdBy: req.user?.id || tenantId
    });

    // Parse first 100KB for preview (without loading entire file)
    let preview: any[] = [];
    try {
      const previewSize = Math.min(req.file.buffer.length, 100 * 1024);
      const previewContent = req.file.buffer.subarray(0, previewSize).toString('utf-8');
      preview = await parseImportContent(previewContent, importType);
    } catch (err) {
      console.error('Preview parse error:', err);
    }

    await service.updateImportProgress(record.id, 'pending', { preview: preview.slice(0, 5) }, tenantId);

    // Publish to processing queue with S3 reference only
    const message = {
      importId: record.id,
      tenantId,
      s3Bucket: S3_BUCKET,
      s3Key: s3Key,
      s3VersionId: uploadResult.VersionId,
      fileType: importType,
      sha256: hash,
      sizeBytes: req.file.size,
      contentType: req.file.mimetype
    };
    
    await rabbitmqClient.publish(
      '',
      Queues.Import,
      Buffer.from(JSON.stringify(message)),
      { contentType: 'application/json' }
    );

    res.status(202).json({ 
      importId: record.id, 
      status: record.status,
      s3Location: `s3://${S3_BUCKET}/${s3Key}`
    });
  } catch (error) {
    console.error('Create import error:', error);
    res.status(500).json({
      error: 'Failed to create import job',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

async function parseImportContent(content: string, type: string): Promise<any[]> {
  if (type === 'json' || content.trim().startsWith('{') || content.trim().startsWith('[')) {
    try {
      const data = JSON.parse(content);
      return Array.isArray(data) ? data : [data];
    } catch {
      return [];
    }
  }

  if (type === 'xml' || content.trim().startsWith('<')) {
    try {
      const obj = convert(content, { format: 'object' });
      if (Array.isArray(obj)) return obj as any[];
      return [obj];
    } catch {
      return [];
    }
  }

  const lines = content.trim().split('\n');
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const records: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const record: any = {};
    headers.forEach((header, index) => {
      record[header] = values[index];
    });
    if (Object.keys(record).length > 0) records.push(record);
  }
  return records;
}

// Fetch import status
importsRouter.get('/imports/:id', async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId || '00000000-0000-0000-0000-000000000001';
    const service = new AIPipelineService();
    const record = await service.getImport(req.params.id, tenantId);

    if (!record) {
      return res.status(404).json({ error: 'Import not found' });
    }

    res.json({
      importId: record.id,
      status: record.status,
      preview: (record as any).progress?.preview,
      errors: (record as any).progress?.errors || []
    });
  } catch (error) {
    console.error('Get import error:', error);
    res.status(500).json({
      error: 'Failed to fetch import',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});