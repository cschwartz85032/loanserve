// Webhook notification provider
// Sends JSON payloads with HMAC signature verification

import { createHmac } from "crypto";

export interface WebhookResult { 
  ok: boolean; 
  status?: number; 
  error?: string; 
}

/**
 * Send webhook notification
 * @param url Target webhook URL
 * @param payload JSON payload to send
 * @param secret Optional HMAC secret for signature
 * @returns Webhook delivery result
 */
export async function sendWebhook(url: string, payload: any, secret?: string): Promise<WebhookResult> {
  try {
    // Validate URL format
    if (!isValidUrl(url)) {
      return { ok: false, error: `Invalid webhook URL: ${url}` };
    }

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "LoanServe-Notifications/1.0"
    };

    // Add HMAC signature if secret provided
    if (secret) {
      const signature = generateHmacSignature(body, secret);
      headers["X-LoanServe-Notify-Signature"] = signature;
    }

    const timeoutMs = Number(process.env.NOTIFY_WEBHOOK_TIMEOUT_MS || "10000");
    
    console.log(`[WebhookProvider] Sending webhook to ${url}`);
    
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[WebhookProvider] Webhook failed: ${response.status} ${errorText}`);
      return { 
        ok: false, 
        status: response.status, 
        error: `Webhook failed: ${response.status} ${errorText}` 
      };
    }

    console.log(`[WebhookProvider] Webhook sent successfully: ${response.status}`);
    return { 
      ok: true, 
      status: response.status 
    };
  } catch (error: any) {
    console.error(`[WebhookProvider] Webhook send failed:`, error);
    
    if (error.name === 'AbortError') {
      return { ok: false, error: "Webhook timeout" };
    }
    
    return { 
      ok: false, 
      error: `Webhook send failed: ${error.message}` 
    };
  }
}

/**
 * Generate HMAC SHA-256 signature for webhook payload
 */
function generateHmacSignature(body: string, secret: string): string {
  if (!secret) return "";
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Verify HMAC signature for incoming webhook
 */
export function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  if (!secret || !signature) return false;
  
  const expectedSignature = generateHmacSignature(body, secret);
  return signature === expectedSignature;
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Create standard webhook payload for loan notifications
 */
export function createLoanWebhookPayload(
  tenantId: string,
  loanId: string,
  templateCode: string,
  event: string,
  data: any
) {
  return {
    tenant_id: tenantId,
    loan_id: loanId,
    template_code: templateCode,
    event,
    timestamp: new Date().toISOString(),
    data
  };
}