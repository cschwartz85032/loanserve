/**
 * Check for overdue CRM tasks and send notifications
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { CRMNotificationService } from './notification-service';
import { CRM_CONSTANTS } from '../utils/crm-utils';

const notificationService = new CRMNotificationService();

export async function checkOverdueTasks(): Promise<void> {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Find all overdue tasks that haven't been notified today
    const overdueTasksResult = await db.execute(sql`
      SELECT 
        t.id,
        t.title,
        t.description,
        t.loan_id,
        t.assigned_to,
        t.due_date,
        u.email as assignee_email,
        u.username as assignee_name,
        l.loan_number,
        EXTRACT(DAY FROM (NOW() - t.due_date::timestamp)) as days_overdue
      FROM crm_tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN loans l ON t.loan_id = l.id
      WHERE t.status = 'pending'
        AND t.due_date < NOW()
        AND t.assigned_to IS NOT NULL
        AND (
          NOT EXISTS (
            SELECT 1 FROM crm_activity a 
            WHERE a.related_id = t.id
              AND a.activity_type = 'overdue_notification'
              AND a.created_at > ${yesterday}
          )
        )
    `);

    console.log(`[CRM] Found ${overdueTasksResult.rows.length} overdue tasks to notify`);

    for (const task of overdueTasksResult.rows) {
      try {
        // Send overdue notification
        const notificationResult = await notificationService.sendNotification({
          type: 'task_overdue',
          loanId: task.loan_id as number,
          recipientEmail: task.assignee_email as string,
          recipientName: task.assignee_name as string,
          data: {
            task: {
              title: task.title,
              description: task.description || 'No description'
            },
            daysOverdue: task.days_overdue,
            originalDueDate: new Date(task.due_date as string).toISOString().split('T')[0],
            loanNumber: task.loan_number
          }
        });

        if (notificationResult.success) {
          // Log that we sent the notification
          await db.execute(sql`
            INSERT INTO crm_activity (
              loan_id, 
              user_id, 
              activity_type, 
              activity_data, 
              related_id
            )
            VALUES (
              ${task.loan_id},
              ${task.assigned_to},
              'overdue_notification',
              ${JSON.stringify({
                description: `Overdue notification sent for task: ${task.title}`,
                daysOverdue: task.days_overdue,
                documentId: notificationResult.docId
              })},
              ${task.id}
            )
          `);

          console.log(`[CRM] Sent overdue notification for task ${task.id} to ${task.assignee_email}`);
        }
      } catch (error) {
        console.error(`[CRM] Failed to send overdue notification for task ${task.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[CRM] Error checking overdue tasks:', error);
  }
}

// Schedule appointment reminders (24 hours before)
export async function scheduleAppointmentReminders(): Promise<void> {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    // Find appointments happening tomorrow that haven't been reminded
    const appointmentsResult = await db.execute(sql`
      SELECT 
        a.id,
        a.title,
        a.description,
        a.location,
        a.start_time,
        a.end_time,
        a.loan_id,
        a.attendees,
        l.loan_number
      FROM crm_appointments a
      LEFT JOIN loans l ON a.loan_id = l.id
      WHERE a.start_time >= ${tomorrow}
        AND a.start_time < ${dayAfter}
        AND NOT EXISTS (
          SELECT 1 FROM crm_activity act 
          WHERE act.related_id = a.id
            AND act.activity_type = 'appointment_reminder'
        )
    `);

    console.log(`[CRM] Found ${appointmentsResult.rows.length} appointments to remind`);

    for (const appointment of appointmentsResult.rows) {
      try {
        const attendees = (appointment.attendees as string[]) || [];
        
        // Get emails for all attendees
        if (attendees.length > 0) {
          const usersResult = await db.execute(sql`
            SELECT id, email, username 
            FROM users 
            WHERE id = ANY(${attendees.map(Number)})
          `);

          for (const user of usersResult.rows) {
            // Schedule reminder for tomorrow morning (9 AM)
            const reminderTime = new Date(tomorrow);
            reminderTime.setHours(9, 0, 0, 0);

            const notificationResult = await notificationService.sendNotification({
              type: 'appointment_reminder',
              loanId: appointment.loan_id as number,
              recipientEmail: user.email as string,
              recipientName: user.username as string,
              data: {
                appointment: {
                  title: appointment.title,
                  description: appointment.description || 'No description'
                },
                location: appointment.location || 'TBD',
                startTime: new Date(appointment.start_time as string).toLocaleString(),
                endTime: appointment.end_time ? new Date(appointment.end_time as string).toLocaleString() : null,
                loanNumber: appointment.loan_number
              },
              scheduleFor: reminderTime
            });

            if (notificationResult.success) {
              // Log that we scheduled the reminder
              await db.execute(sql`
                INSERT INTO crm_activity (
                  loan_id, 
                  user_id, 
                  activity_type, 
                  activity_data, 
                  related_id
                )
                VALUES (
                  ${appointment.loan_id},
                  ${user.id},
                  'appointment_reminder',
                  ${JSON.stringify({
                    description: `Reminder scheduled for appointment: ${appointment.title}`,
                    scheduledFor: reminderTime.toISOString(),
                    noticeId: notificationResult.noticeId
                  })},
                  ${appointment.id}
                )
              `);

              console.log(`[CRM] Scheduled appointment reminder for ${user.email}`);
            }
          }
        }
      } catch (error) {
        console.error(`[CRM] Failed to schedule reminder for appointment ${appointment.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[CRM] Error scheduling appointment reminders:', error);
  }
}

// Run both checks
export async function runCRMNotificationChecks(): Promise<void> {
  console.log('[CRM] Running notification checks...');
  
  await Promise.all([
    checkOverdueTasks(),
    scheduleAppointmentReminders()
  ]);
  
  console.log('[CRM] Notification checks complete');
}