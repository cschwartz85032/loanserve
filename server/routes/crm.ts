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
  loans
} from '@shared/schema';
import { eq, desc, and, or } from 'drizzle-orm';
import { z } from 'zod';
import sgMail from '@sendgrid/mail';

const router = Router();

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

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

// Send email via SendGrid
router.post('/loans/:loanId/crm/send-email', async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const userId = (req as any).user?.id || 1;
    const { to, cc, bcc, subject, content } = req.body;

    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({ error: 'Email service not configured' });
    }

    if (!process.env.SENDGRID_FROM_EMAIL) {
      return res.status(500).json({ error: 'From email address not configured' });
    }

    // Prepare email message
    const msg: any = {
      to,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject,
      text: content,
      html: content.replace(/\n/g, '<br>'), // Basic HTML conversion
    };

    // Add CC recipients if provided
    if (cc && cc.trim()) {
      msg.cc = cc.split(',').map((email: string) => email.trim());
    }

    // Add BCC recipients if provided
    if (bcc && bcc.trim()) {
      msg.bcc = bcc.split(',').map((email: string) => email.trim());
    }

    // Send email
    await sgMail.send(msg);

    // Log activity
    await logActivity(loanId, userId, 'email', {
      description: `Email sent to ${to}`,
      subject,
      to,
      cc: cc || null,
      bcc: bcc || null
    });

    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error: any) {
    console.error('Error sending email:', error);
    
    // Check for SendGrid specific errors
    if (error.response) {
      const { message, code, response } = error;
      const { body, headers } = response;
      console.error('SendGrid error details:', { code, message, body });
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
      if (phones[0] && phones[0].number) {
        // Store as JSON to preserve metadata
        updateData.borrowerPhone = JSON.stringify({
          number: phones[0].number,
          label: phones[0].label || 'Primary',
          isBad: phones[0].isBad || false
        });
      }
      // Store second phone if available
      if (phones[1] && phones[1].number) {
        updateData.borrowerMobile = JSON.stringify({
          number: phones[1].number,
          label: phones[1].label || 'Mobile',
          isBad: phones[1].isBad || false
        });
      } else {
        // Clear mobile if only one phone provided
        updateData.borrowerMobile = null;
      }
    }
    
    if (emails && emails.length > 0) {
      // Set the first email as primary
      if (emails[0] && emails[0].email) {
        updateData.borrowerEmail = emails[0].email;
      }
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

export default router;