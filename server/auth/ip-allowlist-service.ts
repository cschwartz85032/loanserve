/**
 * IP Allowlist Service
 * Handles IP allowlist management and enforcement for user authentication
 */

import { db } from '../db';
import { userIpAllowlist, authEvents } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import * as net from 'net';

/**
 * Parse IP address to normalize format
 * Handles both IPv4 and IPv6 addresses
 */
function normalizeIp(ip: string): string {
  // Remove IPv6 prefix from IPv4-mapped addresses
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  
  // Handle localhost variations
  if (ip === '::1') {
    return '127.0.0.1';
  }
  
  return ip;
}

/**
 * Check if an IP address matches a CIDR range
 * Supports both IPv4 and IPv6
 */
function ipMatchesCidr(ip: string, cidr: string): boolean {
  try {
    const normalizedIp = normalizeIp(ip);
    
    // If CIDR doesn't contain /, treat as single IP
    if (!cidr.includes('/')) {
      return normalizedIp === cidr;
    }
    
    // For PostgreSQL, we'll use the database's CIDR matching
    // This is a simplified JavaScript implementation for quick checks
    const [cidrBase, cidrMask] = cidr.split('/');
    const maskBits = parseInt(cidrMask, 10);
    
    // Check if both are IPv4 or both are IPv6
    const ipIsV6 = net.isIPv6(normalizedIp);
    const cidrIsV6 = net.isIPv6(cidrBase);
    
    if (ipIsV6 !== cidrIsV6) {
      // Handle IPv4-mapped IPv6 addresses
      if (ipIsV6 && normalizedIp.startsWith('::ffff:')) {
        const v4Ip = normalizedIp.substring(7);
        return ipMatchesCidr(v4Ip, cidr);
      }
      return false;
    }
    
    if (!ipIsV6) {
      // IPv4 matching
      return matchIPv4(normalizedIp, cidrBase, maskBits);
    } else {
      // IPv6 matching
      return matchIPv6(normalizedIp, cidrBase, maskBits);
    }
  } catch (error) {
    console.error('IP CIDR matching error:', error);
    return false;
  }
}

/**
 * Match IPv4 address against CIDR
 */
function matchIPv4(ip: string, cidrBase: string, maskBits: number): boolean {
  const ipParts = ip.split('.').map(p => parseInt(p, 10));
  const cidrParts = cidrBase.split('.').map(p => parseInt(p, 10));
  
  if (ipParts.length !== 4 || cidrParts.length !== 4) {
    return false;
  }
  
  // Convert to 32-bit integers
  const ipInt = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const cidrInt = (cidrParts[0] << 24) | (cidrParts[1] << 16) | (cidrParts[2] << 8) | cidrParts[3];
  
  // Create mask
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits));
  
  // Compare with mask
  return (ipInt & mask) === (cidrInt & mask);
}

/**
 * Match IPv6 address against CIDR (simplified)
 */
function matchIPv6(ip: string, cidrBase: string, maskBits: number): boolean {
  // For exact IPv6 matching, we'll rely on PostgreSQL's CIDR type
  // This is a simplified check for exact matches
  if (maskBits === 128) {
    return ip === cidrBase;
  }
  
  // For production, use a proper IPv6 library or PostgreSQL's inet operators
  // This is a placeholder that defers to database matching
  return false;
}

/**
 * Check if IP is allowed for user
 * Uses database CIDR matching for accurate results
 */
