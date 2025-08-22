/**
 * Centralized Validation Helper
 * 
 * Ensures consistent validation across all forms and API endpoints
 */

import { z } from 'zod';
import { AppError, ErrorCode } from './error-handler';

/**
 * Common validation schemas for reuse
 */
export const commonSchemas = {
  // Email validation
  email: z.string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  
  // Phone validation
  phone: z.string()
    .regex(/^[\d\s\-\(\)\+]+$/, 'Please enter a valid phone number')
    .optional(),
  
  // US ZIP code
  zipCode: z.string()
    .regex(/^\d{5}(-\d{4})?$/, 'Please enter a valid ZIP code (e.g., 12345 or 12345-6789)')
    .optional(),
  
  // SSN/EIN
  ssn: z.string()
    .regex(/^\d{3}-?\d{2}-?\d{4}$/, 'Please enter a valid SSN')
    .optional(),
  
  ein: z.string()
    .regex(/^\d{2}-?\d{7}$/, 'Please enter a valid EIN')
    .optional(),
  
  // Money/decimal amounts
  money: z.string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Please enter a valid amount (e.g., 1234.56)'),
  
  // Percentage
  percentage: z.string()
    .regex(/^\d+(\.\d{1,4})?$/, 'Please enter a valid percentage')
    .refine(val => parseFloat(val) >= 0 && parseFloat(val) <= 100, 'Percentage must be between 0 and 100'),
  
  // Date validation
  date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Please enter a valid date (YYYY-MM-DD)'),
  
  // Password validation
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  
  // Username validation
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens')
};

/**
 * Validation middleware for Express routes
 */
export function validateRequest(schema: z.ZodSchema) {
  return (req: any, res: any, next: any) => {
    try {
      const validated = schema.parse(req.body);
      req.validatedData = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fields: Record<string, string[]> = {};
        error.issues.forEach(issue => {
          const path = issue.path.join('.');
          if (!fields[path]) {
            fields[path] = [];
          }
          fields[path].push(issue.message);
        });
        
        return res.status(400).json({
          error: 'Please correct the validation errors',
          code: ErrorCode.VALIDATION_ERROR,
          details: { fields }
        });
      }
      next(error);
    }
  };
}

/**
 * Sanitize input to prevent XSS and injection attacks
 */
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove any script tags and dangerous HTML
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  
  if (input && typeof input === 'object') {
    const sanitized: any = {};
    for (const key in input) {
      if (input.hasOwnProperty(key)) {
        sanitized[key] = sanitizeInput(input[key]);
      }
    }
    return sanitized;
  }
  
  return input;
}

/**
 * Validate and sanitize pagination parameters
 */
export function validatePagination(query: any): { page: number; pageSize: number; sortBy?: string; sortOrder?: 'asc' | 'desc' } {
  const page = Math.max(1, parseInt(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize) || 20));
  
  const sortBy = query.sortBy ? String(query.sortBy) : undefined;
  const sortOrder = query.sortOrder === 'desc' ? 'desc' : 'asc';
  
  return { page, pageSize, sortBy, sortOrder };
}

/**
 * Create a schema with common fields
 */
export function createEntitySchema(fields: Record<string, z.ZodSchema>) {
  return z.object({
    ...fields,
    createdAt: z.date().optional(),
    updatedAt: z.date().optional()
  });
}

/**
 * Partial validation for updates (makes all fields optional)
 */
export function createUpdateSchema<T extends z.ZodObject<any>>(schema: T) {
  return schema.partial();
}

/**
 * Validate environment variables on startup
 */
export function validateEnvironment() {
  const envSchema = z.object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    PORT: z.string().regex(/^\d+$/).optional(),
    NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters').optional(),
    OPENAI_API_KEY: z.string().optional(),
    SENDGRID_API_KEY: z.string().optional(),
    SENDGRID_FROM_EMAIL: z.string().email().optional()
  });
  
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('Environment validation failed:', error);
    throw new Error('Invalid environment configuration');
  }
}