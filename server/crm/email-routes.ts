/**
 * CRM Email Fire-and-Queue Routes
 * HTTP returns 202, writes to outbox, worker processes
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { outboxMessages } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { CRMEmailRequestedEvent, EmailValidationRules } from './email-types';
import { DEFAULT_EMAIL_VALIDATION_RULES } from './email-types';
import { complianceAudit, COMPLIANCE_EVENTS } from '../compliance/auditService';
import { dncEnforcementService } from './dnc-enforcement';

const router = Router();

/**
 * POST /api/crm/emails/check-dnc
 * Check DNC restrictions for email addresses
 */
router.post('/check-dnc', async (req, res) => {
  try {
    const validation = sendEmailSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: validation.error.errors
      });
    }

    const emailRequest = validation.data;

    // Check DNC restrictions using AI classification
    const contactCheckResult = await dncEnforcementService.checkEmailRestrictions(
      emailRequest.loan_id,
      emailRequest.to,
      emailRequest.subject,
      emailRequest.template_id,
      emailRequest.variables
    );

    // Return DNC check result without sending email
    res.status(200).json(contactCheckResult);

  } catch (error) {
    console.error('[EmailRoutes] DNC check failed:', error);
    res.status(500).json({
      error: 'Failed to check DNC restrictions',
      code: 'DNC_CHECK_FAILED'
    });
  }
});

// Validation schema for email requests
const sendEmailSchema = z.object({
  loan_id: z.number().int().positive(),
  template_id: z.string().optional(),
  subject: z.string().min(1).max(255),
  to: z.array(z.string().email()).min(1).max(50),
  cc: z.array(z.string().email()).max(20).optional(),
  bcc: z.array(z.string().email()).max(20).optional(),
  variables: z.record(z.any()).optional().default({}),
  attachments: z.array(z.object({
    filename: z.string().min(1),
    content: z.string().min(1), // base64 encoded
    type: z.string().min(1)
  })).max(10).optional()
});

/**
 * Fire-and-queue CRM email endpoint
 * POST /api/crm/emails/send
 * Returns 202 immediately, queues for async processing
 */
