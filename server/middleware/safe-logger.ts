// server/middleware/safe-logger.ts

/**
 * Recursively masks sensitive fields in objects to prevent exposure in logs
 */
export function maskSensitive(obj: any): any {
  if (obj == null || typeof obj !== 'object') return obj;
  
  const clone = Array.isArray(obj) ? [] : {} as any;
  
  for (const [k, v] of Object.entries(obj)) {
    // Mask sensitive fields by replacing with '***'
    if ([
      'account_number',
      'routing_number', 
      'account_number_masked',
      'routing_number_masked',
      'ssn',
      'token',
      'password',
      'secret',
      'apiKey',
      'api_key',
      'authorization',
      'cookie',
      'session'
    ].includes(k.toLowerCase())) {
      clone[k] = '***';
    } else if (typeof v === 'object') {
      // Recursively mask nested objects
      clone[k] = maskSensitive(v);
    } else {
      clone[k] = v;
    }
  }
  
  return clone;
}