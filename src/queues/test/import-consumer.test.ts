import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initImportConsumer } from '../import/import-consumer';
import amqp from 'amqplib';

// Mock dependencies
vi.mock('../../db/auditService', () => ({
  auditAction: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../db/eventOutboxService', () => ({
  publishEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../consumer-utils', () => ({
  startConsumer: vi.fn().mockImplementation((conn, opts) => {
    // Store handler for testing
    (global as any).testHandler = opts.handler;
    return Promise.resolve();
  })
}));

describe('Import Consumer', () => {
  let mockConnection: any;
  let mockClient: any;

  beforeEach(() => {
    mockConnection = {};
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    };
    vi.clearAllMocks();
  });

  it('should initialize import consumer', async () => {
    await initImportConsumer(mockConnection);
    expect((global as any).testHandler).toBeDefined();
  });

  it('should process CSV import data correctly', async () => {
    const csvData = `loan_number,borrower_name,loan_amount
12345,John Doe,250000
67890,Jane Smith,300000`;

    // Mock S3 fetch
    vi.doMock('aws-sdk', () => ({
      S3: vi.fn().mockImplementation(() => ({
        getObject: vi.fn().mockReturnValue({
          promise: vi.fn().mockResolvedValue({
            Body: csvData
          })
        })
      }))
    }));

    const payload = {
      messageId: 'test-msg-1',
      tenantId: 'tenant-123',
      importId: 'import-456',
      fileData: { s3Key: 'test.csv' }
    };

    const handler = (global as any).testHandler;
    expect(handler).toBeDefined();

    // Should not throw error
    await expect(handler(payload, { client: mockClient })).resolves.not.toThrow();
  });

  it('should handle malformed CSV data', async () => {
    const malformedCsv = `loan_number,borrower_name
12345,John Doe,ExtraColumn
InvalidRow`;

    vi.doMock('aws-sdk', () => ({
      S3: vi.fn().mockImplementation(() => ({
        getObject: vi.fn().mockReturnValue({
          promise: vi.fn().mockResolvedValue({
            Body: malformedCsv
          })
        })
      }))
    }));

    const payload = {
      messageId: 'test-msg-2',
      tenantId: 'tenant-123',
      importId: 'import-789',
      fileData: { s3Key: 'bad.csv' }
    };

    const handler = (global as any).testHandler;
    
    // Should handle gracefully - implementation should validate and skip bad rows
    await expect(handler(payload, { client: mockClient })).resolves.not.toThrow();
  });
});