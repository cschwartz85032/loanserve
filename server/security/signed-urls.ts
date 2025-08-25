/**
 * Signed URL Service for Secure Artifact Access
 * Implements time-limited, signed URLs for documents and files
 */

import * as crypto from 'crypto';
import { URL } from 'url';

export interface SignedUrlOptions {
  expiresIn?: number; // Seconds (default: 300 = 5 minutes)
  ipRestriction?: string; // Restrict to specific IP
  userId?: string; // User who requested the URL
  metadata?: Record<string, string>; // Additional metadata
  maxDownloads?: number; // Maximum download count
}

export interface SignedUrlPayload {
  path: string;
  expires: number;
  signature: string;
  ip?: string;
  userId?: string;
  downloadCount?: number;
  maxDownloads?: number;
  metadata?: Record<string, string>;
}

/**
 * Service for generating and validating signed URLs
 */
export class SignedUrlService {
  private readonly secret: string;
  private readonly baseUrl: string;
  private readonly defaultExpiry = 300; // 5 minutes
  private readonly maxExpiry = 3600; // 1 hour
  
  // Track download counts in memory (use Redis in production)
  private downloadCounts = new Map<string, number>();

  constructor() {
    this.secret = process.env.SIGNED_URL_SECRET || '';
    this.baseUrl = process.env.APP_BASE_URL || 'http://localhost:5000';
    
    if (!this.secret) {
      throw new Error('SIGNED_URL_SECRET not configured');
    }
  }

  /**
   * Generate a signed URL for an artifact
   */
  generateSignedUrl(
    resourcePath: string,
    options: SignedUrlOptions = {}
  ): string {
    const {
      expiresIn = this.defaultExpiry,
      ipRestriction,
      userId,
      metadata = {},
      maxDownloads,
    } = options;

    // Validate expiry time
    const validExpiry = Math.min(expiresIn, this.maxExpiry);
    const expires = Math.floor(Date.now() / 1000) + validExpiry;

    // Create payload
    const payload: any = {
      path: resourcePath,
      expires,
      ip: ipRestriction,
      userId,
      metadata,
      maxDownloads,
    };

    // Generate signature
    const signature = this.generateSignature(payload);

    // Build URL with query parameters
    const url = new URL(`${this.baseUrl}/api/artifacts/signed`);
    url.searchParams.set('path', resourcePath);
    url.searchParams.set('expires', expires.toString());
    url.searchParams.set('signature', signature);
    
    if (ipRestriction) {
      url.searchParams.set('ip', ipRestriction);
    }
    
    if (userId) {
      url.searchParams.set('userId', userId);
    }
    
    if (maxDownloads) {
      url.searchParams.set('maxDownloads', maxDownloads.toString());
    }
    
    if (Object.keys(metadata).length > 0) {
      url.searchParams.set('metadata', Buffer.from(JSON.stringify(metadata)).toString('base64'));
    }

    return url.toString();
  }

  /**
   * Validate a signed URL
   */
  validateSignedUrl(
    path: string,
    signature: string,
    expires: number,
    clientIp?: string,
    userId?: string,
    maxDownloads?: number
  ): { valid: boolean; reason?: string } {
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (now > expires) {
      return { valid: false, reason: 'URL has expired' };
    }

    // Verify signature
    const payload: any = { path, expires };
    if (clientIp) payload.ip = clientIp;
    if (userId) payload.userId = userId;
    if (maxDownloads) payload.maxDownloads = maxDownloads;

    const expectedSignature = this.generateSignature(payload);
    if (signature !== expectedSignature) {
      return { valid: false, reason: 'Invalid signature' };
    }

    // Check download count if limited
    if (maxDownloads) {
      const downloadKey = `${path}:${signature}`;
      const currentCount = this.downloadCounts.get(downloadKey) || 0;
      
      if (currentCount >= maxDownloads) {
        return { valid: false, reason: 'Download limit exceeded' };
      }
      
      // Increment count
      this.downloadCounts.set(downloadKey, currentCount + 1);
    }

    return { valid: true };
  }

  /**
   * Generate HMAC signature for payload
   */
  private generateSignature(payload: any): string {
    const message = this.createSigningMessage(payload);
    return crypto
      .createHmac('sha256', this.secret)
      .update(message)
      .digest('hex');
  }

  /**
   * Create consistent message for signing
   */
  private createSigningMessage(payload: any): string {
    const parts = [
      payload.path,
      payload.expires,
      payload.ip || '',
      payload.userId || '',
      payload.maxDownloads || '',
      JSON.stringify(payload.metadata || {}),
    ];
    
    return parts.join(':');
  }

  /**
   * Generate pre-signed URL for document upload
   */
  generateUploadUrl(
    destinationPath: string,
    contentType: string,
    maxSizeBytes: number,
    expiresIn: number = 900 // 15 minutes
  ): {
    uploadUrl: string;
    fields: Record<string, string>;
  } {
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    const uploadId = crypto.randomBytes(16).toString('hex');
    
    const policy = {
      destinationPath,
      contentType,
      maxSizeBytes,
      expires,
      uploadId,
    };
    
    const signature = this.generateSignature(policy);
    
    return {
      uploadUrl: `${this.baseUrl}/api/artifacts/upload`,
      fields: {
        path: destinationPath,
        contentType,
        maxSize: maxSizeBytes.toString(),
        expires: expires.toString(),
        uploadId,
        signature,
      },
    };
  }

