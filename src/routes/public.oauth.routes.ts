/**
 * Public OAuth2 Routes
 * Provides OAuth2 Client Credentials token endpoint for external API access
 */

import { Router } from "express";
import { tokenEndpoint } from "../publicapi/oauth";

export const publicOAuthRouter = Router();

// OAuth2 token endpoint
publicOAuthRouter.post("/oauth/token", tokenEndpoint);

// OAuth2 discovery endpoint (OpenID Connect style)
publicOAuthRouter.get("/.well-known/oauth-authorization-server", (req, res) => {
  const baseUrl = process.env.PUBLIC_API_BASE || `${req.protocol}://${req.get('host')}`;
  
  res.json({
    issuer: process.env.OAUTH_ISSUER || 'loanserve-auth',
    token_endpoint: `${baseUrl}/public/oauth/token`,
    token_endpoint_auth_methods_supported: ["client_secret_post"],
    grant_types_supported: ["client_credentials"],
    response_types_supported: [],
    scopes_supported: ["read", "write", "admin"],
    token_endpoint_auth_signing_alg_values_supported: ["RS256"]
  });
});