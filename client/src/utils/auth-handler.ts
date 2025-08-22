/**
 * Client-side authentication handler
 * 
 * Handles 401 responses gracefully by redirecting to login
 * and managing authentication state
 */

import { toast } from '@/hooks/use-toast';

const AUTH_STORAGE_KEY = 'auth_redirect_path';

/**
 * Handle 401 unauthorized responses
 */
export function handle401Response(currentPath?: string) {
  // Store current path for redirect after login
  if (currentPath && currentPath !== '/login') {
    sessionStorage.setItem(AUTH_STORAGE_KEY, currentPath);
  }
  
  // Clear any existing auth state
  localStorage.removeItem('user');
  sessionStorage.removeItem('sessionId');
  
  // Show user-friendly message
  toast({
    title: 'Session Expired',
    description: 'Please log in again to continue.',
    variant: 'default'
  });
  
  // Redirect to login
  window.location.href = '/login';
}

/**
 * Get redirect path after successful login
 */
export function getPostLoginRedirect(): string {
  const redirectPath = sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (redirectPath) {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    return redirectPath;
  }
  return '/';
}

/**
 * Enhanced fetch wrapper that handles authentication errors
 */
export async function authenticatedFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...options?.headers,
      'Content-Type': 'application/json'
    }
  });
  
  // Handle 401 responses
  if (response.status === 401) {
    const currentPath = window.location.pathname;
    handle401Response(currentPath);
    throw new Error('Authentication required');
  }
  
  return response;
}

/**
 * Parse error response and return user-friendly message
 */
export async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const data = await response.json();
    
    // Check for our standardized error format
    if (data.error) {
      return data.error;
    }
    
    // Check for validation errors with field details
    if (data.code === 'VALIDATION_ERROR' && data.details?.fields) {
      const fields = Object.keys(data.details.fields);
      if (fields.length === 1) {
        return data.details.fields[fields[0]][0];
      }
      return `Please correct errors in: ${fields.join(', ')}`;
    }
    
    // Fallback to message
    if (data.message) {
      return data.message;
    }
    
    return 'An unexpected error occurred';
  } catch {
    // If JSON parsing fails, return generic message
    return 'An unexpected error occurred';
  }
}