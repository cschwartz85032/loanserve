/**
 * Logging redaction utilities to prevent PII exposure
 */

export function redactUuid(u?: string): string {
  if (!u) return 'unknown';
  // keep last 4 for correlation
  return u.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-([0-9a-f]{12})/i, '********-****-****-****-$1');
}