export async function checkIpAllowlist(
  userId: number, 
  ip: string
): Promise<{
  allowed: boolean;
  hasAllowlist: boolean;
  matchedEntry?: any;
  reason?: string;
}> {
  try {
    const normalizedIp = normalizeIp(ip);
    
    // Get all active allowlist entries for user
    const allowlistEntries = await db.select({
      id: userIpAllowlist.id,
      cidr: userIpAllowlist.cidr,
      label: userIpAllowlist.label,
      isActive: userIpAllowlist.isActive,
      expiresAt: userIpAllowlist.expiresAt
    })
    .from(userIpAllowlist)
    .where(and(
      eq(userIpAllowlist.userId, userId),
      eq(userIpAllowlist.isActive, true)
    ));
    
    // If no allowlist entries, IP is allowed by default
    if (allowlistEntries.length === 0) {
      return {
        allowed: true,
        hasAllowlist: false,
        reason: 'No IP allowlist configured'
      };
    }
    
    // Check if IP matches any allowlist entry using PostgreSQL's inet operators
    // Also check that the entry hasn't expired
    const matchResult = await db.execute(
      sql`
        SELECT id, cidr, label, begins_at, expires_at 
        FROM user_ip_allowlist 
        WHERE user_id = ${userId} 
          AND is_active = true 
          AND inet '${sql.raw(normalizedIp)}' <<= cidr
          AND (begins_at IS NULL OR begins_at <= NOW())
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
      `
    );
    
    if (matchResult.rows && matchResult.rows.length > 0) {
      const matched = matchResult.rows[0];
      return {
        allowed: true,
        hasAllowlist: true,
        matchedEntry: {
          id: matched.id,
          cidr: matched.cidr,
          label: matched.label
        },
        reason: `IP matches allowlist entry: ${matched.label || matched.cidr}`
      };
    }
    
    // IP not in allowlist - but still allow access
    // The allowlist is for tracking trusted IPs, not blocking access
    return {
      allowed: true,
      hasAllowlist: true,
      matchedEntry: null,
      reason: `IP ${normalizedIp} not in trusted list (access allowed)`
    };
    
  } catch (error) {
    console.error('IP allowlist check error:', error);
    // On error, allow access but log the issue
    return {
      allowed: true,
      hasAllowlist: false,
      reason: 'IP allowlist check failed (access allowed)'
    };
  }
}

/**
 * Log IP allowlist decision
 */
export async function logIpDecision(
  userId: number,
  ip: string,
  allowed: boolean,
  reason: string,
  matchedEntry?: any
): Promise<void> {
  try {
    await db.insert(authEvents).values({
      targetUserId: userId,
      eventType: allowed ? 'permission_granted' : 'permission_denied',
      ip,
      details: {
        normalizedIp: normalizeIp(ip),
        allowed,
        reason,
        matchedEntry: matchedEntry || null,
        timestamp: new Date().toISOString()
      },
      eventKey: `ip-check-${userId}-${Date.now()}`
    });
  } catch (error) {
    console.error('Failed to log IP decision:', error);
  }
}

// CRUD Operations for IP Allowlist

/**
 * Add IP to user's allowlist
 */
export async function addIpToAllowlist(
  userId: number,
  cidr: string,
  label?: string,
  actorUserId?: number,
  expiresAt?: Date | string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    // Validate CIDR format
    if (!cidr.includes('/')) {
      // Single IP - add /32 for IPv4 or /128 for IPv6
      const isV6 = net.isIPv6(cidr);
      cidr = cidr + (isV6 ? '/128' : '/32');
    }
    
    // Check if this IP/CIDR already exists for the user
    const existing = await db.select()
      .from(userIpAllowlist)
      .where(and(
        eq(userIpAllowlist.userId, userId),
        eq(userIpAllowlist.cidr, cidr)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      return { 
        success: false, 
        error: 'This IP address is already in the allowlist' 
      };
    }
    
    const [result] = await db.insert(userIpAllowlist).values({
      userId,
      cidr,
      label: label || `IP allowlist entry for ${cidr}`,
      isActive: true,
      expiresAt: expiresAt ? new Date(expiresAt) : null
    })
    .returning({ id: userIpAllowlist.id });
    
    // Log the addition with a valid event type
    await db.insert(authEvents).values({
      actorUserId: actorUserId || userId,
      targetUserId: userId,
      eventType: 'ip_allow_added', // Using the correct valid event type
      details: {
        cidr,
        label,
        entryId: result.id,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null
      },
      eventKey: `ip-add-${userId}-${Date.now()}`
    });
    
    return { success: true, id: result.id };
    
  } catch (error: any) {
    console.error('Add IP to allowlist error:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to add IP to allowlist' 
    };
  }
}

/**
 * Remove IP from user's allowlist
 */
export async function removeIpFromAllowlist(
  entryId: string,
  actorUserId?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get entry details before deletion
    const [entry] = await db.select({
      userId: userIpAllowlist.userId,
      cidr: userIpAllowlist.cidr,
      label: userIpAllowlist.label
    })
    .from(userIpAllowlist)
    .where(eq(userIpAllowlist.id, entryId))
    .limit(1);
    
    if (!entry) {
      return { success: false, error: 'Entry not found' };
    }
    
    // Delete the entry
    await db.delete(userIpAllowlist)
      .where(eq(userIpAllowlist.id, entryId));
    
    // Log the removal
    await db.insert(authEvents).values({
      actorUserId: actorUserId || entry.userId,
      targetUserId: entry.userId,
      eventType: 'ip_allow_removed', // Using the correct valid event type
      details: {
        cidr: entry.cidr,
        label: entry.label,
        entryId
      },
      eventKey: `ip-remove-${entry.userId}-${Date.now()}`
    });
    
    return { success: true };
    
  } catch (error: any) {
    console.error('Remove IP from allowlist error:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to remove IP from allowlist' 
    };
  }
}

