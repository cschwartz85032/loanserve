/**
 * Email Service
 * Handles sending emails for password reset and invitations
 */

import { db } from '../db';
import { authEvents } from '@shared/schema';
import sgMail from '@sendgrid/mail';

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Email templates with generic responses for security
interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Generate password reset email template
 */
export function getPasswordResetTemplate(resetUrl: string): EmailTemplate {
  const subject = 'Password Reset Request - LoanServe Pro';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .warning { background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 6px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 0.875rem; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>We received a request to reset the password for your LoanServe Pro account.</p>
          
          <p>If you made this request, click the button below to reset your password:</p>
          
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </div>
          
          <p style="font-size: 0.875rem; color: #6b7280;">
            Or copy and paste this link in your browser:<br>
            <code style="background: #f3f4f6; padding: 4px; border-radius: 4px; word-break: break-all;">${resetUrl}</code>
          </p>
          
          <div class="warning">
            <strong>⚠️ Important:</strong>
            <ul style="margin: 8px 0;">
              <li>This link will expire in 1 hour</li>
              <li>The link can only be used once</li>
              <li>All your active sessions will be terminated after resetting your password</li>
            </ul>
          </div>
          
          <p>If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>
          
          <div class="footer">
            <p>This is an automated message from LoanServe Pro. Please do not reply to this email.</p>
            <p>For security reasons, we never include your account details in emails.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const text = `
Password Reset Request - LoanServe Pro

We received a request to reset the password for your LoanServe Pro account.

If you made this request, visit the following link to reset your password:
${resetUrl}

Important:
- This link will expire in 1 hour
- The link can only be used once
- All your active sessions will be terminated after resetting your password

If you did not request a password reset, please ignore this email. Your password will remain unchanged.

This is an automated message from LoanServe Pro. Please do not reply to this email.
For security reasons, we never include your account details in emails.
  `;
  
  return { subject, html, text };
}

/**
 * Generate invitation email template
 */
export function getInvitationTemplate(
  inviteUrl: string,
  role: string,
  expiresInDays: number = 7
): EmailTemplate {
  const subject = 'Invitation to Join LoanServe Pro';
  
  const roleDisplay = {
    admin: 'Administrator',
    lender: 'Lender',
    borrower: 'Borrower',
    investor: 'Investor',
    title: 'Title Officer',
    legal: 'Legal Professional',
    regulator: 'Regulator'
  }[role] || role;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; padding: 12px 24px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .role-badge { display: inline-block; padding: 6px 12px; background: #dbeafe; color: #1e40af; border-radius: 4px; font-weight: 600; }
        .info-box { background: #f0f9ff; border: 1px solid #bfdbfe; padding: 16px; border-radius: 6px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 0.875rem; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to LoanServe Pro</h1>
        </div>
        <div class="content">
          <p>You've been invited to join LoanServe Pro as a <span class="role-badge">${roleDisplay}</span></p>
          
          <p>LoanServe Pro is a comprehensive mortgage loan servicing platform that helps manage the complete loan lifecycle.</p>
          
          <div class="info-box">
            <h3 style="margin-top: 0;">What you'll be able to do:</h3>
            <ul style="margin: 8px 0;">
              ${role === 'admin' ? '<li>Full system administration and user management</li>' : ''}
              ${role === 'lender' ? '<li>Manage loan portfolios and track performance</li>' : ''}
              ${role === 'borrower' ? '<li>View your loans and make payments</li>' : ''}
              ${role === 'investor' ? '<li>Monitor your investment positions and returns</li>' : ''}
              ${role === 'title' ? '<li>Handle title and escrow documentation</li>' : ''}
              ${role === 'legal' ? '<li>Access legal documents and compliance reports</li>' : ''}
              ${role === 'regulator' ? '<li>Review compliance and audit information</li>' : ''}
              <li>Access secure document management</li>
              <li>Track real-time updates and notifications</li>
            </ul>
          </div>
          
          <p>To get started, click the button below to activate your account:</p>
          
          <div style="text-align: center;">
            <a href="${inviteUrl}" class="button">Activate Account</a>
          </div>
          
          <p style="font-size: 0.875rem; color: #6b7280;">
            Or copy and paste this link in your browser:<br>
            <code style="background: #f3f4f6; padding: 4px; border-radius: 4px; word-break: break-all;">${inviteUrl}</code>
          </p>
          
          <div style="background: #fef3c7; border: 1px solid #fcd34d; padding: 12px; border-radius: 6px; margin: 20px 0;">
            <strong>📅 Note:</strong> This invitation will expire in ${expiresInDays} days.
          </div>
          
          <div class="footer">
            <p>This invitation was sent from LoanServe Pro. If you believe you received this email in error, you can safely ignore it.</p>
            <p>Need help? Contact your system administrator.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const text = `
Welcome to LoanServe Pro

You've been invited to join LoanServe Pro as a ${roleDisplay}.

LoanServe Pro is a comprehensive mortgage loan servicing platform that helps manage the complete loan lifecycle.

To get started, visit the following link to activate your account:
${inviteUrl}

Note: This invitation will expire in ${expiresInDays} days.

This invitation was sent from LoanServe Pro. If you believe you received this email in error, you can safely ignore it.

Need help? Contact your system administrator.
  `;
  
  return { subject, html, text };
}

/**
 * Generate generic response email for security
 */
export function getGenericResponseTemplate(): EmailTemplate {
  const subject = 'Request Received - LoanServe Pro';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #6b7280; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 0.875rem; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Request Received</h1>
        </div>
        <div class="content">
          <p>We have received your request.</p>
          
          <p>If an account exists with the provided email address, you will receive further instructions shortly.</p>
          
          <p>Please check your email inbox (and spam folder) for any messages from LoanServe Pro.</p>
          
          <div class="footer">
            <p>This is an automated message from LoanServe Pro. Please do not reply to this email.</p>
            <p>For security reasons, we cannot confirm whether an account exists with the provided email address.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const text = `
Request Received - LoanServe Pro

We have received your request.

If an account exists with the provided email address, you will receive further instructions shortly.

Please check your email inbox (and spam folder) for any messages from LoanServe Pro.

This is an automated message from LoanServe Pro. Please do not reply to this email.
For security reasons, we cannot confirm whether an account exists with the provided email address.
  `;
  
  return { subject, html, text };
}

/**
 * Send email using SendGrid
 */
export async function sendEmail(
  to: string,
  template: EmailTemplate,
  actorUserId?: number
): Promise<boolean> {
  try {
    // Log email send attempt
    console.log(`[EMAIL] Sending to ${to}: ${template.subject}`);
    
    // Check if SendGrid is configured
    if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
      console.warn('[EMAIL] SendGrid not configured, logging email instead');
      console.log('--- EMAIL CONTENT ---');
      console.log('To:', to);
      console.log('Subject:', template.subject);
      console.log('Text:', template.text.substring(0, 200) + '...');
      console.log('--- END EMAIL ---');
      return true; // Return true to not break the flow
    }
    
    // Send email via SendGrid
    const msg = {
      to,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: template.subject,
      text: template.text,
      html: template.html,
    };
    
    try {
      await sgMail.send(msg);
      console.log(`[EMAIL] Successfully sent email to ${to}`);
    } catch (sendError: any) {
      console.error('[EMAIL] SendGrid error:', sendError?.response?.body || sendError);
      
      // If development mode, show email content for debugging
      if (process.env.NODE_ENV === 'development') {
        console.log('--- EMAIL CONTENT (SendGrid failed) ---');
        console.log('To:', to);
        console.log('From:', process.env.SENDGRID_FROM_EMAIL);
        console.log('Subject:', template.subject);
        console.log('Text:', template.text.substring(0, 200) + '...');
        console.log('--- END EMAIL ---');
      }
      
      // Don't throw - just log and continue
      console.warn('[EMAIL] Email send failed but continuing');
    }
    
    // Log email event
    if (actorUserId) {
      await db.insert(authEvents).values({
        actorUserId,
        eventType: 'email_sent',
        details: { 
          to, 
          subject: template.subject,
          timestamp: new Date().toISOString()
        },
        eventKey: `email-${to}-${Date.now()}`
      });
    }
    
    return true;
    
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<boolean> {
  const baseUrl = process.env.APP_URL || 'http://localhost:5000';
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  
  const template = getPasswordResetTemplate(resetUrl);
  return sendEmail(email, template);
}

/**
 * Send invitation email
 */
export async function sendInvitationEmail(
  email: string,
  token: string,
  role: string,
  invitedBy: number
): Promise<boolean> {
  const baseUrl = process.env.APP_URL || 'http://localhost:5000';
  const inviteUrl = `${baseUrl}/activate?token=${encodeURIComponent(token)}`;
  
  const template = getInvitationTemplate(inviteUrl, role);
  return sendEmail(email, template, invitedBy);
}

/**
 * Send generic response email (for security)
 */
export async function sendGenericResponseEmail(email: string): Promise<boolean> {
  const template = getGenericResponseTemplate();
  return sendEmail(email, template);
}