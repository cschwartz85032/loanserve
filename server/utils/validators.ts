import { z } from 'zod';

// Common ID validators
export const uuidSchema = z.string().uuid('Invalid UUID format');
export const ulidSchema = z.string().length(26, 'Invalid ULID format');
export const numericIdSchema = z.coerce.number().int().positive('ID must be a positive integer');

// Money/amount validators
export const moneyStringSchema = z.string().regex(
  /^-?\d+(\.\d{2})?$/,
  'Money must be a valid amount with up to 2 decimal places'
);

export const centsSchema = z.number().int('Amount must be in cents (integer)');
export const positiveCentsSchema = centsSchema.positive('Amount must be positive');
export const nonNegativeCentsSchema = centsSchema.nonnegative('Amount cannot be negative');

// Date validators
export const dateStringSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Date must be in YYYY-MM-DD format'
);

export const timestampSchema = z.string().datetime('Invalid timestamp format');

// Pagination validators
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc')
});

// Common entity validators
export const emailSchema = z.string().email('Invalid email address');

export const phoneSchema = z.string().regex(
  /^\+?1?\d{10,14}$/,
  'Invalid phone number format'
);

export const percentageSchema = z.number()
  .min(0, 'Percentage cannot be less than 0')
  .max(100, 'Percentage cannot be greater than 100');

export const rateSchema = z.number()
  .min(0, 'Rate cannot be negative')
  .max(100, 'Rate cannot exceed 100%');

// Loan-specific validators
export const loanNumberSchema = z.string()
  .min(1, 'Loan number is required')
  .max(50, 'Loan number too long');

export const loanStatusSchema = z.enum([
  'active',
  'paid_off',
  'defaulted', 
  'foreclosure',
  'bankruptcy',
  'modification',
  'pending'
]);

export const paymentStatusSchema = z.enum([
  'pending',
  'processing',
  'posted',
  'failed',
  'reversed',
  'cancelled'
]);

export const paymentMethodSchema = z.enum([
  'ach',
  'wire',
  'check',
  'card',
  'manual',
  'internal'
]);

// Address validator
export const addressSchema = z.object({
  street: z.string().min(1, 'Street address is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().length(2, 'State must be 2 characters'),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code format'),
  country: z.string().default('US')
});

// File upload validators
export const fileUploadSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  mimetype: z.string().min(1, 'MIME type is required'),
  size: z.number().positive('File size must be positive').max(50 * 1024 * 1024, 'File too large (max 50MB)'),
  buffer: z.instanceof(Buffer).optional()
});

// Bulk operation validators
export const bulkIdsSchema = z.object({
  ids: z.array(uuidSchema).min(1, 'At least one ID is required').max(100, 'Maximum 100 items per batch')
});

// Date range validators
export const dateRangeSchema = z.object({
  startDate: dateStringSchema,
  endDate: dateStringSchema
}).refine(data => new Date(data.startDate) <= new Date(data.endDate), {
  message: 'Start date must be before or equal to end date'
});

// Search query validators
export const searchQuerySchema = z.object({
  query: z.string().min(1).max(100),
  filters: z.record(z.any()).optional(),
  ...paginationSchema.shape
});

// Generic response schemas
export const successResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    message: z.string().optional()
  });

export const errorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.any().optional()
});

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
      hasNext: z.boolean(),
      hasPrev: z.boolean()
    })
  });

// Helper functions for validation
export function validateId(id: any, type: 'uuid' | 'ulid' | 'numeric' = 'uuid'): string | number {
  switch (type) {
    case 'uuid':
      return uuidSchema.parse(id);
    case 'ulid':
      return ulidSchema.parse(id);
    case 'numeric':
      return numericIdSchema.parse(id);
    default:
      throw new Error(`Unknown ID type: ${type}`);
  }
}

export function validateMoney(value: any, allowNegative = false): number {
  const schema = allowNegative ? centsSchema : nonNegativeCentsSchema;
  
  if (typeof value === 'string') {
    // Convert string dollars to cents
    const dollars = parseFloat(value.replace(/[^0-9.-]/g, ''));
    if (isNaN(dollars)) {
      throw new Error(`Invalid money value: ${value}`);
    }
    return schema.parse(Math.round(dollars * 100));
  }
  
  return schema.parse(value);
}

export function validateDateRange(startDate: any, endDate: any): { startDate: string; endDate: string } {
  return dateRangeSchema.parse({ startDate, endDate });
}

// Type guards
export function isValidUUID(value: any): value is string {
  try {
    uuidSchema.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function isValidEmail(value: any): value is string {
  try {
    emailSchema.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function isValidDate(value: any): value is string {
  try {
    dateStringSchema.parse(value);
    return true;
  } catch {
    return false;
  }
}