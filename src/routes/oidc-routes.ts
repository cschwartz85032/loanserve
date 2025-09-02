/**
 * OIDC Authentication Routes
 * Handles OpenID Connect login flow for web applications
 */

import { Router } from "express";
import { startLogin, callback } from "../security/oidc";
import { setDefaultTenantRole } from "../security/rbac";

export const oidcRouter = Router();

/**
 * Initiate OIDC login flow
 */
oidcRouter.get("/auth/login", async (req, res) => {
  try {
    await startLogin(req, res);
  } catch (error) {
    console.error('[OIDC] Login initiation error:', error);
    res.status(500).json({ 
      error: 'Authentication service unavailable',
      message: 'Please try again later'
    });
  }
});

/**
 * Handle OIDC callback
 */
oidcRouter.get("/oauth/callback", async (req, res) => {
  try {
    await callback(req, res);
    
    // Set default tenant role if user has no roles assigned
    if (req.session?.user) {
      setDefaultTenantRole(req.session.user, req.session.user.tenant_id);
    }
  } catch (error) {
    console.error('[OIDC] Callback error:', error);
    res.redirect("/login?error=authentication_failed");
  }
});

/**
 * Logout endpoint
 */
oidcRouter.post("/auth/logout", (req, res) => {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.error('[OIDC] Logout error:', err);
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.json({ success: true, message: 'Logged out successfully' });
    });
  } else {
    res.json({ success: true, message: 'Already logged out' });
  }
});

/**
 * Current user info endpoint
 */
oidcRouter.get("/auth/me", (req, res) => {
  if (req.session?.user) {
    res.json({
      success: true,
      user: {
        sub: req.session.user.sub,
        email: req.session.user.email,
        name: req.session.user.name,
        roles: req.session.user.roles || [],
        tenant_id: req.session.user.tenant_id
      }
    });
  } else {
    res.status(401).json({ 
      error: 'not_authenticated',
      message: 'User not logged in'
    });
  }
});