  /**
   * Clean up expired download counts
   */
  cleanupExpiredCounts(): void {
    // In production, this would be handled by Redis TTL
    // For now, clear counts older than 1 hour
    this.downloadCounts.clear();
  }
}

/**
 * Document access control with signed URLs
 */
export class DocumentAccessControl {
  private signedUrlService: SignedUrlService;
  
  constructor() {
    this.signedUrlService = new SignedUrlService();
  }

  /**
   * Generate secure document URL based on permissions
   */
  async generateDocumentUrl(
    documentId: string,
    userId: string,
    userRole: string,
    clientIp?: string
  ): Promise<string | null> {
    // Check document permissions (simplified)
    const hasAccess = await this.checkDocumentAccess(documentId, userId, userRole);
    if (!hasAccess) {
      return null;
    }

    // Generate time-limited URL
    const options: SignedUrlOptions = {
      expiresIn: this.getExpiryByRole(userRole),
      ipRestriction: clientIp,
      userId,
      metadata: {
        documentId,
        role: userRole,
        generatedAt: new Date().toISOString(),
      },
      maxDownloads: this.getDownloadLimitByRole(userRole),
    };

    return this.signedUrlService.generateSignedUrl(
      `/documents/${documentId}`,
      options
    );
  }

  /**
   * Check if user has access to document
   */
  private async checkDocumentAccess(
    documentId: string,
    userId: string,
    userRole: string
  ): Promise<boolean> {
    // Implementation would check database for:
    // - Document ownership
    // - Loan association
    // - Role-based permissions
    
    // Simplified logic
    if (userRole === 'admin') return true;
    if (userRole === 'lender') return true;
    if (userRole === 'borrower') {
      // Check if borrower owns the loan associated with document
      return true; // Simplified
    }
    
    return false;
  }

  /**
   * Get URL expiry time based on role
   */
  private getExpiryByRole(role: string): number {
    const expiryTimes: Record<string, number> = {
      admin: 3600,      // 1 hour
      lender: 1800,     // 30 minutes
      servicer: 1800,   // 30 minutes
      borrower: 600,    // 10 minutes
      investor: 900,    // 15 minutes
      escrow_officer: 1200, // 20 minutes
      legal: 1800,      // 30 minutes
      default: 300,     // 5 minutes
    };
    
    return expiryTimes[role] || expiryTimes.default;
  }

  /**
   * Get download limit based on role
   */
  private getDownloadLimitByRole(role: string): number {
    const downloadLimits: Record<string, number> = {
      admin: 0,         // Unlimited
      lender: 10,       // 10 downloads
      servicer: 10,     // 10 downloads
      borrower: 3,      // 3 downloads
      investor: 5,      // 5 downloads
      escrow_officer: 5, // 5 downloads
      legal: 10,        // 10 downloads
      default: 1,       // 1 download
    };
    
    return downloadLimits[role] || downloadLimits.default;
  }
}

/**
 * Middleware for validating signed URLs
 */
export async function validateSignedUrlMiddleware(
  req: any,
  res: any,
  next: any
): Promise<void> {
  const { path, expires, signature, ip, userId, maxDownloads } = req.query;
  
  if (!path || !expires || !signature) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  
  const signedUrlService = new SignedUrlService();
  const clientIp = req.ip || req.connection.remoteAddress;
  
  // Validate IP restriction if specified
  if (ip && ip !== clientIp) {
    return res.status(403).json({ error: 'IP address mismatch' });
  }
  
  // Validate signed URL
  const validation = signedUrlService.validateSignedUrl(
    path,
    signature,
    parseInt(expires, 10),
    ip,
    userId,
    maxDownloads ? parseInt(maxDownloads, 10) : undefined
  );
  
  if (!validation.valid) {
    return res.status(403).json({ error: validation.reason });
  }
  
  // Attach validated path to request
  req.validatedPath = path;
  req.signedUrlUserId = userId;
  
  next();
}

/**
 * Generate signed URL configuration
 */
export function generateSignedUrlConfig(): {
  secret: string;
  recommendations: string[];
} {
  const secret = crypto.randomBytes(64).toString('base64');
  
  return {
    secret,
    recommendations: [
      'Store SIGNED_URL_SECRET in secure environment variables',
      'Use Redis for download count tracking in production',
      'Implement rate limiting for URL generation',
      'Log all signed URL generation and validation events',
      'Rotate signing secrets every 90 days',
      'Use CloudFront or CDN for actual file serving',
      'Implement IP-based restrictions for sensitive documents',
    ],
  };
}

// Export singleton instances
export const signedUrlService = new SignedUrlService();
export const documentAccessControl = new DocumentAccessControl();