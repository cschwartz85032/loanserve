/**
 * File Security Utilities
 * Implements filename sanitization and password-protected PDF detection
 * for Issue #3: Secure Upload Handling (Architect Review)
 */

import path from 'path';
import crypto from 'crypto';

/**
 * Sanitize filename to prevent path traversal and malicious content
 */
export function sanitizeFilename(originalName: string): string {
  if (!originalName || typeof originalName !== 'string') {
    throw new Error('Invalid filename provided');
  }

  // Remove any path separators and potentially dangerous characters
  let sanitized = originalName
    .replace(/[<>:"|?*\x00-\x1F]/g, '') // Remove invalid Windows chars
    .replace(/\.{2,}/g, '.') // Replace multiple dots with single dot
    .replace(/^\.+|\.+$/g, '') // Remove leading/trailing dots
    .replace(/[/\\]/g, '') // Remove path separators
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .trim();

  // Handle special Windows reserved names
  const windowsReserved = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ];

  const nameWithoutExt = path.parse(sanitized).name.toUpperCase();
  if (windowsReserved.includes(nameWithoutExt)) {
    sanitized = `file_${sanitized}`;
  }

  // Ensure filename isn't empty after sanitization
  if (!sanitized || sanitized.length === 0) {
    sanitized = 'uploaded_file';
  }

  // Limit filename length (keeping extension)
  const ext = path.extname(sanitized);
  const baseName = path.basename(sanitized, ext);
  
  if (baseName.length > 200) {
    const truncated = baseName.substring(0, 200);
    sanitized = truncated + ext;
  }

  return sanitized;
}

/**
 * Generate secure filename with timestamp and random component
 */
export function generateSecureFilename(originalName: string): string {
  const sanitizedName = sanitizeFilename(originalName);
  const ext = path.extname(sanitizedName);
  const baseName = path.basename(sanitizedName, ext);
  
  // Generate unique suffix with timestamp and crypto random
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(4).toString('hex');
  
  return `${baseName}_${timestamp}_${randomBytes}${ext}`;
}

/**
 * Validate file extension against allowed types
 */
export function validateFileExtension(filename: string): { valid: boolean; extension: string } {
  const allowedExtensions = [
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv',
    '.png', '.jpg', '.jpeg', '.gif', '.tiff', '.bmp',
    '.zip', '.rar', '.7z'
  ];

  const ext = path.extname(filename).toLowerCase();
  
  return {
    valid: allowedExtensions.includes(ext),
    extension: ext
  };
}

/**
 * Validate file size
 */
export function validateFileSize(size: number, maxSizeMB: number = 10): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return size <= maxSizeBytes;
}

/**
 * Check if PDF is password protected by examining the PDF header
 */
export function isPasswordProtectedPDF(buffer: Buffer): boolean {
  try {
    // Check if it's a PDF file first
    if (buffer.subarray(0, 4).toString() !== '%PDF') {
      return false; // Not a PDF
    }

    const pdfContent = buffer.toString('latin1');
    
    // Look for encryption indicators in the PDF structure
    const encryptionIndicators = [
      '/Encrypt', // Direct encryption dictionary reference
      '/Filter/Standard', // Standard security handler
      '/Filter/PublicKey', // Public key security handler
      '/V 1', '/V 2', '/V 4', '/V 5', // Encryption algorithm versions
      '/R 2', '/R 3', '/R 4', '/R 5', '/R 6', // Revision numbers for encryption
      '/UserPassword', // User password entry
      '/OwnerPassword', // Owner password entry
    ];

    // Check for encryption dictionary patterns
    for (const indicator of encryptionIndicators) {
      if (pdfContent.includes(indicator)) {
        return true;
      }
    }

    // Look for the encryption trailer pattern
    const encryptTrailerPattern = /\/Encrypt\s+\d+\s+\d+\s+R/;
    if (encryptTrailerPattern.test(pdfContent)) {
      return true;
    }

    // Additional check for Adobe's standard encryption format
    if (pdfContent.includes('Adobe.PPKMS') || pdfContent.includes('Adobe.PubSec')) {
      return true;
    }

    return false;
  } catch (error) {
    console.warn('Error checking PDF encryption:', error);
    // If we can't parse the PDF, assume it might be encrypted for security
    return true;
  }
}

/**
 * Comprehensive file validation
 */
