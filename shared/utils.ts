/**
 * Shared utility functions for loan servicing platform
 */

/**
 * Generate a unique servicing account number
 * Format: SA + timestamp + random suffix for uniqueness
 */
export function generateServicingAccountNumber(): string {
  const timestamp = Date.now().toString();
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SA${timestamp}${randomSuffix}`;
}