/**
 * OAuth2 Client Credentials Implementation
 * Provides JWT tokens for secure API access with tenant isolation
 */

import { readFileSync } from "fs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Load private key for JWT signing
function getPrivateKey(): string {
  const keyPath = process.env.OAUTH_JWT_PRIVATE_PEM_PATH;
  if (!keyPath) {
    // For development, use a simple key - in production this should be a proper RSA key
    return process.env.OAUTH_JWT_PRIVATE_KEY || 'development-jwt-secret-key';
  }
  return readFileSync(keyPath, "utf-8");
}

const PRIVATE_KEY = getPrivateKey();
const KID = process.env.OAUTH_JWT_SIGNING_KID || 'api-key-1';
const ISSUER = process.env.OAUTH_ISSUER || 'loanserve-auth';

/**
 * OAuth2 Token Endpoint - Client Credentials Grant
 */
export async function tokenEndpoint(req: any, res: any) {
  try {
    const { client_id, client_secret, grant_type, scope } = req.body || {};
    
    // Validate grant type
    if (grant_type !== "client_credentials") {
      return res.status(400).json({ 
        error: "unsupported_grant_type",
        error_description: "Only client_credentials grant type is supported"
      });
    }

    // Validate required fields
    if (!client_id || !client_secret) {
      return res.status(400).json({ 
        error: "invalid_request",
        error_description: "client_id and client_secret are required"
      });
    }

    const c = await pool.connect();
    try {
      // Find client
      const result = await c.query(
        `SELECT * FROM api_clients WHERE client_id=$1 AND active=true`, 
        [client_id]
      );
      
      if (!result.rowCount) {
        return res.status(401).json({ 
          error: "invalid_client",
          error_description: "Client authentication failed"
        });
      }

      const client = result.rows[0];
      
      // Verify client secret
      const secretValid = await bcrypt.compare(client_secret, client.client_secret_hash);
      if (!secretValid) {
        return res.status(401).json({ 
          error: "invalid_client",
          error_description: "Client authentication failed"
        });
      }

      // Determine scopes (requested or default)
      const requestedScopes = scope ? scope.split(' ') : client.scopes;
      const grantedScopes = requestedScopes.filter(s => client.scopes.includes(s));

      if (grantedScopes.length === 0) {
        return res.status(400).json({ 
          error: "invalid_scope",
          error_description: "Requested scope is not authorized for this client"
        });
      }

      // Generate JWT token
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: ISSUER,
        aud: "loanserve-public-api",
        sub: client.client_id,
        scope: grantedScopes.join(" "),
        "https://loanserve.io/tenant_id": client.tenant_id,
        "https://loanserve.io/client_name": client.client_name,
        iat: now,
        exp: now + 3600, // 1 hour
        jti: randomUUID()
      };

      const token = jwt.sign(payload, PRIVATE_KEY, { 
        algorithm: "RS256", 
        keyid: KID 
      });

      res.json({
        access_token: token,
        token_type: "Bearer",
        expires_in: 3600,
        scope: grantedScopes.join(" ")
      });

    } finally {
      c.release();
    }
  } catch (error: any) {
    console.error('OAuth token error:', error);
    res.status(500).json({ 
      error: "server_error",
      error_description: "Internal server error"
    });
  }
}

/**
 * Create a new API client
 */
export async function createApiClient(
  tenantId: string,
  clientName: string,
  scopes: string[] = ['read']
): Promise<{ clientId: string; clientSecret: string }> {
  const clientId = `client_${randomUUID().replace(/-/g, '')}`;
  const clientSecret = randomUUID();
  const clientSecretHash = await bcrypt.hash(clientSecret, 12);

  const c = await pool.connect();
  try {
    await c.query(
      `INSERT INTO api_clients (tenant_id, client_id, client_name, client_secret_hash, scopes)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, clientId, clientName, clientSecretHash, scopes]
    );

    return { clientId, clientSecret };
  } finally {
    c.release();
  }
}