router.post('/send', async (req, res) => {
  try {
    // Extract user from request (assuming auth middleware sets this)
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Validate request body
    const validationResult = sendEmailSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validationResult.error.errors
      });
    }

    const emailRequest = validationResult.data;

    // Generate correlation ID for tracking
    const correlationId = randomUUID();

    // Validate business rules
    const validationError = await validateEmailRequest(emailRequest, DEFAULT_EMAIL_VALIDATION_RULES);
    if (validationError) {
      return res.status(400).json({
        error: validationError.message,
        code: validationError.code
      });
    }

    // Check do-not-contact restrictions using AI classification
    const contactCheckResult = await dncEnforcementService.checkEmailRestrictions(
      emailRequest.loan_id, 
      emailRequest.to,
      emailRequest.subject,
      emailRequest.template_id,
      emailRequest.variables
    );
    
    if (!contactCheckResult.allowed) {
      // Log DNC violation for compliance
      await complianceAudit.logEvent({
        eventType: COMPLIANCE_EVENTS.COMMS.DNC_VIOLATION_BLOCKED,
        actorType: 'system',
        actorId: 'dnc-enforcement',
        resourceType: 'email_request',
        resourceId: correlationId,
        loanId: emailRequest.loan_id,
        description: `Email blocked due to DNC restrictions: ${emailRequest.subject}`,
        newValues: {
          correlation_id: correlationId,
          subject: emailRequest.subject,
          restrictions: contactCheckResult.restrictions,
          category: contactCheckResult.category
        },
        metadata: {
          loanId: emailRequest.loan_id,
          correlationId: correlationId,
          dncCategory: contactCheckResult.category
        },
        ipAddr: (req as any).ip,
        userAgent: req.headers['user-agent']
      });

      return res.status(403).json({
        error: 'Contact restrictions prevent email delivery',
        code: 'CONTACT_RESTRICTED',
        details: contactCheckResult.restrictions,
        category: contactCheckResult.category
      });
    }

    // Create outbox event - SINGLE ROW WRITE
    const outboxEvent: CRMEmailRequestedEvent = {
      loan_id: emailRequest.loan_id,
      user_id: userId,
      template_id: emailRequest.template_id,
      subject: emailRequest.subject,
      to: emailRequest.to,
      cc: emailRequest.cc,
      bcc: emailRequest.bcc,
      variables: emailRequest.variables || {},
      attachments: emailRequest.attachments,
      correlation_id: correlationId,
      request_metadata: {
        ip_addr: (req as any).ip,
        user_agent: req.headers['user-agent'],
        timestamp: new Date().toISOString()
      }
    };

    // Write to outbox within transaction for atomicity
    await db.transaction(async (trx) => {
      // Insert to outbox
      await trx.insert(outboxMessages).values({
        aggregateType: 'crm',
        aggregateId: emailRequest.loan_id.toString(),
        eventType: 'crm.email.requested.v1',
        payload: outboxEvent,
        correlationId: correlationId,
        attemptCount: 0,
        publishedAt: null
      });

      // Log compliance audit for EMAIL_REQUESTED
      await complianceAudit.logEvent({
        eventType: 'CRM.EMAIL_REQUESTED',
        actorType: 'user',
        actorId: userId,
        resourceType: 'email_request',
        resourceId: correlationId,
        loanId: emailRequest.loan_id,
        description: `Email request queued: ${emailRequest.subject} to ${emailRequest.to.join(', ')}`,
        newValues: {
          correlation_id: correlationId,
          subject: emailRequest.subject,
          recipient_count: emailRequest.to.length + (emailRequest.cc?.length || 0) + (emailRequest.bcc?.length || 0),
          attachment_count: emailRequest.attachments?.length || 0,
          template_id: emailRequest.template_id
        },
        metadata: {
          loanId: emailRequest.loan_id,
          userId: userId,
          correlationId: correlationId
        },
        ipAddr: (req as any).ip,
        userAgent: req.headers['user-agent']
      });
    });

    // Return 202 Accepted immediately
    res.status(202).json({
      status: 'accepted',
      correlation_id: correlationId,
      message: 'Email request queued for processing'
    });

  } catch (error) {
    console.error('[CRMEmailRoute] Error processing email request:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * Get email status by correlation ID
 * GET /api/crm/emails/status/:correlationId
 */
router.get('/status/:correlationId', async (req, res) => {
  try {
    const correlationId = req.params.correlationId;

    // Check outbox status
    const outboxResult = await db
      .select({
        eventType: outboxMessages.eventType,
        publishedAt: outboxMessages.publishedAt,
        attemptCount: outboxMessages.attemptCount,
        lastError: outboxMessages.lastError
      })
      .from(outboxMessages)
      .where(eq(outboxMessages.correlationId, correlationId))
      .limit(1);

    if (outboxResult.length === 0) {
      return res.status(404).json({
        error: 'Email request not found',
        code: 'NOT_FOUND'
      });
    }

    const outboxEntry = outboxResult[0];

    // Determine status
    let status: string;
    if (outboxEntry.publishedAt) {
      status = 'published';
    } else if (outboxEntry.attemptCount > 0) {
      status = 'retrying';
    } else {
      status = 'pending';
    }

    res.json({
      correlation_id: correlationId,
      status: status,
      attempt_count: outboxEntry.attemptCount,
      last_error: outboxEntry.lastError,
      published_at: outboxEntry.publishedAt
    });

  } catch (error) {
    console.error('[CRMEmailRoute] Error getting email status:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * Validate email request against business rules
 */
async function validateEmailRequest(
  request: z.infer<typeof sendEmailSchema>, 
  rules: EmailValidationRules
): Promise<{ message: string; code: string } | null> {
  
  // Check recipient count
  const totalRecipients = request.to.length + (request.cc?.length || 0) + (request.bcc?.length || 0);
  if (totalRecipients > rules.max_recipients) {
    return {
      message: `Too many recipients: ${totalRecipients} (max: ${rules.max_recipients})`,
      code: 'TOO_MANY_RECIPIENTS'
    };
  }

  // Check subject length
  if (request.subject.length > rules.subject_max_length) {
    return {
      message: `Subject too long: ${request.subject.length} chars (max: ${rules.subject_max_length})`,
      code: 'SUBJECT_TOO_LONG'
    };
  }

  // Check attachments
  if (request.attachments) {
    if (request.attachments.length > rules.max_attachments_count) {
      return {
        message: `Too many attachments: ${request.attachments.length} (max: ${rules.max_attachments_count})`,
        code: 'TOO_MANY_ATTACHMENTS'
      };
    }

    let totalSize = 0;
    for (const attachment of request.attachments) {
      // Calculate size from base64 content
      const size = Math.floor(attachment.content.length * 0.75); // base64 overhead
      
      if (size > rules.max_attachment_size_bytes) {
        return {
          message: `Attachment '${attachment.filename}' too large: ${size} bytes (max: ${rules.max_attachment_size_bytes})`,
          code: 'ATTACHMENT_TOO_LARGE'
        };
      }
      
      totalSize += size;
      
      // Check MIME type
      if (!rules.allowed_mime_types.includes(attachment.type)) {
        return {
          message: `Attachment '${attachment.filename}' has unsupported type: ${attachment.type}`,
          code: 'UNSUPPORTED_ATTACHMENT_TYPE'
        };
      }
    }

    if (totalSize > rules.max_total_attachment_size_bytes) {
      return {
        message: `Total attachment size too large: ${totalSize} bytes (max: ${rules.max_total_attachment_size_bytes})`,
        code: 'TOTAL_ATTACHMENTS_TOO_LARGE'
      };
    }
  }

  return null;
}

/**
 * Check do-not-contact restrictions for recipients
 */
async function checkContactRestrictions(loanId: number, recipients: string[]): Promise<{
  allowed: boolean;
  restrictions?: any[];
}> {
  // TODO: Implement do-not-contact checking
  // This would check against:
  // 1. Borrower communication preferences
  // 2. Legal holds/restrictions
  // 3. Opt-out requests
  // 4. Regulatory restrictions
  
  // For now, allow all
  return { allowed: true };
}

export default router;