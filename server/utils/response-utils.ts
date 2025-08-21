/**
 * Standardized API Response Utilities
 * Ensures consistent response format across all endpoints
 */

import { Response } from 'express';

/**
 * Standard success response format
 */
export interface ApiSuccessResponse<T = any> {
  success: true;
  data?: T;
  message?: string;
}

/**
 * Standard error response format
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
}

/**
 * Send a successful response
 */
export function sendSuccess<T>(
  res: Response,
  data?: T,
  message?: string,
  statusCode: number = 200
): Response {
  const response: ApiSuccessResponse<T> = {
    success: true,
  };
  
  if (data !== undefined) {
    response.data = data;
  }
  
  if (message) {
    response.message = message;
  }
  
  return res.status(statusCode).json(response);
}

/**
 * Send an error response
 */
export function sendError(
  res: Response,
  error: string,
  statusCode: number = 500,
  code?: string,
  details?: any
): Response {
  const response: ApiErrorResponse = {
    success: false,
    error,
  };
  
  if (code) {
    response.code = code;
  }
  
  if (details) {
    response.details = details;
  }
  
  return res.status(statusCode).json(response);
}

/**
 * Common error responses
 */
export const ErrorResponses = {
  unauthorized: (res: Response, message = 'Authentication required') =>
    sendError(res, message, 401, 'UNAUTHORIZED'),
    
  forbidden: (res: Response, message = 'Access denied') =>
    sendError(res, message, 403, 'FORBIDDEN'),
    
  notFound: (res: Response, resource = 'Resource') =>
    sendError(res, `${resource} not found`, 404, 'NOT_FOUND'),
    
  badRequest: (res: Response, message: string, details?: any) =>
    sendError(res, message, 400, 'BAD_REQUEST', details),
    
  internalError: (res: Response, message = 'An error occurred', error?: any) => {
    console.error('Internal server error:', error);
    return sendError(res, message, 500, 'INTERNAL_ERROR');
  },
  
  conflict: (res: Response, message: string) =>
    sendError(res, message, 409, 'CONFLICT'),
    
  tooManyRequests: (res: Response, message = 'Too many requests', retryAfter?: number) =>
    sendError(res, message, 429, 'RATE_LIMIT', { retryAfter }),
};