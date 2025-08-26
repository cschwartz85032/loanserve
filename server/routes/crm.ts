import { Router } from 'express';
import { db } from '../db';
import { 
  crmNotes, 
  crmTasks, 
  crmAppointments, 
  crmCalls, 
  crmActivity, 
  crmCollaborators,
  crmDeals,
  users,
  loans,
  documents
} from '@shared/schema';
import { eq, desc, and, or } from 'drizzle-orm';
import { z } from 'zod';
import sgMail from '@sendgrid/mail';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { 
  CRM_CONSTANTS,
  logActivity as logCrmActivity,
  parsePhoneData,
  parseEmailData,
  formatPhoneForStorage,
  formatEmailsForStorage,
  getActivityDescription
} from '../utils/crm-utils';
import { 
  SESSION_CONFIG,
  AUTH_CONFIG,
  RATE_LIMIT_CONFIG,
  EMAIL_CONFIG,
  FILE_UPLOAD_CONFIG
} from '../config/constants';
import { CRMNotificationService } from '../crm/notification-service';

const router = Router();

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Initialize CRM Notification Service
const notificationService = new CRMNotificationService();

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: FILE_UPLOAD_CONFIG.MAX_FILE_SIZE
  }
});

// Use the imported logCrmActivity function instead of duplicating it
const logActivity = logCrmActivity;

