/**
 * Phase 4: Document API Routes
 */

import { Router } from 'express';
import { DocsRepo } from './repo';
import { DocumentBuilders } from './document-builders';
import { RenderService } from './render-service';
import { requireAuth } from '../auth/middleware';
import { db } from '../db';
import { crmActivity } from '@shared/schema';

const router = Router();
const repo = new DocsRepo();
const builders = new DocumentBuilders();
const renderer = new RenderService();

/**
 * Generate billing statement
 */
router.post('/api/documents/generate/statement', requireAuth, async (req, res) => {
  try {
    const { loan_id, period_start, period_end, due_date } = req.body;
    
    if (!loan_id || !period_start || !period_end || !due_date) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Build statement data
    const payload = await builders.buildBillingStatement(
      loan_id,
      period_start,
      period_end,
      due_date
    );
    
    // Get template
    const template = await repo.getLatestTemplate('billing_statement');
    if (!template) {
      return res.status(404).json({ error: 'No billing statement template found' });
    }
    
    // Render document
    const rendered = await renderer.renderDocument(
      {
        type: 'billing_statement',
        template_id: template.template_id,
        payload
      },
      template as any
    );
    
    // Save artifact
    const docId = await repo.insertArtifact({
      type: 'billing_statement',
      loan_id,
      period_start,
      period_end,
      template_id: template.template_id,
      payload_json: payload,
      inputs_hash: rendered.inputs_hash,
      pdf_hash: rendered.pdf_hash,
      pdf_bytes: rendered.pdf_bytes,
      size_bytes: rendered.size_bytes
    });
    
    // Log to CRM activity
    await db.insert(crmActivity).values({
      loanId: loan_id,
      userId: (req as any).user?.id || 1,
      activityType: 'document',
      activityData: {
        description: `Billing Statement generated for period ${period_start} to ${period_end}`,
        documentType: 'billing_statement',
        documentId: docId,
        periodStart: period_start,
        periodEnd: period_end,
        dueDate: due_date,
        source: 'document_generation'
      },
      isSystem: false,
      createdAt: new Date()
    });
    
    res.json({
      success: true,
      doc_id: docId,
      size_bytes: rendered.size_bytes,
      pdf_hash: rendered.pdf_hash
    });
    
  } catch (error) {
    console.error('Statement generation error:', error);
    res.status(500).json({ error: 'Failed to generate statement' });
  }
});

/**
 * Generate escrow analysis document
 */
router.post('/api/documents/generate/escrow-analysis', requireAuth, async (req, res) => {
  try {
    const { analysis_id } = req.body;
    
    if (!analysis_id) {
      return res.status(400).json({ error: 'Missing analysis_id' });
    }
    
    // Build analysis data
    const payload = await builders.buildEscrowAnalysis(analysis_id);
    
    // Get template
    const template = await repo.getLatestTemplate('escrow_analysis');
    if (!template) {
      return res.status(404).json({ error: 'No escrow analysis template found' });
    }
    
    // Render document
    const rendered = await renderer.renderDocument(
      {
        type: 'escrow_analysis',
        template_id: template.template_id,
        payload
      },
      template as any
    );
    
    // Save artifact
    const docId = await repo.insertArtifact({
      type: 'escrow_analysis',
      loan_id: payload.loan_id,
      related_id: analysis_id,
      template_id: template.template_id,
      payload_json: payload,
      inputs_hash: rendered.inputs_hash,
      pdf_hash: rendered.pdf_hash,
      pdf_bytes: rendered.pdf_bytes,
      size_bytes: rendered.size_bytes
    });
    
    res.json({
      success: true,
      doc_id: docId,
      size_bytes: rendered.size_bytes,
      pdf_hash: rendered.pdf_hash
    });
    
  } catch (error) {
    console.error('Escrow analysis generation error:', error);
    res.status(500).json({ error: 'Failed to generate escrow analysis' });
  }
});

/**
 * Generate 1098 tax document
 */
