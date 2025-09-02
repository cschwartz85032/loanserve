/**
 * Tamper-Evident Audit Hash Chain
 * Implements cryptographic integrity for audit logs
 */

import { createHash, createHmac } from 'crypto';

export interface AuditEvent {
  id?: string;
  eventType: string;
  actorType: 'user' | 'system' | 'service';
  actorId: string;
  resourceType: string;
  resourceId: string;
  tenantId: string;
  eventData: any;
  timestamp: Date;
  previousHash?: string;
  eventHash?: string;
  chainSequence?: number;
}

export interface ChainMetadata {
  tenantId: string;
  lastSequence: number;
  lastHash: string;
  eventCount: number;
  chainIntact: boolean;
  lastVerified: Date;
}

/**
 * Audit Chain Manager
 * Maintains cryptographic integrity of audit logs
 */
export class AuditChainManager {
  private client: any;
  private hmacKey: string;

  constructor(client: any, hmacKey?: string) {
    this.client = client;
    this.hmacKey = hmacKey || process.env.AUDIT_CHAIN_KEY || 'default-audit-key';
  }

  /**
   * Generate deterministic hash for audit event
   */
  private generateEventHash(event: AuditEvent, previousHash: string): string {
    const canonical = JSON.stringify({
      eventType: event.eventType,
      actorType: event.actorType,
      actorId: event.actorId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      tenantId: event.tenantId,
      eventData: this.canonicalizeEventData(event.eventData),
      timestamp: event.timestamp.toISOString(),
      previousHash,
      sequence: event.chainSequence
    });

    return createHmac('sha256', this.hmacKey)
      .update(canonical)
      .digest('hex');
  }

  /**
   * Canonicalize event data for consistent hashing
   */
  private canonicalizeEventData(data: any): any {
    if (data === null || data === undefined) return null;
    if (typeof data !== 'object') return data;
    
    if (Array.isArray(data)) {
      return data.map(item => this.canonicalizeEventData(item));
    }

    // Sort object keys for deterministic serialization
    const sorted: any = {};
    Object.keys(data).sort().forEach(key => {
      sorted[key] = this.canonicalizeEventData(data[key]);
    });
    return sorted;
  }

  /**
   * Get the last hash in the chain for a tenant
   */
  private async getLastChainState(tenantId: string): Promise<{ sequence: number; hash: string }> {
    const result = await this.client.query(`
      SELECT chain_sequence, event_hash 
      FROM audit_chain_events
      WHERE tenant_id = $1
      ORDER BY chain_sequence DESC
      LIMIT 1
    `, [tenantId]);

    if (result.rows.length === 0) {
      // Genesis hash for new chain
      const genesisHash = createHash('sha256').update(`genesis:${tenantId}`).digest('hex');
      return { sequence: 0, hash: genesisHash };
    }

    return {
      sequence: result.rows[0].chain_sequence,
      hash: result.rows[0].event_hash
    };
  }

  /**
   * Append event to the tamper-evident chain
   */
  async appendEvent(event: AuditEvent): Promise<string> {
    const lastState = await getLastChainState(event.tenantId);
    const nextSequence = lastState.sequence + 1;
    
    // Set chain position
    event.chainSequence = nextSequence;
    event.previousHash = lastState.hash;
    
    // Generate cryptographic hash
    const eventHash = this.generateEventHash(event, lastState.hash);
    event.eventHash = eventHash;

    // Store in chain table
    const result = await this.client.query(`
      INSERT INTO audit_chain_events (
        id, tenant_id, event_type, actor_type, actor_id,
        resource_type, resource_id, event_data, timestamp,
        previous_hash, event_hash, chain_sequence,
        created_at
      )
      VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11,
        now()
      )
      RETURNING id
    `, [
      event.tenantId, event.eventType, event.actorType, event.actorId,
      event.resourceType, event.resourceId, JSON.stringify(event.eventData), event.timestamp,
      event.previousHash, event.eventHash, event.chainSequence
    ]);

    return result.rows[0].id;
  }

