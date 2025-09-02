/**
 * Security Headers and Content Security Policy
 * Implements defense-in-depth web security measures
 */

import helmet from "helmet";
import { Request, Response, NextFunction } from "express";

/**
 * Configure comprehensive security headers
 */
export function configureSecurityHeaders() {
  return helmet({
    // Strict Transport Security
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [process.env.CSP_DEFAULT_SRC || "'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // Required for Chart.js in observability dashboard
          "https://cdnjs.cloudflare.com", // PDF.js worker
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Required for dynamic styles
        ],
        imgSrc: [
          process.env.CSP_IMG_SRC || "'self' data:",
          "https:", // Allow HTTPS images
        ],
        connectSrc: [
          process.env.CSP_CONNECT_SRC || "'self' https://api.openai.com https://vault.internal",
          "wss:", // WebSocket connections
        ],
        fontSrc: ["'self'", "data:", "https:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    
    // Additional security headers
    crossOriginEmbedderPolicy: false, // Disable if causing issues
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-site" },
    
    // Prevent MIME type sniffing
    noSniff: true,
    
    // Prevent XSS attacks
    xssFilter: true,
    
    // Referrer policy
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    
    // Permissions policy
    permittedCrossDomainPolicies: false,
  });
}

/**
 * Custom security middleware for API endpoints
 */
export function apiSecurityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // API-specific headers
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    
    // Remove server information
    res.removeHeader("X-Powered-By");
    res.removeHeader("Server");
    
    // Cache control for sensitive endpoints
    if (req.path.includes("/api/")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
    
    next();
  };
}

/**
 * Rate limiting configuration
 */
export function configureRateLimiting() {
  let rateLimit: any;
  try {
    rateLimit = require("express-rate-limit");
  } catch (error) {
    console.warn('[Security] express-rate-limit not available, using placeholder');
    rateLimit = () => (req: any, res: any, next: any) => next();
  }
  
  // General API rate limit
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: {
      error: "Too many requests",
      retryAfter: 900 // seconds
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req: Request) => {
      // Skip rate limiting for health checks
      return req.path === "/health" || req.path === "/metrics";
    }
  });
  
  // Stricter limit for authentication endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 login attempts per window
    message: {
      error: "Too many authentication attempts",
      retryAfter: 900
    },
    skipSuccessfulRequests: true
  });
  
  // Very strict limit for wire transfer endpoints
  const wireTransferLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 wire transfer requests per hour
    message: {
      error: "Wire transfer request limit exceeded",
      retryAfter: 3600
    }
  });
  
  return {
    apiLimiter,
    authLimiter,
    wireTransferLimiter
  };
}