router.post('/api/documents/generate/1098', requireAuth, async (req, res) => {
  try {
    const { loan_id, tax_year } = req.body;
    
    if (!loan_id || !tax_year) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Build 1098 data
    const payload = await builders.buildYear1098(loan_id, tax_year);
    
    // Get template
    const template = await repo.getLatestTemplate('year_end_1098');
    if (!template) {
      return res.status(404).json({ error: 'No 1098 template found' });
    }
    
    // Render document
    const rendered = await renderer.renderDocument(
      {
        type: 'year_end_1098',
        template_id: template.template_id,
        payload
      },
      template as any
    );
    
    // Save artifact
    const docId = await repo.insertArtifact({
      type: 'year_end_1098',
      loan_id,
      tax_year,
      template_id: template.template_id,
      payload_json: payload,
      inputs_hash: rendered.inputs_hash,
      pdf_hash: rendered.pdf_hash,
      pdf_bytes: rendered.pdf_bytes,
      size_bytes: rendered.size_bytes
    });
    
    res.json({
      success: true,
      doc_id: docId,
      size_bytes: rendered.size_bytes,
      pdf_hash: rendered.pdf_hash
    });
    
  } catch (error) {
    console.error('1098 generation error:', error);
    res.status(500).json({ error: 'Failed to generate 1098' });
  }
});

/**
 * Get documents for a loan
 */
router.get('/api/documents/loan/:loanId', requireAuth, async (req, res) => {
  try {
    const { loanId } = req.params;
    const { type } = req.query;
    
    const documents = await repo.getDocumentsForLoan(
      parseInt(loanId),
      type as string | undefined
    );
    
    // Don't send PDF bytes in list response
    const documentList = documents.map(doc => ({
      doc_id: doc.doc_id,
      type: doc.type,
      period_start: doc.period_start,
      period_end: doc.period_end,
      tax_year: doc.tax_year,
      size_bytes: doc.size_bytes,
      created_at: doc.created_at
    }));
    
    res.json(documentList);
    
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Failed to get documents' });
  }
});

/**
 * Download document PDF
 */
router.get('/api/documents/:docId/download', requireAuth, async (req, res) => {
  try {
    const { docId } = req.params;
    
    const document = await repo.getArtifact(docId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Set headers for PDF download
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': document.size_bytes.toString(),
      'Content-Disposition': `attachment; filename="${document.type}_${document.doc_id}.pdf"`,
      'X-Document-Hash': document.pdf_hash
    });
    
    res.send(document.pdf_bytes);
    
  } catch (error) {
    console.error('Document download error:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

/**
 * Schedule a notice
 */
router.post('/api/notices/schedule', requireAuth, async (req, res) => {
  try {
    const { loan_id, notice_template_id, trigger_code, params, scheduled_for } = req.body;
    
    if (!loan_id || !notice_template_id || !trigger_code || !scheduled_for) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const noticeId = await repo.scheduleNotice({
      loan_id,
      notice_template_id,
      trigger_code,
      params,
      scheduled_for: new Date(scheduled_for)
    });
    
    res.json({
      success: true,
      notice_id: noticeId
    });
    
  } catch (error) {
    console.error('Notice scheduling error:', error);
    res.status(500).json({ error: 'Failed to schedule notice' });
  }
});

/**
 * Get scheduled notices
 */
router.get('/api/notices/scheduled', requireAuth, async (req, res) => {
  try {
    const notices = await repo.getScheduledNotices();
    res.json(notices);
  } catch (error) {
    console.error('Get notices error:', error);
    res.status(500).json({ error: 'Failed to get scheduled notices' });
  }
});

/**
 * Cancel a scheduled notice
 */
router.post('/api/notices/:noticeId/cancel', requireAuth, async (req, res) => {
  try {
    const { noticeId } = req.params;
    
    await repo.cancelNotice(noticeId);
    
    res.json({
      success: true,
      message: 'Notice canceled'
    });
    
  } catch (error) {
    console.error('Notice cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel notice' });
  }
});

/**
 * Initialize default templates
 */
router.post('/api/documents/init-templates', requireAuth, async (req, res) => {
  try {
    await repo.insertDefaultTemplates();
    res.json({
      success: true,
      message: 'Default templates created'
    });
  } catch (error) {
    console.error('Template initialization error:', error);
    res.status(500).json({ error: 'Failed to initialize templates' });
  }
});

export default router;