  /**
   * Verify integrity of the audit chain
   */
  async verifyChainIntegrity(tenantId: string, fromSequence?: number): Promise<{
    intact: boolean;
    lastVerifiedSequence: number;
    brokenAt?: number;
    totalEvents: number;
  }> {
    const startSequence = fromSequence || 1;
    
    // Get events in sequence order
    const result = await this.client.query(`
      SELECT * FROM audit_chain_events
      WHERE tenant_id = $1 AND chain_sequence >= $2
      ORDER BY chain_sequence ASC
    `, [tenantId, startSequence]);

    const events = result.rows;
    if (events.length === 0) {
      return {
        intact: true,
        lastVerifiedSequence: 0,
        totalEvents: 0
      };
    }

    let lastHash = startSequence === 1 
      ? createHash('sha256').update(`genesis:${tenantId}`).digest('hex')
      : events[0].previous_hash;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const expectedHash = this.generateEventHash({
        eventType: event.event_type,
        actorType: event.actor_type,
        actorId: event.actor_id,
        resourceType: event.resource_type,
        resourceId: event.resource_id,
        tenantId: event.tenant_id,
        eventData: event.event_data,
        timestamp: event.timestamp,
        chainSequence: event.chain_sequence
      } as AuditEvent, lastHash);

      if (expectedHash !== event.event_hash) {
        return {
          intact: false,
          lastVerifiedSequence: i > 0 ? events[i-1].chain_sequence : 0,
          brokenAt: event.chain_sequence,
          totalEvents: events.length
        };
      }

      // Verify chain linkage
      if (i > 0 && event.previous_hash !== events[i-1].event_hash) {
        return {
          intact: false,
          lastVerifiedSequence: events[i-1].chain_sequence,
          brokenAt: event.chain_sequence,
          totalEvents: events.length
        };
      }

      lastHash = event.event_hash;
    }

    return {
      intact: true,
      lastVerifiedSequence: events[events.length - 1].chain_sequence,
      totalEvents: events.length
    };
  }

  /**
   * Get chain metadata for a tenant
   */
  async getChainMetadata(tenantId: string): Promise<ChainMetadata> {
    const lastState = await getLastChainState(tenantId);
    const verification = await this.verifyChainIntegrity(tenantId);

    return {
      tenantId,
      lastSequence: lastState.sequence,
      lastHash: lastState.hash,
      eventCount: verification.totalEvents,
      chainIntact: verification.intact,
      lastVerified: new Date()
    };
  }

  /**
   * Export audit chain for compliance/legal purposes
   */
  async exportChain(
    tenantId: string, 
    startDate?: Date, 
    endDate?: Date
  ): Promise<AuditEvent[]> {
    let query = `
      SELECT * FROM audit_chain_events
      WHERE tenant_id = $1
    `;
    const params = [tenantId];

    if (startDate) {
      query += ` AND timestamp >= $${params.length + 1}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND timestamp <= $${params.length + 1}`;
      params.push(endDate);
    }

    query += ` ORDER BY chain_sequence ASC`;

    const result = await this.client.query(query, params);
    
    return result.rows.map(row => ({
      id: row.id,
      eventType: row.event_type,
      actorType: row.actor_type,
      actorId: row.actor_id,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      tenantId: row.tenant_id,
      eventData: row.event_data,
      timestamp: row.timestamp,
      previousHash: row.previous_hash,
      eventHash: row.event_hash,
      chainSequence: row.chain_sequence
    }));
  }
}

// Singleton instance for the application
let chainManager: AuditChainManager | null = null;

export async function getAuditChain(): Promise<AuditChainManager> {
  if (!chainManager) {
    const { pool } = await import('../server/db');
    const client = pool;
    chainManager = new AuditChainManager(client);
  }
  return chainManager;
}

/**
 * Helper function to get the last chain state (used internally)
 */
async function getLastChainState(tenantId: string): Promise<{ sequence: number; hash: string }> {
  const chain = await getAuditChain();
  return (chain as any).getLastChainState(tenantId);
}