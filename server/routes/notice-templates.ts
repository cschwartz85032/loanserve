/**
 * Notice Templates Routes
 * Manage Word templates for borrower notices
 */

import { Router } from 'express';
import { db } from '../db';
import { noticeTemplates, noticeSettings } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware';
import { sendSuccess, sendError, ErrorResponses } from '../utils/response-utils';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { complianceAudit, COMPLIANCE_EVENTS } from '../compliance/auditService.js';
import { getRealUserIP } from '../utils/network.js';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'templates');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept Word documents and PDFs
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/pdf'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Word documents and PDFs are allowed.'));
    }
  }
});

/**
 * GET /api/notice-templates
 * Get all notice templates
 */
router.get('/notice-templates', requireAuth, async (req, res) => {
  try {
    const templates = await db.select().from(noticeTemplates);
    return sendSuccess(res, templates);
  } catch (error) {
    console.error('Error fetching notice templates:', error);
    return ErrorResponses.internalError(res, 'Failed to fetch notice templates', error);
  }
});

/**
 * GET /api/notice-templates/:category
 * Get templates by category
 */
router.get('/notice-templates/:category', requireAuth, async (req, res) => {
  try {
    const { category } = req.params;
    const templates = await db.select()
      .from(noticeTemplates)
      .where(eq(noticeTemplates.category, category));
    return sendSuccess(res, templates);
  } catch (error) {
    console.error('Error fetching templates by category:', error);
    return ErrorResponses.internalError(res, 'Failed to fetch templates', error);
  }
});

/**
 * POST /api/notice-templates/upload
 * Upload a new template
 */
router.post('/notice-templates/upload', requireAuth, upload.single('template'), async (req, res) => {
  try {
    if (!req.file) {
      return ErrorResponses.badRequest(res, 'No file uploaded');
    }

    const { category, subcategory, name, description } = req.body;
    
    if (!category || !name) {
      return ErrorResponses.badRequest(res, 'Category and name are required');
    }

    const template = await db.insert(noticeTemplates).values({
      category,
      subcategory: subcategory || null,
      name,
      description: description || null,
      filename: req.file.originalname,
      fileUrl: `/uploads/templates/${req.file.filename}`,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: (req as any).user?.id || null
    }).returning();

    // Log individual audit entries for each field in the uploaded template (like escrow disbursements)
    const templateFields = Object.keys(template[0]);
    for (const field of templateFields) {
      const newValue = (template[0] as any)[field];
      
      // Skip internal fields that don't need audit logging
      if (['id', 'createdAt', 'updatedAt'].includes(field)) {
        continue;
      }
      
      await complianceAudit.logEvent({
        eventType: COMPLIANCE_EVENTS.DOCUMENT.UPLOADED,
        actorType: 'user',
        actorId: ((req as any).user?.id || null)?.toString(),
        resourceType: 'notice_template',
        resourceId: template[0].id.toString(),
        loanId: null, // Templates are not tied to specific loans
        ipAddr: getRealUserIP(req),
        userAgent: req.headers?.['user-agent'],
        description: `Template field '${field}' set to '${newValue}' on template upload`,
        previousValues: { [field]: null },
        newValues: { [field]: newValue },
        changedFields: [field]
      });
    }

    return sendSuccess(res, template[0], 'Template uploaded successfully');
  } catch (error) {
    console.error('Error uploading template:', error);
    return ErrorResponses.internalError(res, 'Failed to upload template', error);
  }
});

/**
 * DELETE /api/notice-templates/:id
 * Delete a template
 */
router.delete('/notice-templates/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get template info first
    const [template] = await db.select()
      .from(noticeTemplates)
      .where(eq(noticeTemplates.id, parseInt(id)))
      .limit(1);
    
    if (!template) {
      return ErrorResponses.notFound(res, 'Template not found');
    }
    
    // Delete file from disk if exists
    if (template.fileUrl) {
      const filePath = path.join(process.cwd(), template.fileUrl);
      try {
        await fs.unlink(filePath);
      } catch (err) {
        console.warn('Could not delete file:', filePath);
      }
    }
    
    // Log individual audit entries for each field in the deleted template (like escrow disbursements)
    const templateFields = Object.keys(template);
    for (const field of templateFields) {
      const oldValue = (template as any)[field];
      
      // Skip internal fields that don't need audit logging
      if (['id', 'createdAt', 'updatedAt'].includes(field)) {
        continue;
      }
      
      await complianceAudit.logEvent({
        eventType: COMPLIANCE_EVENTS.DOCUMENT.DELETED,
        actorType: 'user',
        actorId: ((req as any).user?.id || null)?.toString(),
        resourceType: 'notice_template',
        resourceId: template.id.toString(),
        loanId: null, // Templates are not tied to specific loans
        ipAddr: getRealUserIP(req),
        userAgent: req.headers?.['user-agent'],
        description: `Template field '${field}' with value '${oldValue}' deleted on template deletion`,
        previousValues: { [field]: oldValue },
        newValues: { [field]: null },
        changedFields: [field]
      });
    }
    
    // Delete from database
    await db.delete(noticeTemplates)
      .where(eq(noticeTemplates.id, parseInt(id)));
    
    return sendSuccess(res, null, 'Template deleted successfully');
  } catch (error) {
    console.error('Error deleting template:', error);
    return ErrorResponses.internalError(res, 'Failed to delete template', error);
  }
});

/**
 * GET /api/notice-settings
 * Get all notice settings
 */
router.get('/notice-settings', requireAuth, async (req, res) => {
  try {
    const settings = await db.select().from(noticeSettings);
    
    // Transform to a more usable format
    const settingsMap: Record<string, any> = {};
    settings.forEach(setting => {
      if (!settingsMap[setting.category]) {
        settingsMap[setting.category] = {};
      }
      settingsMap[setting.category][setting.settingKey] = setting.settingValue;
    });
    
    return sendSuccess(res, settingsMap);
  } catch (error) {
    console.error('Error fetching notice settings:', error);
    return ErrorResponses.internalError(res, 'Failed to fetch notice settings', error);
  }
});

/**
 * PUT /api/notice-settings
 * Update notice settings
 */
router.put('/notice-settings', requireAuth, async (req, res) => {
  try {
    const { category, settingKey, settingValue } = req.body;
    
    if (!category || !settingKey) {
      return ErrorResponses.badRequest(res, 'Category and settingKey are required');
    }
    
    // Upsert the setting
    const existingSetting = await db.select()
      .from(noticeSettings)
      .where(and(
        eq(noticeSettings.category, category),
        eq(noticeSettings.settingKey, settingKey)
      ))
      .limit(1);
    
    let result;
    if (existingSetting.length > 0) {
      // Update existing
      result = await db.update(noticeSettings)
        .set({
          settingValue,
          updatedBy: (req as any).user?.id || null,
          updatedAt: new Date()
        })
        .where(and(
          eq(noticeSettings.category, category),
          eq(noticeSettings.settingKey, settingKey)
        ))
        .returning();
    } else {
      // Insert new
      result = await db.insert(noticeSettings).values({
        category,
        settingKey,
        settingValue,
        updatedBy: (req as any).user?.id || null
      }).returning();
    }
    
    return sendSuccess(res, result[0], 'Setting updated successfully');
  } catch (error) {
    console.error('Error updating notice setting:', error);
    return ErrorResponses.internalError(res, 'Failed to update setting', error);
  }
});

export { router as noticeTemplatesRouter };