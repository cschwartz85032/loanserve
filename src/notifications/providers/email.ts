// Email notification provider
// Supports SMTP (SendGrid, SES, etc.) with fallback handling

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export interface EmailResult { 
  ok: boolean; 
  providerId?: string; 
  error?: string; 
}

let cachedTransporter: Transporter | null = null;

/**
 * Get or create SMTP transporter
 */
function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  const smtpConfig = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || "587"),
    secure: false, // Use TLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  };

  if (!smtpConfig.host || !smtpConfig.auth.user || !smtpConfig.auth.pass) {
    throw new Error("SMTP configuration incomplete. Check SMTP_HOST, SMTP_USER, SMTP_PASS");
  }

  cachedTransporter = nodemailer.createTransport(smtpConfig);
  return cachedTransporter;
}

/**
 * Send email notification
 * @param to Recipient email address
 * @param subject Email subject
 * @param htmlOrText Email content (supports both HTML and plain text)
 * @returns Email delivery result
 */
export async function sendEmail(to: string, subject: string, htmlOrText: string): Promise<EmailResult> {
  try {
    const transport = getTransporter();
    const from = `"${process.env.NOTIFY_FROM_NAME || 'LoanServe'}" <${process.env.NOTIFY_FROM_EMAIL}>`;
    
    if (!process.env.NOTIFY_FROM_EMAIL) {
      return { ok: false, error: "NOTIFY_FROM_EMAIL not configured" };
    }

    const mailOptions = {
      from,
      to,
      subject,
      text: htmlOrText,
      html: convertToHtml(htmlOrText)
    };

    console.log(`[EmailProvider] Sending email to ${to}: ${subject}`);
    const info = await transport.sendMail(mailOptions);
    
    console.log(`[EmailProvider] Email sent successfully. MessageId: ${info.messageId}`);
    return { 
      ok: true, 
      providerId: info.messageId 
    };
  } catch (error: any) {
    console.error(`[EmailProvider] Email send failed:`, error);
    return { 
      ok: false, 
      error: `Email send failed: ${error.message}` 
    };
  }
}

/**
 * Convert plain text to HTML by replacing newlines with <br> tags
 */
function convertToHtml(text: string): string {
  return text.replace(/\n/g, "<br/>");
}

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}