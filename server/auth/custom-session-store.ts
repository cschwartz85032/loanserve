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
        AND (expire > NOW() OR expire IS NULL)
        AND revoked_at IS NULL
        LIMIT 1
      `);

      const session = result.rows?.[0];

      if (!session) {
        return callback(null, null);
      }

      // Update last seen
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
      const userId = sessionData.userId || sessionData.passport?.user;
      const expire = sessionData.cookie?.expires 
        ? new Date(sessionData.cookie.expires)
        : new Date(Date.now() + this.ttl * 1000);

      // Check if session exists
      const existingResult = await db.execute<any>(sql`
        SELECT id FROM sessions WHERE sid = ${sid} LIMIT 1
      `);
      
      const existing = existingResult.rows?.[0];

      if (existing) {
        // Update existing session
        await db.execute(sql`
          UPDATE sessions 
          SET 
            sess = ${JSON.stringify(sessionData)}::json,
            expire = ${expire},
            last_seen_at = NOW(),
            user_id = ${userId || null}
          WHERE sid = ${sid}
        `);
      } else {
        // Create new session with UUID
        const sessionId = crypto.randomUUID();
        
        // Get IP and user agent from the session data if available
        const ip = sessionData.ip || null;
        const userAgent = sessionData.userAgent || null;

        await db.execute(sql`
          INSERT INTO sessions (id, sid, sess, expire, user_id, created_at, last_seen_at, ip, user_agent)
          VALUES (
            ${sessionId},
            ${sid},
            ${JSON.stringify(sessionData)}::json,
            ${expire},
            ${userId || null},
            NOW(),
            NOW(),
            ${ip},
            ${userAgent}
          )
        `);
      }

      if (callback) callback();
    } catch (error) {
      console.error('Session set error:', error);
      if (callback) callback(error);
    }
  }

  /**
   * Destroy session
   */
  async destroy(sid: string, callback?: (err?: any) => void): Promise<void> {
    try {
      // Mark session as revoked instead of deleting
      await db.execute(sql`
        UPDATE sessions 
        SET 
          revoked_at = NOW(),
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
        SET 
          expire = ${expire},
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
        WHERE (expire > NOW() OR expire IS NULL)
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
   * Clear all sessions
   */
  async clear(callback?: (err?: any) => void): Promise<void> {
    try {
      await db.execute(sql`
        UPDATE sessions 
        SET 
          revoked_at = NOW(),
          revoke_reason = 'Bulk clear'
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
        WHERE (expire > NOW() OR expire IS NULL)
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
        await db.execute(sql`
          UPDATE sessions 
          SET 
            revoked_at = NOW(),
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