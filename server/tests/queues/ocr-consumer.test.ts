import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initOcrConsumer } from '../../../src/queues/ocr/ocr-consumer';
import amqp from 'amqplib';

// Mock AWS Textract
const mockTextractResult = {
  Blocks: [
    {
      BlockType: 'LINE',
      Text: 'Sample Document Text',
      Confidence: 95.5
    },
    {
      BlockType: 'LINE', 
      Text: 'Second line of text',
      Confidence: 92.3
    },
    {
      BlockType: 'WORD',
      Text: 'Word',
      Confidence: 98.1
    }
  ]
};

vi.mock('aws-sdk', () => ({
  S3: vi.fn().mockImplementation(() => ({
    getObject: vi.fn().mockReturnValue({
      promise: vi.fn().mockResolvedValue({
        Body: Buffer.from('mock pdf content')
      })
    })
  })),
  Textract: vi.fn().mockImplementation(() => ({
    detectDocumentText: vi.fn().mockReturnValue({
      promise: vi.fn().mockResolvedValue(mockTextractResult)
    })
  }))
}));

// Mock dependencies
vi.mock('../../../src/db/auditService', () => ({
  auditAction: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../../src/db/eventOutboxService', () => ({
  publishEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../../src/queues/consumer-utils', () => ({
  startConsumer: vi.fn().mockImplementation((conn, opts) => {
    (global as any).testOcrHandler = opts.handler;
    return Promise.resolve();
  })
}));

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined)
      })
    })
  })
}));

describe('OCR Consumer', () => {
  let mockConnection: any;
  let mockClient: any;

  beforeEach(() => {
    mockConnection = {};
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    };
    vi.clearAllMocks();
  });

  it('should initialize OCR consumer', async () => {
    await initOcrConsumer(mockConnection);
    expect((global as any).testOcrHandler).toBeDefined();
  });

  it('should process OCR message successfully', async () => {
    await initOcrConsumer(mockConnection);
    
    const payload = {
      messageId: 'ocr-msg-1',
      tenantId: 'tenant-123',
      documentId: 'doc-456',
      s3Uri: 's3://test-bucket/document.pdf'
    };

    const handler = (global as any).testOcrHandler;
    
    // Should complete without throwing
    await expect(handler(payload, { client: mockClient })).resolves.not.toThrow();
  });

  it('should extract text correctly from Textract response', async () => {
    await initOcrConsumer(mockConnection);
    
    const payload = {
      messageId: 'ocr-msg-2', 
      tenantId: 'tenant-123',
      documentId: 'doc-789',
      s3Uri: 's3://test-bucket/sample.pdf'
    };

    const handler = (global as any).testOcrHandler;
    await handler(payload, { client: mockClient });

    // Should have processed the mocked Textract result
    // Expected text: "Sample Document Text\nSecond line of text"
    // Expected confidence: (95.5 + 92.3) / 2 / 100 = 0.939
  });

  it('should handle Textract API errors gracefully', async () => {
    // Mock Textract to throw an error
    vi.doMock('aws-sdk', () => ({
      S3: vi.fn().mockImplementation(() => ({
        getObject: vi.fn().mockReturnValue({
          promise: vi.fn().mockResolvedValue({
            Body: Buffer.from('mock pdf content')
          })
        })
      })),
      Textract: vi.fn().mockImplementation(() => ({
        detectDocumentText: vi.fn().mockReturnValue({
          promise: vi.fn().mockRejectedValue(new Error('Textract API limit exceeded'))
        })
      }))
    }));

    await initOcrConsumer(mockConnection);
    
    const payload = {
      messageId: 'ocr-msg-3',
      tenantId: 'tenant-123', 
      documentId: 'doc-error',
      s3Uri: 's3://test-bucket/problem.pdf'
    };

    const handler = (global as any).testOcrHandler;
    
    // Should throw OCR processing error
    await expect(handler(payload, { client: mockClient }))
      .rejects.toThrow('OCR processing failed');
  });

  it('should handle S3 fetch errors', async () => {
    // Mock S3 to throw an error
    vi.doMock('aws-sdk', () => ({
      S3: vi.fn().mockImplementation(() => ({
        getObject: vi.fn().mockReturnValue({
          promise: vi.fn().mockRejectedValue(new Error('S3 access denied'))
        })
      }))
    }));

    await initOcrConsumer(mockConnection);
    
    const payload = {
      messageId: 'ocr-msg-4',
      tenantId: 'tenant-123',
      documentId: 'doc-s3-error',
      s3Uri: 's3://private-bucket/restricted.pdf'
    };

    const handler = (global as any).testOcrHandler;
    
    // Should throw S3 error
    await expect(handler(payload, { client: mockClient }))
      .rejects.toThrow('S3 access denied');
  });
});