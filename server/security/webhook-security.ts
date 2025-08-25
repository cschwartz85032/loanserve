/**
 * Webhook Security Service
 * Implements IP allowlisting and webhook signature validation
 */

import * as crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

/**
 * IP Allowlist configuration for webhook providers
 */
export const WEBHOOK_IP_ALLOWLIST = {
  // Column Banking IP ranges (example - replace with actual)
  column: [
    '54.241.31.99/32',
    '54.241.31.102/32',
    '54.241.25.90/32',
    '54.241.25.91/32',
    '54.241.34.8/32',
    '54.241.34.9/32',
  ],
  
  // Stripe webhook IPs
  stripe: [
    '3.18.12.63/32',
    '3.130.192.231/32',
    '13.235.14.237/32',
    '13.235.122.149/32',
    '18.211.135.69/32',
    '35.154.171.200/32',
    '52.15.183.38/32',
    '54.88.130.119/32',
    '54.88.130.237/32',
    '54.187.174.169/32',
    '54.187.205.235/32',
    '54.187.216.72/32',
  ],
  
  // Plaid webhook IPs (if used)
  plaid: [
    '52.21.26.131/32',
    '52.21.47.157/32',
    '52.41.247.19/32',
    '52.88.82.239/32',
  ],
  
  // SendGrid webhook IPs
  sendgrid: [
    '159.122.219.0/24',
    '169.38.79.0/24',
    '169.47.153.0/24',
    '159.122.217.0/24',
  ],
  
  // Internal/development IPs
  internal: [
    '127.0.0.1/32',
    '::1/128',
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
  ],
};

/**
 * Webhook signature configurations
 */
export const WEBHOOK_SIGNATURES = {
  column: {
    header: 'x-column-signature',
    algorithm: 'sha256',
    format: 'hex',
  },
  stripe: {
    header: 'stripe-signature',
    algorithm: 'sha256',
    format: 'hex',
  },
  plaid: {
    header: 'plaid-verification',
    algorithm: 'sha256',
    format: 'hex',
  },
  sendgrid: {
    header: 'x-twilio-email-event-webhook-signature',
    algorithm: 'sha256',
    format: 'base64',
  },
};

/**
 * IP Allowlist Service
 */
export class IPAllowlistService {
  private allowedRanges: Map<string, string[]> = new Map();
  
  constructor() {
    // Initialize IP ranges
    for (const [provider, ranges] of Object.entries(WEBHOOK_IP_ALLOWLIST)) {
      this.allowedRanges.set(provider, ranges);
    }
  }

