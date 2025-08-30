/**
 * Network utility functions for getting real user IP addresses
 */

/**
 * Get the real user IP address from the request, handling proxies and load balancers
 * @param {Object} req - Express request object
 * @returns {string} The real user IP address
 */
export function getRealUserIP(req) {
  // Check for various proxy headers in order of preference
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // X-Forwarded-For can contain multiple IPs, take the first one (original client)
    return forwarded.split(',')[0].trim();
  }

  // Check other common proxy headers
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return realIp;
  }

  const clientIp = req.headers['x-client-ip'];
  if (clientIp) {
    return clientIp;
  }

  // Fallback to connection remote address
  return req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip || 'unknown';
}