export interface FileValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedFilename?: string;
  secureFilename?: string;
}

export function validateUploadedFile(
  originalName: string,
  buffer: Buffer,
  mimeType: string,
  size: number,
  options: {
    maxSizeMB?: number;
    allowPasswordProtectedPDFs?: boolean;
  } = {}
): FileValidationResult {
  const errors: string[] = [];
  const { maxSizeMB = 10, allowPasswordProtectedPDFs = false } = options;

  // 1. Validate filename
  let sanitizedFilename: string;
  try {
    sanitizedFilename = sanitizeFilename(originalName);
  } catch (error: any) {
    errors.push(`Invalid filename: ${error.message}`);
    return { valid: false, errors };
  }

  // 2. Validate file extension
  const { valid: validExtension, extension } = validateFileExtension(sanitizedFilename);
  if (!validExtension) {
    errors.push(`File type '${extension}' is not allowed`);
  }

  // 3. Validate file size
  if (!validateFileSize(size, maxSizeMB)) {
    errors.push(`File size exceeds maximum limit of ${maxSizeMB}MB`);
  }

  // 4. Validate MIME type consistency
  const expectedMimeTypes: Record<string, string[]> = {
    '.pdf': ['application/pdf'],
    '.doc': ['application/msword'],
    '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    '.xls': ['application/vnd.ms-excel'],
    '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    '.txt': ['text/plain'],
    '.csv': ['text/csv', 'application/csv'],
    '.png': ['image/png'],
    '.jpg': ['image/jpeg'],
    '.jpeg': ['image/jpeg'],
    '.gif': ['image/gif'],
    '.tiff': ['image/tiff'],
    '.bmp': ['image/bmp'],
    '.zip': ['application/zip'],
    '.rar': ['application/x-rar-compressed'],
    '.7z': ['application/x-7z-compressed']
  };

  const expectedMimes = expectedMimeTypes[extension] || [];
  if (expectedMimes.length > 0 && !expectedMimes.includes(mimeType)) {
    errors.push(`MIME type '${mimeType}' doesn't match file extension '${extension}'`);
  }

  // 5. Check for password-protected PDFs
  if (extension === '.pdf' && !allowPasswordProtectedPDFs) {
    if (isPasswordProtectedPDF(buffer)) {
      errors.push('Password-protected PDFs are not allowed');
    }
  }

  // 6. Basic file content validation
  if (buffer.length === 0) {
    errors.push('File appears to be empty');
  }

  // 7. Check for suspicious file signatures
  const suspiciousSignatures = [
    Buffer.from([0x4D, 0x5A]), // PE/EXE files
    Buffer.from([0x50, 0x4B, 0x03, 0x04]), // ZIP (could be malicious if unexpected)
  ];

  // Only flag suspicious signatures for non-archive files
  if (!['.zip', '.rar', '.7z'].includes(extension)) {
    for (const signature of suspiciousSignatures) {
      if (buffer.subarray(0, signature.length).equals(signature)) {
        errors.push('File contains suspicious binary signature');
        break;
      }
    }
  }

  const secureFilename = generateSecureFilename(sanitizedFilename);

  return {
    valid: errors.length === 0,
    errors,
    sanitizedFilename,
    secureFilename
  };
}

/**
 * Security audit logging for file uploads
 */
export interface FileUploadAuditLog {
  originalFilename: string;
  sanitizedFilename: string;
  secureFilename: string;
  fileSize: number;
  mimeType: string;
  validationErrors: string[];
  isPasswordProtectedPDF: boolean;
  uploadedBy: string | number;
  uploadTimestamp: number;
  clientIP: string;
  userAgent: string;
}

export function createFileUploadAuditLog(
  originalName: string,
  validation: FileValidationResult,
  fileSize: number,
  mimeType: string,
  uploadedBy: string | number,
  clientIP: string,
  userAgent: string
): FileUploadAuditLog {
  return {
    originalFilename: originalName,
    sanitizedFilename: validation.sanitizedFilename || 'unknown',
    secureFilename: validation.secureFilename || 'unknown',
    fileSize,
    mimeType,
    validationErrors: validation.errors,
    isPasswordProtectedPDF: mimeType === 'application/pdf' && 
      validation.errors.some(e => e.includes('Password-protected')),
    uploadedBy,
    uploadTimestamp: Date.now(),
    clientIP,
    userAgent
  };
}