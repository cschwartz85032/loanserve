import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { AIPipelineService } from '../database/ai-pipeline-service';
import { rabbitmqClient } from '../../server/services/rabbitmq-unified';
import { Queues } from '../queues/topology';
import { convert } from 'xmlbuilder2';

export const importsRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Create import job
importsRouter.post('/imports', upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File required' });
    }

    const tenantId = req.user?.tenantId || '00000000-0000-0000-0000-000000000001';
    const importType = req.body.importType || 'csv';
    const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const service = new AIPipelineService();

    const record = await service.createImport({
      tenantId,
      type: importType,
      filename: req.file.originalname,
      sizeBytes: req.file.size,
      sha256: hash,
      createdBy: req.user?.id || tenantId
    });

    // Parse file content for preview
    let preview: any[] = [];
    try {
      const content = req.file.buffer.toString('utf-8');
      preview = await parseImportContent(content, importType);
    } catch (err) {
      console.error('Preview parse error:', err);
    }

    await service.updateImportProgress(record.id, 'pending', { preview: preview.slice(0, 5) }, tenantId);

    // Publish to processing queue with file content
    const message = {
      importId: record.id,
      tenantId,
      fileBuffer: req.file.buffer.toString('base64'),
      fileType: importType
    };
    await rabbitmqClient.publish(
      '',
      Queues.Import,
      Buffer.from(JSON.stringify(message)),
      { contentType: 'application/json' }
    );

    res.status(202).json({ importId: record.id, status: record.status });
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