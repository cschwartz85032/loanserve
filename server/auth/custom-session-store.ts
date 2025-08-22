import { Store } from 'express-session';
import { db } from '../db';
import { sessions } from '@shared/schema';
import { eq, and, gte, isNull, sql } from 'drizzle-orm';
import crypto from 'crypto';

export interface SessionData {
  cookie: any;
  userId?: number;
  passport?: { user: number };
  [key: string]: any;
}

/**
 * Custom session store that uses our schema-defined sessions table
 * instead of the default connect-pg-simple table structure
 */
export class CustomSessionStore extends Store {
  private ttl: number;
  private pruneSessionInterval: number;
  private pruneTimer?: NodeJS.Timeout;

  constructor(options: { ttl?: number; pruneSessionInterval?: number } = {}) {
    super();
    this.ttl = options.ttl || 86400; // 24 hours in seconds
    this.pruneSessionInterval = options.pruneSessionInterval || 60000; // 1 minute
    this.startPruning();
  }

  /**
   * Get session from database
   */
  async get(sid: string, callback: (err: any, session?: SessionData | null) => void): Promise<void> {
    try {
      // Look up session by sid
      const result = await db.execute<any>(sql`
        SELECT * FROM sessions 
        WHERE sid = ${sid} 
        AND expire > NOW()
        AND revoked_at IS NULL
        LIMIT 1
      `);

      const session = result.rows?.[0];

      if (!session) {
        return callback(null, null);
      }

      // Update last_seen_at
      await db.execute(sql`
        UPDATE sessions 
        SET last_seen_at = NOW()
        WHERE sid = ${sid}
      `);

      // Parse the session data
      const sessionData = typeof session.sess === 'string' 
        ? JSON.parse(session.sess) 
        : session.sess;

      callback(null, sessionData);
    } catch (error) {
      console.error('Session get error:', error);
      callback(error);
    }
  }

  /**
   * Set/update session in database
   */
  async set(sid: string, sessionData: SessionData, callback?: (err?: any) => void): Promise<void> {
    try {
      const expire = sessionData.cookie?.expires 
        ? new Date(sessionData.cookie.expires)
        : new Date(Date.now() + this.ttl * 1000);

      // Extract user ID, IP, and user agent from session data
      const userId = (sessionData as any)?.userId || (sessionData as any)?.passport?.user;
      const ip = (sessionData as any)?.ip || null;
      const userAgent = (sessionData as any)?.userAgent || null;

      if (userId) {
        // Use UPSERT with proper audit fields
        await db.execute(sql`
          INSERT INTO sessions (sid, user_id, sess, expire, ip, user_agent, created_at, last_seen_at)
          VALUES (
            ${sid},
            ${userId},
            ${JSON.stringify(sessionData)}::json,
            ${expire},
            ${ip},
            ${userAgent},
            NOW(),
            NOW()
          )
          ON CONFLICT (sid) 
          DO UPDATE SET 
            sess = ${JSON.stringify(sessionData)}::json,
            expire = ${expire},
            last_seen_at = NOW(),
            ip = COALESCE(sessions.ip, ${ip}),
            user_agent = COALESCE(sessions.user_agent, ${userAgent})
        `);
      } else {
        // Fallback for sessions without user ID (pre-login sessions)
        // These won't be tracked properly but won't break the system
        console.warn('Session without userId:', sid);
      }

      if (callback) callback();
    } catch (error) {
      console.error('Session set error:', error);
      if (callback) callback(error);
    }
  }

  /**
   * Destroy session (mark as revoked instead of deleting for audit trail)
   */
  async destroy(sid: string, callback?: (err?: any) => void): Promise<void> {
    try {
      // Mark session as revoked instead of deleting (for audit trail)
      await db.execute(sql`
        UPDATE sessions 
        SET revoked_at = NOW(),
            revoke_reason = 'User logout'
        WHERE sid = ${sid}
      `);

      if (callback) callback();
    } catch (error) {
      console.error('Session destroy error:', error);
      if (callback) callback(error);
    }
  }

  /**
   * Update session expiration time
   */
  async touch(sid: string, sessionData: SessionData, callback?: (err?: any) => void): Promise<void> {
    try {
      const expire = sessionData.cookie?.expires 
        ? new Date(sessionData.cookie.expires)
        : new Date(Date.now() + this.ttl * 1000);

      await db.execute(sql`
        UPDATE sessions 
        SET expire = ${expire},
            last_seen_at = NOW()
        WHERE sid = ${sid}
      `);

      if (callback) callback();
    } catch (error) {
      console.error('Session touch error:', error);
      if (callback) callback(error);
    }
  }

  /**
   * Get all active sessions
   */
  async all(callback: (err: any, sessions?: { [sid: string]: SessionData }) => void): Promise<void> {
    try {
      const result = await db.execute<any>(sql`
        SELECT sid, sess FROM sessions 
        WHERE expire > NOW()
        AND revoked_at IS NULL
      `);

      const sessionMap: { [sid: string]: SessionData } = {};
      if (result.rows) {
        for (const session of result.rows) {
          sessionMap[session.sid] = typeof session.sess === 'string' 
            ? JSON.parse(session.sess) 
            : session.sess;
        }
      }

      callback(null, sessionMap);
    } catch (error) {
      console.error('Session all error:', error);
      callback(error);
    }
  }

  /**
   * Clear all sessions (mark as revoked for audit)
   */
  async clear(callback?: (err?: any) => void): Promise<void> {
    try {
      await db.execute(sql`
        UPDATE sessions
        SET revoked_at = NOW(),
            revoke_reason = 'Admin clear all sessions'
        WHERE revoked_at IS NULL
      `);

      if (callback) callback();
    } catch (error) {
      console.error('Session clear error:', error);
      if (callback) callback(error);
    }
  }

  /**
   * Count active sessions
   */
  async length(callback: (err: any, length?: number) => void): Promise<void> {
    try {
      const result = await db.execute<any>(sql`
        SELECT COUNT(*) as count 
        FROM sessions 
        WHERE expire > NOW()
        AND revoked_at IS NULL
      `);

      const count = result.rows?.[0]?.count || 0;
      callback(null, parseInt(count));
    } catch (error) {
      console.error('Session length error:', error);
      callback(error);
    }
  }

  /**
   * Start pruning expired sessions
   */
  private startPruning(): void {
    this.pruneTimer = setInterval(async () => {
      try {
        // Mark expired sessions as revoked (for audit trail)
        await db.execute(sql`
          UPDATE sessions 
          SET revoked_at = NOW(),
              revoke_reason = 'Session expired'
          WHERE expire < NOW()
          AND revoked_at IS NULL
        `);
      } catch (error) {
        console.error('Session pruning error:', error);
      }
    }, this.pruneSessionInterval);
  }

  /**
   * Stop pruning timer
   */
  stopPruning(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = undefined;
    }
  }
}