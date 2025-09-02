// SMS notification provider using Twilio
// Handles SMS delivery with proper error handling and validation

import twilio from "twilio";

export interface SmsResult { 
  ok: boolean; 
  sid?: string; 
  error?: string; 
}

let twilioClient: twilio.Twilio | null = null;

/**
 * Get or create Twilio client
 */
function getTwilioClient(): twilio.Twilio {
  if (twilioClient) return twilioClient;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN");
  }

  twilioClient = twilio(accountSid, authToken);
  return twilioClient;
}

/**
 * Send SMS notification
 * @param to Recipient phone number (E.164 format recommended)
 * @param body SMS message content
 * @returns SMS delivery result
 */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  try {
    const client = getTwilioClient();
    const from = process.env.NOTIFY_SMS_FROM;

    if (!from) {
      return { ok: false, error: "NOTIFY_SMS_FROM not configured" };
    }

    // Validate phone number format
    if (!isValidPhoneNumber(to)) {
      return { ok: false, error: `Invalid phone number format: ${to}` };
    }

    // Validate message length (SMS limit is 160 characters for single message)
    if (body.length > 1600) { // Allow up to 10 segments
      return { ok: false, error: "SMS message too long (max 1600 characters)" };
    }

    console.log(`[SmsProvider] Sending SMS to ${to}`);
    const message = await client.messages.create({
      from,
      to,
      body
    });

    console.log(`[SmsProvider] SMS sent successfully. SID: ${message.sid}`);
    return { 
      ok: true, 
      sid: message.sid 
    };
  } catch (error: any) {
    console.error(`[SmsProvider] SMS send failed:`, error);
    return { 
      ok: false, 
      error: `SMS send failed: ${error.message}` 
    };
  }
}

/**
 * Validate phone number format
 * Accepts various formats and normalizes to E.164
 */
function isValidPhoneNumber(phone: string): boolean {
  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // Check if it looks like a valid phone number
  // Should start with + and have 10-15 digits
  const phoneRegex = /^\+?[1-9]\d{9,14}$/;
  return phoneRegex.test(cleaned);
}

/**
 * Normalize phone number to E.164 format
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Add + prefix if missing and doesn't start with +
  if (!cleaned.startsWith('+')) {
    // Assume US number if no country code
    if (cleaned.length === 10) {
      cleaned = '+1' + cleaned;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      cleaned = '+' + cleaned;
    } else {
      cleaned = '+' + cleaned;
    }
  }
  
  return cleaned;
}