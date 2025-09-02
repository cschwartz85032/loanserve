import jwksClient from "jwks-rsa";
import jwt from "jsonwebtoken";

const client = jwksClient({
  jwksUri: process.env.JWKS_URL!,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000 // 10 minutes
});

function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const signingKey = (key as any).getPublicKey();
    callback(null, signingKey);
  });
}

export function verifyJwt(token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, {
      audience: process.env.JWT_AUDIENCE,
      issuer: process.env.JWT_ISSUER,
      algorithms: ["RS256"]
    }, (err, decoded) => err ? reject(err) : resolve(decoded));
  });
}

// Express middleware
export function requireAuth() {
  return async (req: any, res: any, next: any) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "missing token" });
    }
    try {
      const claims: any = await verifyJwt(token);
      req.user = {
        sub: claims.sub,
        email: claims.email,
        roles: claims.roles || claims["https://loanserve.io/roles"] || [],
        groups: claims.groups || [],
        tenant_id: claims["https://loanserve.io/tenant_id"] || claims.tenant_id
      };
      next();
    } catch (e) {
      console.error('[JWT] Verification error:', e);
      res.status(401).json({ error: "invalid token" });
    }
  };
}