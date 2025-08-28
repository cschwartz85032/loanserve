import { createHash } from 'crypto';
import { db } from '../db';
import { complianceAuditLog } from '@shared/schema';
import { desc, eq } from 'drizzle-orm';

export class HashChainService {
  /**
   * Generate SHA-256 hash of an object
   */
  private generateHash(data: any): string {
    const hash = createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }

  /**
   * Get the hash of the previous audit log entry
   */
  async getPreviousHash(): Promise<string | null> {
    const lastEntry = await db
      .select({ recordHash: complianceAuditLog.recordHash })
      .from(complianceAuditLog)
      .orderBy(desc(complianceAuditLog.id))
      .limit(1);
    
    return lastEntry.length > 0 ? lastEntry[0].recordHash : null;
  }

  /**
   * Create a new audit log entry with hash chain
   */
  async createAuditEntry(data: {
    correlationId: string;
    accountId?: string;
    actorType: 'user' | 'system' | 'integration';
    actorId?: string;
    eventType: string;
    resourceType: string;
    resourceId?: string;
    payloadJson: any;
    ipAddr?: string;
    userAgent?: string;
    geo?: any;
  }): Promise<void> {
    // Get previous hash for chain continuity
    const prevHash = await this.getPreviousHash();
    
    // Generate payload hash
    const payloadHash = this.generateHash(data.payloadJson);
    
    // Create record data for hashing
    const recordData = {
      correlationId: data.correlationId,
      actorType: data.actorType,
      actorId: data.actorId,
      eventType: data.eventType,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      payloadHash,
      prevHash,
      timestamp: new Date().toISOString()
    };
    
    // Generate record hash
    const recordHash = this.generateHash(recordData);
    
    // Insert audit log entry
    await db.insert(complianceAuditLog).values({
      correlationId: data.correlationId,
      accountId: data.accountId,
      actorType: data.actorType,
      actorId: data.actorId,
      eventType: data.eventType,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      payloadJson: data.payloadJson,
      payloadHash,
      prevHash,
      recordHash,
      ipAddr: data.ipAddr,
      userAgent: data.userAgent,
      geo: data.geo
    });
  }

  /**
   * Verify the integrity of the hash chain
   */
  async verifyChainIntegrity(startId?: number, endId?: number): Promise<{
    isValid: boolean;
    brokenLinks: Array<{ id: number; expected: string; actual: string }>;
  }> {
    const query = db
      .select()
      .from(complianceAuditLog)
      .orderBy(complianceAuditLog.id);
    
    const entries = await query;
    const brokenLinks: Array<{ id: number; expected: string; actual: string }> = [];
    
    for (let i = 1; i < entries.length; i++) {
      const current = entries[i];
      const previous = entries[i - 1];
      
      if (current.prevHash !== previous.recordHash) {
        brokenLinks.push({
          id: current.id,
          expected: previous.recordHash || '',
          actual: current.prevHash || ''
        });
      }
    }
    
    return {
      isValid: brokenLinks.length === 0,
      brokenLinks
    };
  }

  /**
   * Generate audit pack for a specific time range
   */
  async generateAuditPack(startDate: Date, endDate: Date): Promise<{
    entries: any[];
    chainValid: boolean;
    startHash: string | null;
    endHash: string | null;
    checksum: string;
  }> {
    const entries = await db
      .select()
      .from(complianceAuditLog)
      .where(
        eq(complianceAuditLog.eventTsUtc, startDate) // This would need proper date range query
      )
      .orderBy(complianceAuditLog.id);
    
    const startHash = entries.length > 0 ? entries[0].prevHash : null;
    const endHash = entries.length > 0 ? entries[entries.length - 1].recordHash : null;
    
    // Verify chain integrity for this range
    let chainValid = true;
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].prevHash !== entries[i - 1].recordHash) {
        chainValid = false;
        break;
      }
    }
    
    // Generate checksum of the entire pack
    const checksum = this.generateHash({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      entryCount: entries.length,
      startHash,
      endHash,
      entries: entries.map(e => e.recordHash)
    });
    
    return {
      entries,
      chainValid,
      startHash,
      endHash,
      checksum
    };
  }
}

export const hashChainService = new HashChainService();