  /**
   * Check if IP is in allowlist
   */
  isAllowed(ip: string, provider: string): boolean {
    const ranges = this.allowedRanges.get(provider);
    if (!ranges) return false;
    
    // Normalize IP
    const normalizedIp = this.normalizeIp(ip);
    
    // Check each range
    for (const range of ranges) {
      if (this.ipInRange(normalizedIp, range)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Normalize IP address (handle IPv6 mapped IPv4)
   */
  private normalizeIp(ip: string): string {
    // Remove IPv6 prefix for IPv4 addresses
    if (ip.startsWith('::ffff:')) {
      return ip.substring(7);
    }
    return ip;
  }

  /**
   * Check if IP is within CIDR range
   */
  private ipInRange(ip: string, range: string): boolean {
    const [rangeIp, cidr] = range.split('/');
    
    // Handle exact match
    if (!cidr) {
      return ip === rangeIp;
    }
    
    // Convert IPs to numbers for comparison
    const ipNum = this.ipToNumber(ip);
    const rangeNum = this.ipToNumber(rangeIp);
    const mask = (0xffffffff << (32 - parseInt(cidr, 10))) >>> 0;
    
    return (ipNum & mask) === (rangeNum & mask);
  }

  /**
   * Convert IP string to number
   */
  private ipToNumber(ip: string): number {
    const parts = ip.split('.');
    if (parts.length !== 4) return 0;
    
    return parts.reduce((acc, part, index) => {
      return acc + (parseInt(part, 10) << (8 * (3 - index)));
    }, 0) >>> 0;
  }

  /**
   * Add new IP to allowlist
   */
  addIp(provider: string, ip: string): void {
    if (!this.allowedRanges.has(provider)) {
      this.allowedRanges.set(provider, []);
    }
    
    const ranges = this.allowedRanges.get(provider)!;
    if (!ranges.includes(ip)) {
      ranges.push(ip);
    }
  }

  /**
   * Remove IP from allowlist
   */
  removeIp(provider: string, ip: string): void {
    const ranges = this.allowedRanges.get(provider);
    if (!ranges) return;
    
    const index = ranges.indexOf(ip);
    if (index > -1) {
      ranges.splice(index, 1);
    }
  }

  /**
   * Get all allowed IPs for a provider
   */
  getAllowedIps(provider: string): string[] {
    return this.allowedRanges.get(provider) || [];
  }
}

/**
 * Webhook Signature Validation
 */
export class WebhookSignatureValidator {
  /**
   * Validate Column webhook signature
   */
  validateColumnSignature(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): boolean {
    if (!secret) return false;
    
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    // Use timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Validate Stripe webhook signature
   */
  validateStripeSignature(
    payload: string,
    signature: string,
    secret: string,
    tolerance: number = 300
  ): boolean {
    const elements = signature.split(',');
    let timestamp = '';
    let signatures: string[] = [];
    
    for (const element of elements) {
      const [key, value] = element.split('=');
      if (key === 't') {
        timestamp = value;
      } else if (key === 'v1') {
        signatures.push(value);
      }
    }
    
    if (!timestamp) return false;
    
    // Check timestamp tolerance
    const currentTime = Math.floor(Date.now() / 1000);
    const signatureTime = parseInt(timestamp, 10);
    
    if (currentTime - signatureTime > tolerance) {
      return false;
    }
    
    // Generate expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');
    
    // Check if any signature matches
    return signatures.some(sig =>
      crypto.timingSafeEqual(
        Buffer.from(sig),
        Buffer.from(expectedSignature)
      )
    );
  }

  /**
   * Generic webhook signature validation
   */
  validateSignature(
    provider: string,
    payload: string | Buffer,
    signature: string,
    secret: string
  ): boolean {
    const config = WEBHOOK_SIGNATURES[provider as keyof typeof WEBHOOK_SIGNATURES];
    if (!config) return false;
    
    // Special handling for different providers
    if (provider === 'stripe') {
      return this.validateStripeSignature(
        payload.toString(),
        signature,
        secret
      );
    }
    
    if (provider === 'column') {
      return this.validateColumnSignature(payload, signature, secret);
    }
    
    // Generic HMAC validation
    const expectedSignature = crypto
      .createHmac(config.algorithm as any, secret)
      .update(payload)
      .digest(config.format as any);
    
    return crypto.timingSafeEqual(
      Buffer.from(signature, config.format as any),
      Buffer.from(expectedSignature, config.format as any)
    );
  }
}

/**
 * Webhook security middleware
 */
export function webhookSecurityMiddleware(provider: string) {
  const ipService = new IPAllowlistService();
  const signatureValidator = new WebhookSignatureValidator();
  
  return async (req: Request, res: Response, next: NextFunction) => {
    // 1. Check IP allowlist
    const clientIp = req.ip || req.socket.remoteAddress || '';
    
    if (!ipService.isAllowed(clientIp, provider)) {
      console.warn(`[WebhookSecurity] Blocked webhook from unauthorized IP: ${clientIp} for provider: ${provider}`);
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    // 2. Validate signature
    const signatureConfig = WEBHOOK_SIGNATURES[provider as keyof typeof WEBHOOK_SIGNATURES];
    if (signatureConfig) {
      const signature = req.headers[signatureConfig.header] as string;
      const secret = process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`];
      
      if (!signature || !secret) {
        console.warn(`[WebhookSecurity] Missing signature or secret for provider: ${provider}`);
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      // Get raw body for signature validation
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);
      
      if (!signatureValidator.validateSignature(provider, rawBody, signature, secret)) {
        console.warn(`[WebhookSecurity] Invalid signature for provider: ${provider}`);
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }
    
    // 3. Add security headers to response
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // 4. Log webhook receipt
    console.log(`[WebhookSecurity] Validated webhook from ${provider} at IP ${clientIp}`);
    
    next();
  };
}

/**
 * Rate limiting for webhooks
 */
export class WebhookRateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowMs = 60000; // 1 minute
  private readonly maxRequests = 100; // Per minute
  
  /**
   * Check if request should be rate limited
   */
  shouldLimit(key: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    
    // Remove old timestamps
    const validTimestamps = timestamps.filter(
      timestamp => now - timestamp < this.windowMs
    );
    
    // Check if limit exceeded
    if (validTimestamps.length >= this.maxRequests) {
      return true;
    }
    
    // Add current timestamp
    validTimestamps.push(now);
    this.requests.set(key, validTimestamps);
    
    return false;
  }
  
  /**
   * Clean up old entries
   */
  cleanup(): void {
    const now = Date.now();
    
    for (const [key, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter(
        timestamp => now - timestamp < this.windowMs
      );
      
      if (validTimestamps.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validTimestamps);
      }
    }
  }
}

// Export singleton instances
export const ipAllowlistService = new IPAllowlistService();
export const webhookSignatureValidator = new WebhookSignatureValidator();
export const webhookRateLimiter = new WebhookRateLimiter();

// Clean up rate limiter periodically
setInterval(() => {
  webhookRateLimiter.cleanup();
}, 60000);