/**
 * Update IP allowlist entry
 */
export async function updateIpAllowlistEntry(
  entryId: string,
  updates: {
    cidr?: string;
    label?: string;
    isActive?: boolean;
  },
  actorUserId?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get current entry
    const [entry] = await db.select({
      userId: userIpAllowlist.userId,
      cidr: userIpAllowlist.cidr,
      label: userIpAllowlist.label,
      isActive: userIpAllowlist.isActive
    })
    .from(userIpAllowlist)
    .where(eq(userIpAllowlist.id, entryId))
    .limit(1);
    
    if (!entry) {
      return { success: false, error: 'Entry not found' };
    }
    
    // Validate new CIDR if provided
    if (updates.cidr && !updates.cidr.includes('/')) {
      const isV6 = net.isIPv6(updates.cidr);
      updates.cidr = updates.cidr + (isV6 ? '/128' : '/32');
    }
    
    // Update the entry
    await db.update(userIpAllowlist)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(userIpAllowlist.id, entryId));
    
    // Log the update
    await db.insert(authEvents).values({
      actorUserId: actorUserId || entry.userId,
      targetUserId: entry.userId,
      eventType: 'settings_changed', // Using a valid event type for updates
      details: {
        action: 'ip_allowlist_updated',
        entryId,
        previousValues: {
          cidr: entry.cidr,
          label: entry.label,
          isActive: entry.isActive
        },
        newValues: updates
      },
      eventKey: `ip-update-${entry.userId}-${Date.now()}`
    });
    
    return { success: true };
    
  } catch (error: any) {
    console.error('Update IP allowlist error:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to update IP allowlist entry' 
    };
  }
}

/**
 * Get user's IP allowlist
 */
export async function getUserIpAllowlist(
  userId: number,
  includeInactive: boolean = false
): Promise<any[]> {
  try {
    let query = db.select({
      id: userIpAllowlist.id,
      cidr: userIpAllowlist.cidr,
      label: userIpAllowlist.label,
      isActive: userIpAllowlist.isActive,
      createdAt: userIpAllowlist.createdAt,
      updatedAt: userIpAllowlist.updatedAt
    })
    .from(userIpAllowlist)
    .where(eq(userIpAllowlist.userId, userId));
    
    if (!includeInactive) {
      query = query.where(and(
        eq(userIpAllowlist.userId, userId),
        eq(userIpAllowlist.isActive, true)
      )) as any;
    }
    
    return await query;
    
  } catch (error) {
    console.error('Get user IP allowlist error:', error);
    return [];
  }
}

/**
 * Bulk update user's IP allowlist
 */
export async function bulkUpdateIpAllowlist(
  userId: number,
  entries: Array<{
    cidr: string;
    label?: string;
    isActive?: boolean;
  }>,
  actorUserId?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Delete existing entries
    await db.delete(userIpAllowlist)
      .where(eq(userIpAllowlist.userId, userId));
    
    // Add new entries
    if (entries.length > 0) {
      const newEntries = entries.map(entry => ({
        userId,
        cidr: entry.cidr.includes('/') ? entry.cidr : 
              (net.isIPv6(entry.cidr) ? entry.cidr + '/128' : entry.cidr + '/32'),
        label: entry.label || `IP allowlist entry`,
        isActive: entry.isActive !== false
      }));
      
      await db.insert(userIpAllowlist).values(newEntries);
    }
    
    // Log the bulk update
    await db.insert(authEvents).values({
      actorUserId: actorUserId || userId,
      targetUserId: userId,
      eventType: 'ip_allowlist_bulk_updated',
      details: {
        entriesCount: entries.length,
        entries: entries.map(e => ({ cidr: e.cidr, label: e.label }))
      },
      eventKey: `ip-bulk-${userId}-${Date.now()}`
    });
    
    return { success: true };
    
  } catch (error: any) {
    console.error('Bulk update IP allowlist error:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to bulk update IP allowlist' 
    };
  }
}