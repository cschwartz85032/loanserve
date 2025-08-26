import { Response } from 'express';
import { z } from 'zod';
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';

interface ErrorResponse {
  error: string;
  code?: string;
  details?: any;
}

interface SuccessResponse<T = any> {
  success: true;
  data?: T;
  message?: string;
}

// Standardized error response handler
export function sendError(res: Response, status: number, message: string, code?: string, details?: any) {
  const response: ErrorResponse = { error: message };
  if (code) response.code = code;
  if (details) response.details = details;
  
  console.error(`[API Error] ${status}: ${message}`, details || '');
  return res.status(status).json(response);
}

// Standardized success response handler
export function sendSuccess<T = any>(res: Response, data?: T, message?: string, status = 200) {
  const response: SuccessResponse<T> = { success: true };
  if (data !== undefined) response.data = data;
  if (message) response.message = message;
  
  return res.status(status).json(response);
}

// Async route handler wrapper with automatic error handling
export function asyncHandler(fn: Function) {
  return async (req: any, res: any, next: any) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      console.error('[AsyncHandler] Uncaught error:', error);
      
      // Check if response was already sent
      if (!res.headersSent) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        sendError(res, 500, message, 'INTERNAL_ERROR', error);
      }
    }
  };
}

// Database transaction wrapper
export async function withTransaction<T>(
  pool: Pool,
  fn: (tx: any) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const db = drizzle(client);
    const result = await fn(db);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Validation helper
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: error };
    }
    throw error;
  }
}

// Pagination helper
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function parsePaginationParams(query: any): PaginationParams {
  return {
    page: Math.max(1, parseInt(query.page || '1', 10)),
    limit: Math.min(100, Math.max(1, parseInt(query.limit || '10', 10))),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder === 'desc' ? 'desc' : 'asc'
  };
}

export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResponse<T> {
  const page = params.page || 1;
  const limit = params.limit || 10;
  const totalPages = Math.ceil(total / limit);
  
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
}

// Common database error handler
export function handleDatabaseError(error: any): { status: number; message: string; code: string } {
  // PostgreSQL error codes
  if (error.code === '23505') {
    return { status: 409, message: 'Duplicate entry', code: 'DUPLICATE_ENTRY' };
  }
  if (error.code === '23503') {
    return { status: 400, message: 'Foreign key constraint violation', code: 'FK_VIOLATION' };
  }
  if (error.code === '22P02') {
    return { status: 400, message: 'Invalid input syntax', code: 'INVALID_INPUT' };
  }
  
  return { status: 500, message: 'Database error', code: 'DB_ERROR' };
}

// Retry helper for transient failures
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 100
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// Format money value consistently
export function formatMoney(cents: number | bigint): string {
  const dollars = Number(cents) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(dollars);
}

// Parse money string to cents
export function parseMoney(value: string | number): number {
  if (typeof value === 'number') {
    return Math.round(value * 100);
  }
  
  const cleaned = value.replace(/[^0-9.-]/g, '');
  const dollars = parseFloat(cleaned);
  
  if (isNaN(dollars)) {
    throw new Error(`Invalid money value: ${value}`);
  }
  
  return Math.round(dollars * 100);
}