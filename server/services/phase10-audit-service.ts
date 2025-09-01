/**
 * Phase 10 Immutable Audit Service
 * Provides hash-chain based audit logging with tamper detection
 */

import { pool } from '../db';
import type { PoolClient } from '@neondatabase/serverless';
import { randomUUID } from 'crypto';

export interface Phase10AuditEvent {
  tenantId: string | number;
  correlationId?: string;
  eventType: string;
  actorId?: string;
  actorType: 'user' | 'service' | 'system';
  resourceUrn: string;
  payload: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

export interface AuditChainVerification {
  valid: boolean;
  brokenAt?: number;
  totalRecords: number;
  message: string;
}

export class Phase10AuditService {
  private defaultTenantId = 1;

  /**
   * Add an immutable audit event with hash chain verification
   */
  async logEvent(event: Phase10AuditEvent): Promise<string> {
    const client = await pool.connect();
    try {
      // Set tenant context for RLS
      await client.query('SELECT set_config($1, $2, true)', [
        'app.tenant_id', 
        event.tenantId || this.defaultTenantId
      ]);

      const eventId = await client.query(`
        SELECT add_phase10_audit_event(
          $1, $2::uuid, $3, $4, $5, $6, $7::jsonb, $8::inet, $9, $10
        ) as event_id
      `, [
        event.tenantId || this.defaultTenantId,
        event.correlationId || randomUUID(),
        event.eventType,
        event.actorId || null,
        event.actorType,
        event.resourceUrn,
        JSON.stringify(event.payload),
        event.ipAddress || null,
        event.userAgent || null,
        event.sessionId || null
      ]);

      return eventId.rows[0].event_id;
    } catch (error) {
      console.error('[Phase10Audit] Failed to log event:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Verify the integrity of an audit chain for a resource
   */
  async verifyAuditChain(resourceUrn: string, tenantId?: string | number): Promise<AuditChainVerification> {
    const client = await pool.connect();
    try {
      // Set tenant context
      if (tenantId) {
        await client.query('SELECT set_config($1, $2, true)', [
          'app.tenant_id', 
          tenantId
        ]);
      }

      const result = await client.query(`
        SELECT * FROM verify_audit_chain($1, $2)
      `, [resourceUrn, tenantId || null]);

      const row = result.rows[0];
      return {
        valid: row.valid,
        brokenAt: row.broken_at || undefined,
        totalRecords: parseInt(row.total_records),
        message: row.message
      };
    } catch (error) {
      console.error('[Phase10Audit] Failed to verify chain:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get audit events for a resource with pagination
   */
  async getAuditEvents(
    resourceUrn: string, 
    tenantId?: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<any[]> {
    const client = await pool.connect();
    try {
      // Set tenant context
      if (tenantId) {
        await client.query('SELECT set_config($1, $2, true)', [
          'app.tenant_id', 
          tenantId
        ]);
      }

      const result = await client.query(`
        SELECT 
          id, event_id, event_time, event_type, actor_id, actor_type,
          resource_urn, event_seq, payload, ip, user_agent, session_id,
          created_at,
          -- Don't expose internal hash fields to prevent tampering
          CASE WHEN payload_hash IS NOT NULL THEN true ELSE false END as has_integrity_hash
        FROM phase10_audit_log 
        WHERE resource_urn = $1 
          AND ($2::uuid IS NULL OR tenant_id = $2::uuid)
        ORDER BY event_seq ASC 
        LIMIT $3 OFFSET $4
      `, [resourceUrn, tenantId || null, limit, offset]);

      return result.rows;
    } catch (error) {
      console.error('[Phase10Audit] Failed to get events:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Search audit events across multiple resources
   */
  async searchAuditEvents(
    filters: {
      tenantId?: string;
      eventType?: string;
      actorId?: string;
      resourceType?: string;
      fromDate?: Date;
      toDate?: Date;
    },
    limit: number = 100,
    offset: number = 0
  ): Promise<any[]> {
    const client = await pool.connect();
    try {
      // Set tenant context
      if (filters.tenantId) {
        await client.query('SELECT set_config($1, $2, true)', [
          'app.tenant_id', 
          filters.tenantId
        ]);
      }

      let whereClause = 'WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (filters.tenantId) {
        whereClause += ` AND tenant_id = $${paramIndex}::uuid`;
        params.push(filters.tenantId);
        paramIndex++;
      }

      if (filters.eventType) {
        whereClause += ` AND event_type = $${paramIndex}`;
        params.push(filters.eventType);
        paramIndex++;
      }

      if (filters.actorId) {
        whereClause += ` AND actor_id = $${paramIndex}::uuid`;
        params.push(filters.actorId);
        paramIndex++;
      }

      if (filters.resourceType) {
        whereClause += ` AND resource_urn LIKE $${paramIndex}`;
        params.push(`urn:${filters.resourceType}:%`);
        paramIndex++;
      }

      if (filters.fromDate) {
        whereClause += ` AND event_time >= $${paramIndex}`;
        params.push(filters.fromDate);
        paramIndex++;
      }

      if (filters.toDate) {
        whereClause += ` AND event_time <= $${paramIndex}`;
        params.push(filters.toDate);
        paramIndex++;
      }

      // Add limit and offset
      params.push(limit, offset);

      const query = `
        SELECT 
          id, event_id, event_time, event_type, actor_id, actor_type,
          resource_urn, event_seq, payload, ip, user_agent,
          created_at
        FROM phase10_audit_log 
        ${whereClause}
        ORDER BY event_time DESC 
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const result = await client.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('[Phase10Audit] Failed to search events:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get audit statistics for reporting
   */
  async getAuditStatistics(tenantId?: string): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    resourcesWithAudit: number;
    averageChainIntegrity: number;
  }> {
    const client = await pool.connect();
    try {
      // Set tenant context
      if (tenantId) {
        await client.query('SELECT set_config($1, $2, true)', [
          'app.tenant_id', 
          tenantId
        ]);
      }

      // Get total events
      const totalResult = await client.query(`
        SELECT COUNT(*) as total 
        FROM phase10_audit_log 
        WHERE $1::uuid IS NULL OR tenant_id = $1::uuid
      `, [tenantId || null]);

      // Get events by type
      const typeResult = await client.query(`
        SELECT event_type, COUNT(*) as count 
        FROM phase10_audit_log 
        WHERE $1::uuid IS NULL OR tenant_id = $1::uuid
        GROUP BY event_type
        ORDER BY count DESC
      `, [tenantId || null]);

      // Get unique resources
      const resourceResult = await client.query(`
        SELECT COUNT(DISTINCT resource_urn) as count 
        FROM phase10_audit_log 
        WHERE $1::uuid IS NULL OR tenant_id = $1::uuid
      `, [tenantId || null]);

      const eventsByType: Record<string, number> = {};
      typeResult.rows.forEach(row => {
        eventsByType[row.event_type] = parseInt(row.count);
      });

      return {
        totalEvents: parseInt(totalResult.rows[0].total),
        eventsByType,
        resourcesWithAudit: parseInt(resourceResult.rows[0].count),
        averageChainIntegrity: 100 // Simplified - would calculate actual integrity in production
      };
    } catch (error) {
      console.error('[Phase10Audit] Failed to get statistics:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

export const phase10AuditService = new Phase10AuditService();