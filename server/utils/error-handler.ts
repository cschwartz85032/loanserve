/**
 * Centralized Error Handling System
 * 
 * Provides consistent error responses, maps technical errors to user-friendly messages,
 * and ensures sensitive information is not exposed to clients.
 */

import { Response } from 'express';
import { ZodError } from 'zod';

export enum ErrorCode {
  // Authentication & Authorization
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  
  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Database
  NOT_FOUND = 'NOT_FOUND',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  FOREIGN_KEY_VIOLATION = 'FOREIGN_KEY_VIOLATION',
  DATABASE_ERROR = 'DATABASE_ERROR',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  
  // Business Logic
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  OPERATION_NOT_ALLOWED = 'OPERATION_NOT_ALLOWED',
  RESOURCE_LOCKED = 'RESOURCE_LOCKED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  
  // System
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT'
}

interface ErrorResponse {
  error: string;
  code: ErrorCode;
  details?: any;
  timestamp: string;
  requestId?: string;
}

export class AppError extends Error {
  constructor(
    public message: string,
    public code: ErrorCode,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Maps database errors to user-friendly messages
 */
function mapDatabaseError(error: any): { message: string; code: ErrorCode } {
  const errorCode = error.code || error.errno;
  
  switch (errorCode) {
    case '23505': // Unique violation
      return {
        message: 'This record already exists. Please use a different value.',
        code: ErrorCode.DUPLICATE_ENTRY
      };
    case '23503': // Foreign key violation
      return {
        message: 'This operation references data that does not exist.',
        code: ErrorCode.FOREIGN_KEY_VIOLATION
      };
    case '23502': // Not null violation
      return {
        message: 'Required information is missing. Please provide all required fields.',
        code: ErrorCode.MISSING_REQUIRED_FIELD
      };
    case '42P01': // Undefined table
    case '42703': // Undefined column
      console.error('Database schema error:', error);
      return {
        message: 'A system configuration error occurred. Please contact support.',
        code: ErrorCode.DATABASE_ERROR
      };
    default:
      return {
        message: 'A database error occurred. Please try again.',
        code: ErrorCode.DATABASE_ERROR
      };
  }
}

/**
 * Maps Zod validation errors to user-friendly messages
 */
function mapZodError(error: ZodError): { message: string; fields: Record<string, string[]> } {
  const fields: Record<string, string[]> = {};
  
  error.issues.forEach(issue => {
    const path = issue.path.join('.');
    if (!fields[path]) {
      fields[path] = [];
    }
    
    // Map Zod error codes to user-friendly messages
    let message = issue.message;
    switch (issue.code) {
      case 'invalid_type':
        message = `Invalid format. Expected ${issue.expected}.`;
        break;
      case 'invalid_string':
        if (issue.validation === 'email') {
          message = 'Please enter a valid email address.';
        } else if (issue.validation === 'url') {
          message = 'Please enter a valid URL.';
        } else if (issue.validation === 'uuid') {
          message = 'Invalid identifier format.';
        }
        break;
      case 'too_small':
        if (issue.type === 'string') {
          message = `Must be at least ${issue.minimum} characters.`;
        } else if (issue.type === 'number') {
          message = `Must be at least ${issue.minimum}.`;
        }
        break;
      case 'too_big':
        if (issue.type === 'string') {
          message = `Must be at most ${issue.maximum} characters.`;
        } else if (issue.type === 'number') {
          message = `Must be at most ${issue.maximum}.`;
        }
        break;
    }
    
    fields[path].push(message);
  });
  
  // Create a summary message
  const fieldCount = Object.keys(fields).length;
  const message = fieldCount === 1 
    ? fields[Object.keys(fields)[0]][0]
    : `Please correct ${fieldCount} validation errors.`;
  
  return { message, fields };
}

/**
 * Central error handler for all API routes
 */
export function handleError(error: any, res: Response, requestId?: string): Response {
  // Log the full error for debugging (but don't send to client)
  console.error('Error details:', {
    message: error.message,
    stack: error.stack,
    code: error.code,
    requestId
  });
  
  let statusCode = 500;
  let errorCode = ErrorCode.INTERNAL_ERROR;
  let message = 'An unexpected error occurred. Please try again.';
  let details: any = undefined;
  
  // Handle known error types
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    errorCode = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    errorCode = ErrorCode.VALIDATION_ERROR;
    const mapped = mapZodError(error);
    message = mapped.message;
    details = { fields: mapped.fields };
  } else if (error.code && typeof error.code === 'string' && error.code.startsWith('2')) {
    // PostgreSQL error codes start with numbers
    const mapped = mapDatabaseError(error);
    statusCode = 400;
    errorCode = mapped.code;
    message = mapped.message;
  } else if (error.message) {
    // Check for specific error patterns
    if (error.message.includes('not found')) {
      statusCode = 404;
      errorCode = ErrorCode.NOT_FOUND;
      message = 'The requested resource was not found.';
    } else if (error.message.includes('unauthorized') || error.message.includes('authentication')) {
      statusCode = 401;
      errorCode = ErrorCode.UNAUTHORIZED;
      message = 'Authentication required. Please log in.';
    } else if (error.message.includes('forbidden') || error.message.includes('permission')) {
      statusCode = 403;
      errorCode = ErrorCode.FORBIDDEN;
      message = 'You do not have permission to perform this action.';
    } else if (error.message.includes('timeout')) {
      statusCode = 408;
      errorCode = ErrorCode.REQUEST_TIMEOUT;
      message = 'The request took too long to process. Please try again.';
    } else if (error.message.includes('rate limit')) {
      statusCode = 429;
      errorCode = ErrorCode.RATE_LIMIT_EXCEEDED;
      message = 'Too many requests. Please slow down and try again.';
    }
  }
  
  // Build response
  const response: ErrorResponse = {
    error: message,
    code: errorCode,
    timestamp: new Date().toISOString(),
    requestId
  };
  
  // Only include details in development or for validation errors
  if (process.env.NODE_ENV === 'development' || errorCode === ErrorCode.VALIDATION_ERROR) {
    response.details = details;
  }
  
  return res.status(statusCode).json(response);
}

/**
 * Async wrapper for route handlers with automatic error handling
 */
export function asyncHandler(fn: Function) {
  return (req: any, res: Response, next: any) => {
    const requestId = req.headers['x-request-id'] || `req-${Date.now()}`;
    Promise.resolve(fn(req, res, next))
      .catch(error => handleError(error, res, requestId));
  };
}

/**
 * Transaction wrapper with automatic rollback and error handling
 */
export async function withTransaction<T>(
  db: any,
  operation: (tx: any) => Promise<T>,
  errorMessage = 'Transaction failed'
): Promise<T> {
  try {
    return await db.transaction(async (tx: any) => {
      return await operation(tx);
    });
  } catch (error: any) {
    // Log transaction failure
    console.error('Transaction failed:', {
      message: error.message,
      code: error.code,
      operation: operation.name || 'anonymous'
    });
    
    // Wrap in AppError for consistent handling
    throw new AppError(
      errorMessage,
      ErrorCode.TRANSACTION_FAILED,
      500,
      process.env.NODE_ENV === 'development' ? error.message : undefined
    );
  }
}

/**
 * Validation helper that throws AppError instead of raw Zod errors
 */
export function validateInput<T>(schema: any, data: any, errorMessage = 'Invalid input'): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const mapped = mapZodError(error);
      throw new AppError(
        mapped.message,
        ErrorCode.VALIDATION_ERROR,
        400,
        { fields: mapped.fields }
      );
    }
    throw error;
  }
}

/**
 * Standard success response helper
 */
export function successResponse<T>(res: Response, data: T, statusCode = 200): Response {
  return res.status(statusCode).json({
    success: true,
    data,
    timestamp: new Date().toISOString()
  });
}

/**
 * Pagination response helper
 */
export function paginatedResponse<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  pageSize: number
): Response {
  return res.status(200).json({
    success: true,
    data,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    },
    timestamp: new Date().toISOString()
  });
}