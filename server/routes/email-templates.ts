/**
 * Email Templates Routes
 * Manage email templates and folders
 */

import { Router } from 'express';
import { db } from '../db';
import { emailTemplates, emailTemplateFolders } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware';
import { sendSuccess, sendError, ErrorResponses } from '../utils/response-utils';

const router = Router();

/**
 * GET /api/email-template-folders
 * Get all email template folders with template count
 */
router.get('/email-template-folders', requireAuth, async (req, res) => {
  try {
    // Get folders with template count
    const foldersWithCount = await db
      .select({
        id: emailTemplateFolders.id,
        name: emailTemplateFolders.name,
        parentId: emailTemplateFolders.parentId,
        createdBy: emailTemplateFolders.createdBy,
        createdAt: emailTemplateFolders.createdAt,
        templateCount: sql<number>`count(${emailTemplates.id})::int`
      })
      .from(emailTemplateFolders)
      .leftJoin(emailTemplates, eq(emailTemplates.folderId, emailTemplateFolders.id))
      .groupBy(emailTemplateFolders.id);

    return sendSuccess(res, foldersWithCount);
  } catch (error) {
    console.error('Error fetching email template folders:', error);
    return ErrorResponses.internalError(res, 'Failed to fetch folders', error);
  }
});

/**
 * POST /api/email-template-folders
 * Create a new folder
 */
router.post('/email-template-folders', requireAuth, async (req, res) => {
  try {
    const { name, parentId } = req.body;
    
    if (!name) {
      return ErrorResponses.badRequest(res, 'Folder name is required');
    }

    const [folder] = await db.insert(emailTemplateFolders).values({
      name,
      parentId: parentId || null,
      createdBy: (req as any).user?.id || null
    }).returning();

    return sendSuccess(res, folder, 'Folder created successfully');
  } catch (error) {
    console.error('Error creating folder:', error);
    return ErrorResponses.internalError(res, 'Failed to create folder', error);
  }
});

/**
 * PUT /api/email-template-folders/:id
 * Update a folder
 */
router.put('/email-template-folders/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    if (!name) {
      return ErrorResponses.badRequest(res, 'Folder name is required');
    }

    const [folder] = await db
      .update(emailTemplateFolders)
      .set({ 
        name,
        updatedAt: new Date()
      })
      .where(eq(emailTemplateFolders.id, parseInt(id)))
      .returning();

    if (!folder) {
      return ErrorResponses.notFound(res, 'Folder not found');
    }

    return sendSuccess(res, folder, 'Folder updated successfully');
  } catch (error) {
    console.error('Error updating folder:', error);
    return ErrorResponses.internalError(res, 'Failed to update folder', error);
  }
});

/**
 * DELETE /api/email-template-folders/:id
 * Delete a folder
 */
router.delete('/email-template-folders/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if folder has templates
    const [hasTemplates] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailTemplates)
      .where(eq(emailTemplates.folderId, parseInt(id)));
    
    if (hasTemplates.count > 0) {
      return ErrorResponses.badRequest(res, 'Cannot delete folder with templates');
    }

    await db
      .delete(emailTemplateFolders)
      .where(eq(emailTemplateFolders.id, parseInt(id)));

    return sendSuccess(res, null, 'Folder deleted successfully');
  } catch (error) {
    console.error('Error deleting folder:', error);
    return ErrorResponses.internalError(res, 'Failed to delete folder', error);
  }
});

/**
 * GET /api/email-templates
 * Get all email templates or templates for a specific folder
 */
router.get('/email-templates', requireAuth, async (req, res) => {
  try {
    const { folderId } = req.query;
    
    let query = db.select().from(emailTemplates);
    
    if (folderId) {
      query = query.where(eq(emailTemplates.folderId, parseInt(folderId as string)));
    }
    
    const templates = await query;
    return sendSuccess(res, templates);
  } catch (error) {
    console.error('Error fetching email templates:', error);
    return ErrorResponses.internalError(res, 'Failed to fetch templates', error);
  }
});

/**
 * GET /api/email-templates/:id
 * Get a specific email template
 */
router.get('/email-templates/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [template] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.id, parseInt(id)))
      .limit(1);
    
    if (!template) {
      return ErrorResponses.notFound(res, 'Template not found');
    }
    
    return sendSuccess(res, template);
  } catch (error) {
    console.error('Error fetching email template:', error);
    return ErrorResponses.internalError(res, 'Failed to fetch template', error);
  }
});

/**
 * POST /api/email-templates
 * Create a new email template
 */
router.post('/email-templates', requireAuth, async (req, res) => {
  try {
    const { name, subject, body, isShared, folderId } = req.body;
    
    if (!name || !subject) {
      return ErrorResponses.badRequest(res, 'Template name and subject are required');
    }

    const [template] = await db.insert(emailTemplates).values({
      name,
      subject,
      body: body || '',
      isShared: isShared || false,
      folderId: folderId || null,
      createdBy: (req as any).user?.id || null
    }).returning();

    return sendSuccess(res, template, 'Template created successfully');
  } catch (error) {
    console.error('Error creating email template:', error);
    return ErrorResponses.internalError(res, 'Failed to create template', error);
  }
});

/**
 * PUT /api/email-templates/:id
 * Update an email template
 */
router.put('/email-templates/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, subject, body, isShared, folderId } = req.body;
    
    const [template] = await db
      .update(emailTemplates)
      .set({
        name,
        subject,
        body,
        isShared,
        folderId,
        updatedAt: new Date()
      })
      .where(eq(emailTemplates.id, parseInt(id)))
      .returning();

    if (!template) {
      return ErrorResponses.notFound(res, 'Template not found');
    }

    return sendSuccess(res, template, 'Template updated successfully');
  } catch (error) {
    console.error('Error updating email template:', error);
    return ErrorResponses.internalError(res, 'Failed to update template', error);
  }
});

/**
 * DELETE /api/email-templates/:id
 * Delete an email template
 */
router.delete('/email-templates/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    await db
      .delete(emailTemplates)
      .where(eq(emailTemplates.id, parseInt(id)));

    return sendSuccess(res, null, 'Template deleted successfully');
  } catch (error) {
    console.error('Error deleting email template:', error);
    return ErrorResponses.internalError(res, 'Failed to delete template', error);
  }
});

/**
 * POST /api/email-templates/:id/clone
 * Clone an email template
 */
router.post('/email-templates/:id/clone', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    // Get original template
    const [original] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.id, parseInt(id)))
      .limit(1);
    
    if (!original) {
      return ErrorResponses.notFound(res, 'Template not found');
    }

    // Create clone
    const [cloned] = await db.insert(emailTemplates).values({
      name: name || `${original.name} (Copy)`,
      subject: original.subject,
      body: original.body,
      isShared: false,
      folderId: original.folderId,
      createdBy: (req as any).user?.id || null
    }).returning();

    return sendSuccess(res, cloned, 'Template cloned successfully');
  } catch (error) {
    console.error('Error cloning email template:', error);
    return ErrorResponses.internalError(res, 'Failed to clone template', error);
  }
});

export { router as emailTemplatesRouter };