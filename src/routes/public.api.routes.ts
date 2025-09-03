/**
 * Public API Routes
 * Secure external API endpoints with OAuth2 and API key authentication
 */

import { Router } from "express";
import jwt from "jsonwebtoken";
import { apiKeyAuth } from "../publicapi/auth";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const publicApiRouter = Router();

/**
 * JWT Bearer token authentication middleware
 */
function jwtAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Bearer token required'
    });
  }

  const token = authHeader.substring(7);
  
  try {
    // In production, verify with public key
    const publicKey = process.env.OAUTH_JWT_PUBLIC_KEY || process.env.OAUTH_JWT_PRIVATE_KEY || 'development-jwt-secret-key';
    const decoded = jwt.verify(token, publicKey, { 
      algorithms: ['RS256', 'HS256'],
      audience: 'loanserve-public-api'
    }) as any;

    // Extract tenant ID from token
    req.tenant = { 
      id: decoded['https://loanserve.io/tenant_id'],
      clientId: decoded.sub,
      clientName: decoded['https://loanserve.io/client_name'],
      scopes: decoded.scope ? decoded.scope.split(' ') : []
    };

    next();
  } catch (error) {
    console.error('JWT verification error:', error);
    res.status(401).json({
      error: 'unauthorized',
      message: 'Invalid or expired token'
    });
  }
}

/**
 * Scope authorization middleware
 */
function requireScope(scope: string) {
  return (req: any, res: any, next: any) => {
    if (!req.tenant?.scopes?.includes(scope)) {
      return res.status(403).json({
        error: 'insufficient_scope',
        message: `Scope '${scope}' required`
      });
    }
    next();
  };
}

// Apply authentication to all public API routes
publicApiRouter.use(jwtAuth);

/**
 * Loan API Endpoints
 */
publicApiRouter.get("/v1/loans", requireScope('read'), async (req: any, res) => {
  try {
    const c = await pool.connect();
    try {
      await c.query(`SET LOCAL app.tenant_id=$1`, [req.tenant.id]);
      
      const { page = 1, limit = 50 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);
      
      const result = await c.query(
        `SELECT id, loan_number, borrower_name, principal_balance, status, created_at
         FROM loans 
         ORDER BY created_at DESC 
         LIMIT $1 OFFSET $2`,
        [parseInt(limit), offset]
      );

      const countResult = await c.query(`SELECT COUNT(*) FROM loans`);
      const total = parseInt(countResult.rows[0].count);

      res.json({
        data: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } finally {
      c.release();
    }
  } catch (error: any) {
    console.error('Loans API error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to retrieve loans'
    });
  }
});

publicApiRouter.get("/v1/loans/:id", requireScope('read'), async (req: any, res) => {
  try {
    const c = await pool.connect();
    try {
      await c.query(`SET LOCAL app.tenant_id=$1`, [req.tenant.id]);
      
      const result = await c.query(
        `SELECT * FROM loans WHERE id = $1`,
        [req.params.id]
      );

      if (!result.rowCount) {
        return res.status(404).json({
          error: 'not_found',
          message: 'Loan not found'
        });
      }

      res.json({ data: result.rows[0] });
    } finally {
      c.release();
    }
  } catch (error: any) {
    console.error('Loan API error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to retrieve loan'
    });
  }
});

/**
 * Payment API Endpoints
 */
publicApiRouter.get("/v1/loans/:id/payments", requireScope('read'), async (req: any, res) => {
  try {
    const c = await pool.connect();
    try {
      await c.query(`SET LOCAL app.tenant_id=$1`, [req.tenant.id]);
      
      const { page = 1, limit = 50 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);
      
      const result = await c.query(
        `SELECT id, amount, payment_date, status, channel, created_at
         FROM payments 
         WHERE loan_id = $1
         ORDER BY payment_date DESC 
         LIMIT $2 OFFSET $3`,
        [req.params.id, parseInt(limit), offset]
      );

      res.json({ data: result.rows });
    } finally {
      c.release();
    }
  } catch (error: any) {
    console.error('Payments API error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to retrieve payments'
    });
  }
});

/**
 * Document API Endpoints
 */
publicApiRouter.get("/v1/loans/:id/documents", requireScope('read'), async (req: any, res) => {
  try {
    const c = await pool.connect();
    try {
      await c.query(`SET LOCAL app.tenant_id=$1`, [req.tenant.id]);
      
      const result = await c.query(
        `SELECT id, filename, document_type, uploaded_at, file_size
         FROM documents 
         WHERE loan_id = $1
         ORDER BY uploaded_at DESC`,
        [req.params.id]
      );

      res.json({ data: result.rows });
    } finally {
      c.release();
    }
  } catch (error: any) {
    console.error('Documents API error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to retrieve documents'
    });
  }
});

/**
 * API Information
 */
publicApiRouter.get("/v1/info", (req: any, res) => {
  res.json({
    api_version: "1.0.0",
    tenant_id: req.tenant.id,
    client_id: req.tenant.clientId,
    client_name: req.tenant.clientName,
    scopes: req.tenant.scopes,
    endpoints: [
      "GET /v1/loans",
      "GET /v1/loans/:id",
      "GET /v1/loans/:id/payments",
      "GET /v1/loans/:id/documents"
    ]
  });
});