// Notes endpoints
router.get('/loans/:loanId/crm/notes', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    
    const notes = await db
      .select({
        id: crmNotes.id,
        content: crmNotes.content,
        isPrivate: crmNotes.isPrivate,
        mentionedUsers: crmNotes.mentionedUsers,
        attachments: crmNotes.attachments,
        createdAt: crmNotes.createdAt,
        userId: crmNotes.userId,
        userName: users.username
      })
      .from(crmNotes)
      .leftJoin(users, eq(crmNotes.userId, users.id))
      .where(eq(crmNotes.loanId, loanId))
      .orderBy(desc(crmNotes.createdAt));
    
    res.json(notes);
  } catch (error) {
    console.error('Error fetching CRM notes:', error);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

router.post('/loans/:loanId/crm/notes', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const userId = (req as any).user?.id || 1; // Get from session
    const { content, isPrivate, mentionedUsers, attachments } = req.body;
    
    const [note] = await db
      .insert(crmNotes)
      .values({
        loanId,
        userId,
        content,
        isPrivate: isPrivate || false,
        mentionedUsers: mentionedUsers || [],
        attachments: attachments || []
      })
      .returning();
    
    // Log activity
    await logActivity(loanId, userId, CRM_CONSTANTS.ACTIVITY_TYPES.NOTE, {
      description: `Added a note: ${content.substring(0, 100)}...`
    }, note.id);
    
    res.json(note);
  } catch (error) {
    console.error('Error creating CRM note:', error);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// Tasks endpoints
router.get('/loans/:loanId/crm/tasks', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    
    const tasks = await db
      .select({
        id: crmTasks.id,
        title: crmTasks.title,
        description: crmTasks.description,
        status: crmTasks.status,
        priority: crmTasks.priority,
        dueDate: crmTasks.dueDate,
        completedAt: crmTasks.completedAt,
        tags: crmTasks.tags,
        createdAt: crmTasks.createdAt,
        createdBy: crmTasks.createdBy,
        assignedTo: crmTasks.assignedTo,
        assignedToName: users.username
      })
      .from(crmTasks)
      .leftJoin(users, eq(crmTasks.assignedTo, users.id))
      .where(eq(crmTasks.loanId, loanId))
      .orderBy(desc(crmTasks.createdAt));
    
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching CRM tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

router.post('/loans/:loanId/crm/tasks', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const userId = (req as any).user?.id || 1;
    const { title, description, assignedTo, dueDate, priority, tags } = req.body;
    
    const [task] = await db
      .insert(crmTasks)
      .values({
        loanId,
        createdBy: userId,
        title,
        description,
        assignedTo,
        dueDate,
        priority: priority || 'medium',
        tags: tags || []
      })
      .returning();
    
    // Log activity
    await logActivity(loanId, userId, 'task', {
      description: `Created task: ${title}`
    }, task.id);
    
    // Send notification if task is assigned to someone
    if (assignedTo && assignedTo !== userId) {
      // Get assignee's email
      const assigneeResult = await db
        .select({ email: users.email, username: users.username })
        .from(users)
        .where(eq(users.id, assignedTo));
      
      if (assigneeResult.length > 0) {
        const assignee = assigneeResult[0];
        const assignerResult = await db
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, userId));
        
        const assigner = assignerResult[0]?.username || 'System';
        
        // Send task assignment notification
        await notificationService.sendNotification({
          type: 'task_assignment',
          loanId,
          recipientEmail: assignee.email,
          recipientName: assignee.username,
          data: {
            task: {
              title,
              description: description || 'No description provided'
            },
            assignedBy: assigner,
            dueDate: dueDate || 'No due date',
            priority: priority || 'medium'
          }
        });
      }
    }
    
    res.json(task);
  } catch (error) {
    console.error('Error creating CRM task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

router.patch('/loans/:loanId/crm/tasks/:taskId', async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const loanId = parseInt(req.params.loanId);
    const userId = (req as any).user?.id || 1;
    const updates = req.body;
    
    // If marking as completed, set completedAt
    if (updates.status === 'completed' && !updates.completedAt) {
      updates.completedAt = new Date();
    }
    
    const [task] = await db
      .update(crmTasks)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(crmTasks.id, taskId))
      .returning();
    
    // Log activity
    if (updates.status) {
      await logActivity(loanId, userId, 'task', {
        description: `Updated task status to: ${updates.status}`
      }, taskId);
    }
    
    res.json(task);
  } catch (error) {
    console.error('Error updating CRM task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Appointments endpoints
router.get('/loans/:loanId/crm/appointments', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    
    const appointments = await db
      .select()
      .from(crmAppointments)
      .where(eq(crmAppointments.loanId, loanId))
      .orderBy(desc(crmAppointments.startTime));
    
    res.json(appointments);
  } catch (error) {
    console.error('Error fetching CRM appointments:', error);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

router.post('/loans/:loanId/crm/appointments', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const userId = (req as any).user?.id || 1;
    const { 
      title, 
      description, 
      location, 
      startTime, 
      endTime, 
      attendees, 
      reminderMinutes,
      meetingLink
    } = req.body;
    
    const [appointment] = await db
      .insert(crmAppointments)
      .values({
        loanId,
        createdBy: userId,
        title,
        description,
        location,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        attendees: attendees || [],
        reminderMinutes: reminderMinutes || 15,
        meetingLink
      })
      .returning();
    
    // Log activity
    await logActivity(loanId, userId, CRM_CONSTANTS.ACTIVITY_TYPES.APPOINTMENT, {
      description: `Scheduled appointment: ${title}`
    }, appointment.id);
    
    res.json(appointment);
  } catch (error) {
    console.error('Error creating CRM appointment:', error);
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// Text messages endpoint
router.post('/loans/:loanId/crm/texts', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const userId = (req as any).user?.id || 1;
    const { message, recipientPhone } = req.body;
    
    // Log activity for text message
    await logActivity(loanId, userId, CRM_CONSTANTS.ACTIVITY_TYPES.TEXT, {
      description: `Sent text message: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
      phone: recipientPhone,
      message: message
    });
    
    res.json({ success: true, message: 'Text message logged' });
  } catch (error) {
    console.error('Error logging text message:', error);
    res.status(500).json({ error: 'Failed to log text message' });
  }
});

// Calls endpoints
router.get('/loans/:loanId/crm/calls', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    
    const calls = await db
      .select()
      .from(crmCalls)
      .where(eq(crmCalls.loanId, loanId))
      .orderBy(desc(crmCalls.createdAt));
    
    res.json(calls);
  } catch (error) {
    console.error('Error fetching CRM calls:', error);
    res.status(500).json({ error: 'Failed to fetch calls' });
  }
});

router.post('/loans/:loanId/crm/calls', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const userId = (req as any).user?.id || 1;
    const { 
      contactName, 
      contactPhone, 
      direction, 
      status, 
      duration,
      outcome,
      notes,
      scheduledFor
    } = req.body;
    
    const [call] = await db
      .insert(crmCalls)
      .values({
        loanId,
        userId,
        contactName,
        contactPhone,
        direction: direction || 'outbound',
        status: status || 'completed',
        duration,
        outcome,
        notes,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        completedAt: status === 'completed' ? new Date() : null
      })
      .returning();
    
    // Log activity
    await logActivity(loanId, userId, CRM_CONSTANTS.ACTIVITY_TYPES.CALL, {
      description: `${status === 'scheduled' ? 'Scheduled' : 'Logged'} call with ${contactName}`
    }, call.id);
    
    res.json(call);
  } catch (error) {
    console.error('Error creating CRM call:', error);
    res.status(500).json({ error: 'Failed to create call' });
  }
});

// Activity timeline endpoint
router.get('/loans/:loanId/crm/activity', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    
    const activity = await db
      .select({
        id: crmActivity.id,
        activityType: crmActivity.activityType,
        activityData: crmActivity.activityData,
        relatedId: crmActivity.relatedId,
        isSystem: crmActivity.isSystem,
        createdAt: crmActivity.createdAt,
        userId: crmActivity.userId,
        userName: users.username
      })
      .from(crmActivity)
      .leftJoin(users, eq(crmActivity.userId, users.id))
      .where(eq(crmActivity.loanId, loanId))
      .orderBy(desc(crmActivity.createdAt))
      .limit(50);
    
    res.json(activity);
  } catch (error) {
    console.error('Error fetching CRM activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// Collaborators endpoints
router.get('/loans/:loanId/crm/collaborators', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    
    const collaborators = await db
      .select({
        id: crmCollaborators.id,
        userId: crmCollaborators.userId,
        role: crmCollaborators.role,
        permissions: crmCollaborators.permissions,
        addedAt: crmCollaborators.addedAt,
        lastActivityAt: crmCollaborators.lastActivityAt,
        userName: users.username,
        userEmail: users.email
      })
      .from(crmCollaborators)
      .leftJoin(users, eq(crmCollaborators.userId, users.id))
      .where(eq(crmCollaborators.loanId, loanId));
    
    res.json(collaborators);
  } catch (error) {
    console.error('Error fetching CRM collaborators:', error);
    res.status(500).json({ error: 'Failed to fetch collaborators' });
  }
});

router.post('/loans/:loanId/crm/collaborators', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const addedBy = (req as any).user?.id || 1;
    const { userId, role, permissions } = req.body;
    
    const [collaborator] = await db
      .insert(crmCollaborators)
      .values({
        loanId,
        userId,
        role: role || 'viewer',
        permissions: permissions || {},
        addedBy
      })
      .returning();
    
    // Log activity
    await logActivity(loanId, addedBy, 'collaborator', {
      description: `Added collaborator with ${role} role`
    });
    
    res.json(collaborator);
  } catch (error) {
    console.error('Error adding CRM collaborator:', error);
    res.status(500).json({ error: 'Failed to add collaborator' });
  }
});

// Deals endpoints
router.get('/loans/:loanId/crm/deals', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    
    const deals = await db
      .select()
      .from(crmDeals)
      .where(eq(crmDeals.loanId, loanId))
      .orderBy(desc(crmDeals.createdAt));
    
    res.json(deals);
  } catch (error) {
    console.error('Error fetching CRM deals:', error);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

router.post('/loans/:loanId/crm/deals', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const createdBy = (req as any).user?.id || 1;
    const { 
      title, 
      value, 
      stage, 
      probability,
      expectedCloseDate,
      assignedTo,
      notes
    } = req.body;
    
    const [deal] = await db
      .insert(crmDeals)
      .values({
        loanId,
        title,
        value,
        stage: stage || 'prospecting',
        probability: probability || 0,
        expectedCloseDate,
        assignedTo,
        notes,
        createdBy
      })
      .returning();
    
    // Log activity
    await logActivity(loanId, createdBy, 'deal', {
      description: `Created deal: ${title}`
    }, deal.id);
    
    res.json(deal);
  } catch (error) {
    console.error('Error creating CRM deal:', error);
    res.status(500).json({ error: 'Failed to create deal' });
  }
});

// Check SendGrid configuration
router.get('/crm/check-email-config', async (req, res) => {
  try {
    const hasApiKey = !!process.env.SENDGRID_API_KEY;
    const hasFromEmail = !!process.env.SENDGRID_FROM_EMAIL;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Not configured';
    
    // Try to verify the API key by setting it
    if (hasApiKey) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
    }
    
    res.json({
      configured: hasApiKey && hasFromEmail,
      hasApiKey,
      hasFromEmail,
      fromEmail: hasFromEmail ? fromEmail : 'Not configured',
      message: !hasApiKey || !hasFromEmail 
        ? 'SendGrid is not fully configured. Both SENDGRID_API_KEY and SENDGRID_FROM_EMAIL must be set.'
        : `SendGrid is configured with sender: ${fromEmail}. Make sure this email is verified in your SendGrid account.`
    });
  } catch (error: any) {
    res.status(500).json({ 
      error: 'Failed to check email configuration',
      details: error.message 
    });
  }
});

// Send email via SendGrid with attachment support
router.post('/loans/:loanId/crm/send-email', upload.array('files', 10), async (req, res) => {
  // Clean and validate email addresses - remove all whitespace
  const cleanEmail = (email: string) => email.replace(/\s+/g, '').trim();
  
  // Clean the from email address (define at top level for error handler access)
  const fromEmail = process.env.SENDGRID_FROM_EMAIL ? cleanEmail(process.env.SENDGRID_FROM_EMAIL) : '';
  
  try {
    const loanId = parseInt(req.params.loanId);
    const userId = (req as any).user?.id || 1;
    const { to, cc, bcc, subject, content, documentIds } = req.body;

    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({ error: 'Email service not configured' });
    }

    if (!fromEmail) {
      return res.status(500).json({ error: 'From email address not configured' });
    }
    
    // Prepare email message
    const msg: any = {
      to: cleanEmail(to),
      from: fromEmail,
      subject: subject.trim(),
      text: content,
      html: content.replace(/\n/g, '<br>'), // Basic HTML conversion
    };

    // Add CC recipients if provided
    if (cc && cc.trim()) {
      msg.cc = cc.split(',').map((email: string) => cleanEmail(email)).filter(Boolean);
    }

    // Add BCC recipients if provided
    if (bcc && bcc.trim()) {
      msg.bcc = bcc.split(',').map((email: string) => cleanEmail(email)).filter(Boolean);
    }

    // Handle attachments
    const attachments: any[] = [];
    
    console.log('Processing email attachments...');
    console.log('Document IDs received:', documentIds);
    console.log('Files received:', req.files ? (req.files as any[]).length : 0);
    
    // Process document IDs if provided
    if (documentIds) {
      const docIdArray = typeof documentIds === 'string' ? JSON.parse(documentIds) : documentIds;
      console.log('Document ID array:', docIdArray);
      
      if (Array.isArray(docIdArray) && docIdArray.length > 0) {
        // Fetch documents from database
        const docs = await db
          .select()
          .from(documents)
          .where(or(...docIdArray.map((id: number) => eq(documents.id, id))));
        
        console.log(`Found ${docs.length} documents in database`);
        
        // Add documents as attachments
        for (const doc of docs) {
          // Construct the actual file path from storageUrl
          let actualFilePath = '';
          if (doc.storageUrl) {
            // Use the same logic as the file serving endpoint
            if (doc.storageUrl.startsWith('/documents/')) {
              actualFilePath = path.join('server/uploads', doc.storageUrl.replace('/documents/', ''));
            } else if (doc.storageUrl.startsWith('/uploads/')) {
              actualFilePath = path.join('server', doc.storageUrl);
            } else {
              // Assume it's just the filename
              actualFilePath = path.join('server/uploads', doc.storageUrl);
            }
          }
          
          console.log(`Checking document: ${doc.fileName || doc.title}, storageUrl: ${doc.storageUrl}, actualPath: ${actualFilePath}`);
          
          if (actualFilePath && fs.existsSync(actualFilePath)) {
            const fileContent = fs.readFileSync(actualFilePath);
            const attachment = {
              content: fileContent.toString('base64'),
              filename: doc.fileName || doc.title || 'document',
              type: doc.mimeType || 'application/octet-stream',
              disposition: 'attachment'
            };
            attachments.push(attachment);
            console.log(`Successfully added document attachment: ${attachment.filename} (${attachment.type})`);
          } else {
            console.log(`Document file not found at: ${actualFilePath}`);
          }
        }
      }
    }
    
    // Process uploaded files
    if (req.files && Array.isArray(req.files)) {
      console.log(`Processing ${req.files.length} uploaded files`);
      for (const file of req.files) {
        const attachment = {
          content: file.buffer.toString('base64'),
          filename: file.originalname,
          type: file.mimetype,
          disposition: 'attachment'
        };
        attachments.push(attachment);
        console.log(`Added uploaded file: ${attachment.filename} (${attachment.type}, ${file.size} bytes)`);
      }
    }
    
    // Add attachments to email if any
    if (attachments.length > 0) {
      msg.attachments = attachments;
      console.log(`Total attachments added to email: ${attachments.length}`);
    } else {
      console.log('No attachments to add to email');
    }

    // Use notification service for better tracking and unified management
    const notificationResult = await notificationService.sendNotification({
      type: 'email_notification',
      loanId,
      recipientEmail: to,
      recipientName: to,
      data: {
        subject,
        content: body,
        cc: cc || null,
        bcc: bcc || null,
        from: fromEmail
      },
      attachments: attachments.map(att => ({
        content: att.content,
        filename: att.filename,
        type: att.type
      }))
    });

    if (notificationResult.success) {
      // Log activity with attachment info and document ID
      await logActivity(loanId, userId, CRM_CONSTANTS.ACTIVITY_TYPES.EMAIL, {
        description: `Email sent to ${to}`,
        subject,
        to,
        cc: cc || null,
        bcc: bcc || null,
        attachmentCount: attachments.length,
        documentId: notificationResult.docId
      });

      res.json({ 
        success: true, 
        message: 'Email sent successfully', 
        attachmentCount: attachments.length,
        documentId: notificationResult.docId 
      });
    } else {
      throw new Error(notificationResult.error || 'Failed to send notification');
    }
  } catch (error: any) {
    console.error('Error sending email:', error);
    
    // Check for SendGrid specific errors
    if (error.response) {
      const { message, code, response } = error;
      const { body, headers } = response;
      console.error('SendGrid error details:', { code, message, body });
      
      // Log the actual error details
      if (body && body.errors) {
        console.error('SendGrid specific errors:', JSON.stringify(body.errors, null, 2));
      }
      
      // Provide more specific error messages based on SendGrid response
      if (code === 400 || code === 403) {
        // Extract the actual error message from SendGrid
        let errorDetails = `The sender email address (${fromEmail}) may not be verified with SendGrid.`;
        if (body && body.errors && body.errors[0]) {
          errorDetails = body.errors[0].message || errorDetails;
        }
        
        return res.status(500).json({ 
          error: 'SendGrid Configuration Issue', 
          details: errorDetails,
          from: fromEmail
        });
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to send email', 
      details: error.message || 'Unknown error'
    });
  }
});

// Update loan contact info
router.patch('/loans/:loanId/contact-info', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const { phones, emails } = req.body;
    const userId = (req as any).user?.id || 1;

    console.log('Updating contact info for loan', loanId, { phones, emails });

    // Prepare update data
    const updateData: any = {};
    
    if (phones && phones.length > 0) {
      // Store ALL phones as an array in borrowerPhone field
      const validPhones = phones.filter((p: any) => p.number && p.number.trim() !== '');
      if (validPhones.length > 0) {
        // Store all phones as JSON array
        updateData.borrowerPhone = JSON.stringify(validPhones.map((p: any) => ({
          number: p.number,
          label: p.label || CRM_CONSTANTS.DEFAULT_LABELS.PHONE_PRIMARY,
          isBad: p.isBad || false
        })));
      }
      // Clear the old mobile field - we now store all phones in borrowerPhone
      updateData.borrowerMobile = null;
    }
    
    if (emails && emails.length > 0) {
      // Use utility function to format emails
      const emailObjects = emails
        .filter((e: any) => {
          const emailValue = typeof e === 'string' ? e : e.email;
          return emailValue && emailValue.trim() !== '';
        })
        .map((e: any) => ({
          email: typeof e === 'string' ? e : e.email,
          label: (typeof e === 'object' ? e.label : null) || CRM_CONSTANTS.DEFAULT_LABELS.EMAIL_PRIMARY
        }));
      
      if (emailObjects.length > 0) {
        updateData.borrowerEmail = formatEmailsForStorage(emailObjects);
      }
    }

    console.log('Update data:', updateData);

    // Update the loan
    await db.update(loans)
      .set(updateData)
      .where(eq(loans.id, loanId));

    // Log activity using the utility function
    await logActivity(loanId, userId, CRM_CONSTANTS.ACTIVITY_TYPES.CONTACT_UPDATE, {
      description: 'Updated contact information',
      changes: { 
        phones: phones || [], 
        emails: emails || []
      }
    });

    // Fetch and return the updated loan
    const [updatedLoan] = await db.select()
      .from(loans)
      .where(eq(loans.id, loanId));

    res.json(updatedLoan);
  } catch (error) {
    console.error('Error updating contact info:', error);
    res.status(500).json({ error: 'Failed to update contact information' });
  }
});

// Profile photo upload endpoint
router.post('/loans/:loanId/profile-photo', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const userId = (req as any).user?.id || 1;
    
    // For now, we'll store the photo URL in the loan record
    // In production, you'd handle actual file upload to storage
    const { photoUrl } = req.body;
    
    if (!photoUrl) {
      return res.status(400).json({ error: 'No photo URL provided' });
    }
    
    // Update loan record with photo URL
    await db
      .update(loans)
      .set({ 
        borrowerPhoto: photoUrl,
        updatedAt: new Date()
      })
      .where(eq(loans.id, loanId));
    
    // Log activity
    await logActivity(loanId, userId, CRM_CONSTANTS.ACTIVITY_TYPES.PROFILE_PHOTO, {
      description: 'Profile photo updated'
    });
    
    res.json({ success: true, photoUrl });
  } catch (error) {
    console.error('Error updating profile photo:', error);
    res.status(500).json({ error: 'Failed to update profile photo' });
  }
});

// Get profile photo endpoint
router.get('/loans/:loanId/profile-photo', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    
    const [loan] = await db
      .select({ borrowerPhoto: loans.borrowerPhoto })
      .from(loans)
      .where(eq(loans.id, loanId))
      .limit(1);
    
    if (!loan?.borrowerPhoto) {
      return res.status(404).json({ error: 'No photo found' });
    }
    
    res.json({ photoUrl: loan.borrowerPhoto });
  } catch (error) {
    console.error('Error fetching profile photo:', error);
    res.status(500).json({ error: 'Failed to fetch profile photo' });
  }
});

export default router;