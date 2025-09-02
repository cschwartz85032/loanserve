// Storage Test Routes for S3 Integration
// Provides endpoints to test AWS S3 connectivity and operations

import { Router } from 'express';
import { AIPipelineStorageManager } from '../utils/storage';

const router = Router();

/**
 * Test S3 connectivity
 */
router.get('/test', async (req, res) => {
  try {
    console.log('[Storage Routes] Testing S3 connectivity...');
    
    const storage = new AIPipelineStorageManager();
    const isConnected = await storage.testConnection();
    
    if (isConnected) {
      const config = storage.getS3Config();
      console.log('[Storage Routes] S3 connection test successful');
      
      res.json({
        success: true,
        message: 'S3 connection successful',
        config: {
          bucket: config.bucket,
          region: config.region
        }
      });
    } else {
      console.error('[Storage Routes] S3 connection test failed');
      
      res.status(503).json({
        success: false,
        message: 'S3 connection failed'
      });
    }
  } catch (error: any) {
    console.error('[Storage Routes] S3 test error:', error);
    
    res.status(500).json({
      success: false,
      message: 'S3 test failed',
      error: error.message
    });
  }
});

/**
 * Test file upload with small test file
 */
router.post('/test-upload', async (req, res) => {
  try {
    console.log('[Storage Routes] Testing S3 upload...');
    
    const storage = new AIPipelineStorageManager();
    const tenantId = 'test-tenant';
    const loanId = 'test-loan';
    
    // Create a small test file
    const testContent = Buffer.from('S3 upload test file content');
    const testFile = {
      buffer: testContent,
      originalname: 'test-upload.txt',
      mimetype: 'text/plain'
    };
    
    const result = await storage.saveUpload(
      testFile as any,
      tenantId,
      loanId,
      'test-upload.txt'
    );
    
    console.log('[Storage Routes] S3 upload test successful:', result.uri);
    
    res.json({
      success: true,
      message: 'S3 upload test successful',
      file: {
        uri: result.uri,
        filename: result.filename,
        size: result.size,
        sha256: result.sha256
      }
    });
  } catch (error: any) {
    console.error('[Storage Routes] S3 upload test error:', error);
    
    res.status(500).json({
      success: false,
      message: 'S3 upload test failed',
      error: error.message
    });
  }
});

/**
 * Test file download
 */
router.get('/test-download/:tenantId/:loanId/:docId', async (req, res) => {
  try {
    const { tenantId, loanId, docId } = req.params;
    console.log(`[Storage Routes] Testing S3 download for ${tenantId}/${loanId}/${docId}`);
    
    const storage = new AIPipelineStorageManager();
    const text = await storage.getText(tenantId, loanId, docId);
    
    console.log('[Storage Routes] S3 download test successful');
    
    res.json({
      success: true,
      message: 'S3 download test successful',
      content: text
    });
  } catch (error: any) {
    console.error('[Storage Routes] S3 download test error:', error);
    
    res.status(500).json({
      success: false,
      message: 'S3 download test failed',
      error: error.message
    });
  }
});

/**
 * Test file integrity verification
 */
router.post('/test-integrity', async (req, res) => {
  try {
    const { tenantId, loanId, docId, expectedSha256 } = req.body;
    
    if (!tenantId || !loanId || !docId || !expectedSha256) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: tenantId, loanId, docId, expectedSha256'
      });
    }
    
    console.log(`[Storage Routes] Testing S3 integrity for ${tenantId}/${loanId}/${docId}`);
    
    const storage = new AIPipelineStorageManager();
    const isValid = await storage.verifyFileIntegrity(tenantId, loanId, docId, expectedSha256);
    
    console.log(`[Storage Routes] S3 integrity test result: ${isValid}`);
    
    res.json({
      success: true,
      message: 'S3 integrity test completed',
      isValid
    });
  } catch (error: any) {
    console.error('[Storage Routes] S3 integrity test error:', error);
    
    res.status(500).json({
      success: false,
      message: 'S3 integrity test failed',
      error: error.message
    });
  }
});

/**
 * Test cleanup operation
 */
router.delete('/test-cleanup/:tenantId/:loanId', async (req, res) => {
  try {
    const { tenantId, loanId } = req.params;
    console.log(`[Storage Routes] Testing S3 cleanup for ${tenantId}/${loanId}`);
    
    const storage = new AIPipelineStorageManager();
    await storage.cleanupLoanFiles(tenantId, loanId);
    
    console.log('[Storage Routes] S3 cleanup test successful');
    
    res.json({
      success: true,
      message: 'S3 cleanup test successful'
    });
  } catch (error: any) {
    console.error('[Storage Routes] S3 cleanup test error:', error);
    
    res.status(500).json({
      success: false,
      message: 'S3 cleanup test failed',
      error: error.message
    });
  }
});

export { router as storageRoutes };