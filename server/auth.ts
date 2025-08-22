import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import argon2 from "argon2";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  // Use argon2 to match auth-service.ts
  return await argon2.hash(password);
}

async function comparePasswords(supplied: string, stored: string) {
  // Handle both argon2 and legacy scrypt formats
  if (stored.startsWith("$argon2")) {
    // New argon2 format
    return await argon2.verify(stored, supplied);
  } else if (stored.includes(".")) {
    // Legacy scrypt format (hash.salt)
    const [hashed, salt] = stored.split(".");
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    return timingSafeEqual(hashedBuf, suppliedBuf);
  }
  return false;
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'dev-session-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: false, // Allow non-HTTPS in development
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      const user = await storage.getUserByUsername(username);
      if (!user || !(await comparePasswords(password, user.password))) {
        return done(null, false);
      } else {
        return done(null, user);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  app.post("/api/register", async (req, res, next) => {
    const existingUser = await storage.getUserByUsername(req.body.username);
    if (existingUser) {
      return res.status(400).send("Username already exists");
    }

    const user = await storage.createUser({
      ...req.body,
      password: await hashPassword(req.body.password),
    });

    req.login(user, (err) => {
      if (err) return next(err);
      res.status(201).json(user);
    });
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ error: "Internal server error" });
      }
      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ error: "Login failed" });
        }
        return res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", async (req, res) => {
    // Check for authenticated user from Passport or session
    const userId = req.user?.id || (req.session as any)?.userId;
    
    if (!userId) {
      return res.sendStatus(401);
    }
    
    try {
      // Get user from database
      const { db } = await import('./db');
      const { users, userRoles, roles } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      if (!user) {
        return res.sendStatus(401);
      }
      
      // Get user's roles from RBAC system
      const userRolesList = await db
        .select({
          roleId: roles.id,
          roleName: roles.name,
          roleDescription: roles.description
        })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, userId));
      
      // Extract role names for easy checking
      const roleNames = userRolesList.map(r => r.roleName);
      
      // Don't send password to client
      const { password, ...userWithoutPassword } = user;
      
      // Include roles in the response
      const userWithRoles = {
        ...userWithoutPassword,
        roles: userRolesList,
        roleNames: roleNames,
        // Add a backward-compatible role field for admin detection
        role: roleNames.includes('admin') ? 'admin' : (roleNames[0] || 'user')
      };
      
      res.json(userWithRoles);
    } catch (error) {
      console.error('Error fetching user:', error);
      res.sendStatus(500);
    }
  });
}
