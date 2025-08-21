/**
 * Utility to help identify and update error response patterns
 * Run this to find all routes that need updating
 */

import * as fs from 'fs';
import * as path from 'path';

// Patterns to search for inconsistent error responses
const errorPatterns = [
  /res\.status\(\d+\)\.json\(\s*{\s*error:/g,
  /return\s+res\.json\(\s*{\s*error:/g,
  /res\.json\(\s*{\s*success:\s*false/g,
  /res\.status\(\d+\)\.send\(/g,
];

// Files to check
const routeFiles = [
  'server/routes/auth.ts',
  'server/routes/admin-users.ts',
  'server/routes/crm.ts',
  'server/routes/fees.ts',
  'server/routes/ip-allowlist.ts',
  'server/routes/ledger.ts',
  'server/routes/mfa.ts',
  'server/routes.ts'
];

export function findInconsistentResponses() {
  const results: { file: string; line: number; match: string }[] = [];
  
  for (const file of routeFiles) {
    if (!fs.existsSync(file)) continue;
    
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      for (const pattern of errorPatterns) {
        if (pattern.test(line)) {
          results.push({
            file,
            line: index + 1,
            match: line.trim()
          });
        }
        pattern.lastIndex = 0; // Reset regex
      }
    });
  }
  
  return results;
}

// Export mapping of old patterns to new standardized responses
export const responseMapping = {
  // 400 Bad Request
  "res.status(400).json({ error:": "ErrorResponses.badRequest(res,",
  "return res.status(400).json({ error:": "return ErrorResponses.badRequest(res,",
  
  // 401 Unauthorized
  "res.status(401).json({ error:": "ErrorResponses.unauthorized(res,",
  "return res.status(401).json({ error:": "return ErrorResponses.unauthorized(res,",
  
  // 403 Forbidden
  "res.status(403).json({ error:": "ErrorResponses.forbidden(res,",
  "return res.status(403).json({ error:": "return ErrorResponses.forbidden(res,",
  
  // 404 Not Found
  "res.status(404).json({ error:": "ErrorResponses.notFound(res,",
  "return res.status(404).json({ error:": "return ErrorResponses.notFound(res,",
  
  // 409 Conflict
  "res.status(409).json({ error:": "ErrorResponses.conflict(res,",
  "return res.status(409).json({ error:": "return ErrorResponses.conflict(res,",
  
  // 429 Too Many Requests
  "res.status(429).json({ error:": "ErrorResponses.tooManyRequests(res,",
  "return res.status(429).json({ error:": "return ErrorResponses.tooManyRequests(res,",
  
  // 500 Internal Server Error
  "res.status(500).json({ error:": "ErrorResponses.internalError(res,",
  "return res.status(500).json({ error:": "return ErrorResponses.internalError(res,",
  
  // Success responses
  "res.json({ success: true,": "sendSuccess(res, {",
  "return res.json({ success: true,": "return sendSuccess(res, {",
  "res.status(200).json({ success: true,": "sendSuccess(res, {",
  "res.status(201).json({ success: true,": "sendSuccess(res, {",
};

if (require.main === module) {
  const inconsistent = findInconsistentResponses();
  console.log('Found', inconsistent.length, 'inconsistent error responses:');
  inconsistent.forEach(({ file, line, match }) => {
    console.log(`  ${file}:${line} - ${match}`);
  });
}