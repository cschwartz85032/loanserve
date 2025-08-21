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

const router = Router();

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit per file
  }
});

// Helper function to log activity
async function logActivity(
  loanId: number,
  userId: number,
  activityType: string,
  activityData: any,
  relatedId?: number
) {
  await db.insert(crmActivity).values({
    loanId,
    userId,
    activityType,
    activityData,
    relatedId,
    isSystem: false
  });
}

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
    await logActivity(loanId, userId, 'note', {
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
    await logActivity(loanId, userId, 'appointment', {
      description: `Scheduled appointment: ${title}`
    }, appointment.id);
    
    res.json(appointment);
  } catch (error) {
    console.error('Error creating CRM appointment:', error);
    res.status(500).json({ error: 'Failed to create appointment' });
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
    await logActivity(loanId, userId, 'call', {
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
    
    // Process document IDs if provided
    if (documentIds) {
      const docIdArray = typeof documentIds === 'string' ? JSON.parse(documentIds) : documentIds;
      if (Array.isArray(docIdArray) && docIdArray.length > 0) {
        // Fetch documents from database
        const docs = await db
          .select()
          .from(documents)
          .where(or(...docIdArray.map((id: number) => eq(documents.id, id))));
        
        // Add documents as attachments
        for (const doc of docs) {
          if (doc.filePath && fs.existsSync(doc.filePath)) {
            const fileContent = fs.readFileSync(doc.filePath);
            attachments.push({
              content: fileContent.toString('base64'),
              filename: doc.name || doc.fileName || 'document',
              type: doc.mimeType || 'application/octet-stream',
              disposition: 'attachment'
            });
          }
        }
      }
    }
    
    // Process uploaded files
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        attachments.push({
          content: file.buffer.toString('base64'),
          filename: file.originalname,
          type: file.mimetype,
          disposition: 'attachment'
        });
      }
    }
    
    // Add attachments to email if any
    if (attachments.length > 0) {
      msg.attachments = attachments;
    }

    // Send email
    await sgMail.send(msg);

    // Log activity with attachment info
    await logActivity(loanId, userId, 'email', {
      description: `Email sent to ${to}`,
      subject,
      to,
      cc: cc || null,
      bcc: bcc || null,
      attachmentCount: attachments.length
    });

    res.json({ success: true, message: 'Email sent successfully', attachmentCount: attachments.length });
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
      // Store phone data as JSON string to preserve labels and isBad status
      if (phones[0]) {
        // Extract the actual phone number if it's nested
        let phoneNumber = phones[0].number;
        // Check if the number is actually a stringified JSON object
        if (phoneNumber && phoneNumber.startsWith('{')) {
          try {
            const parsed = JSON.parse(phoneNumber);
            phoneNumber = parsed.number || phoneNumber;
          } catch {
            // Keep as is if not valid JSON
          }
        }
        
        if (phoneNumber) {
          // Store as JSON to preserve metadata
          updateData.borrowerPhone = JSON.stringify({
            number: phoneNumber,
            label: phones[0].label || 'Primary',
            isBad: phones[0].isBad || false
          });
        }
      }
      // Store second phone if available
      if (phones[1]) {
        let phoneNumber = phones[1].number;
        // Check if the number is actually a stringified JSON object
        if (phoneNumber && phoneNumber.startsWith('{')) {
          try {
            const parsed = JSON.parse(phoneNumber);
            phoneNumber = parsed.number || phoneNumber;
          } catch {
            // Keep as is if not valid JSON
          }
        }
        
        if (phoneNumber) {
          updateData.borrowerMobile = JSON.stringify({
            number: phoneNumber,
            label: phones[1].label || 'Mobile',
            isBad: phones[1].isBad || false
          });
        }
      } else {
        // Clear mobile if only one phone provided
        updateData.borrowerMobile = null;
      }
    }
    
    if (emails && emails.length > 0) {
      // Store all emails as JSON to preserve multiple addresses and labels
      updateData.borrowerEmail = JSON.stringify(emails.map((e: any) => ({
        email: e.email,
        label: e.label || 'Primary'
      })));
    }

    console.log('Update data:', updateData);

    // Update the loan
    await db.update(loans)
      .set(updateData)
      .where(eq(loans.id, loanId));

    // Log activity
    await logActivity(loanId, userId, 'contact_update', {
      description: 'Updated contact information',
      changes: { phones, emails }
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
    await logActivity(loanId, userId, 'profile_photo', {
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