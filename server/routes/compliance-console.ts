import { Router } from 'express';
import { db } from '../db';
import { 
  complianceAuditLog, 
  retentionPolicy, 
  legalHold, 
  deletionReceipt 
} from '@shared/schema';
import { 
  eq, 
  desc, 
  and, 
  gte, 
  lte, 
  or, 
  like, 
  sql,
  count,
  isNull 
} from 'drizzle-orm';
import { complianceAudit } from '../compliance/auditService';
import { hashChainService } from '../compliance/hashChain';
import { retentionPolicyService } from '../compliance/retentionPolicy';
import { parse, startOfDay, endOfDay, subDays } from 'date-fns';

const router = Router();

/**
 * GET /api/compliance/dashboard - Get compliance dashboard metrics
 */
router.get('/dashboard', async (req: any, res) => {
  try {
    const userId = req.user?.id || (req.session as any)?.userId;

    // Get today's date range
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const last30DaysStart = startOfDay(subDays(new Date(), 30));

    // Get compliance metrics
    const [
      totalEvents,
      todayEvents,
      criticalEvents,
      activeHolds,
      retentionPolicies,
      recentDeletions
    ] = await Promise.all([
      // Total events in last 30 days
      db.select({ count: count() })
        .from(complianceAuditLog)
        .where(gte(complianceAuditLog.createdAt, last30DaysStart))
        .then(r => r[0]?.count || 0),
      
      // Today's events
      db.select({ count: count() })
        .from(complianceAuditLog)
        .where(
          and(
            gte(complianceAuditLog.createdAt, todayStart),
            lte(complianceAuditLog.createdAt, todayEnd)
          )
        )
        .then(r => r[0]?.count || 0),
      
      // Critical events (security, compliance, errors)
      db.select({ count: count() })
        .from(complianceAuditLog)
        .where(
          and(
            gte(complianceAuditLog.createdAt, last30DaysStart),
            or(
              like(complianceAuditLog.eventType, 'SECURITY.%'),
              like(complianceAuditLog.eventType, 'COMPLIANCE.%'),
              like(complianceAuditLog.eventType, 'ERROR.%')
            )
          )
        )
        .then(r => r[0]?.count || 0),
      
      // Active legal holds
      db.select({ count: count() })
        .from(legalHold)
        .where(eq(legalHold.active, true))
        .then(r => r[0]?.count || 0),
      
      // Active retention policies
      db.select({ count: count() })
        .from(retentionPolicy)
        .then(r => r[0]?.count || 0),
      
      // Recent deletions (last 7 days)
      db.select({ count: count() })
        .from(deletionReceipt)
        .where(gte(deletionReceipt.deletedAtUtc, subDays(new Date(), 7)))
        .then(r => r[0]?.count || 0)
    ]);

    // Verify hash chain integrity
    const chainIntegrity = await hashChainService.verifyChainIntegrity();

    // Calculate compliance score
    const complianceScore = calculateComplianceScore({
      chainValid: chainIntegrity.isValid,
      criticalEventsRatio: totalEvents > 0 ? (criticalEvents / totalEvents) : 0,
      hasRetentionPolicies: retentionPolicies > 0
    });

    // Log dashboard access
    await complianceAudit.logEvent({
      eventType: 'COMPLIANCE.DASHBOARD_ACCESSED',
      actorType: 'user',
      actorId: userId?.toString(),
      resourceType: 'compliance_dashboard',
      details: {
        action: 'view_dashboard',
        userId
      } as any,
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      metrics: {
        complianceScore,
        totalEvents,
        todayEvents,
        criticalEvents,
        activeHolds,
        retentionPolicies,
        recentDeletions,
        chainIntegrity: {
          valid: chainIntegrity.isValid,
          brokenLinks: chainIntegrity.brokenLinks.length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching compliance dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch compliance dashboard' });
  }
});

/**
 * GET /api/compliance/audit-logs - Get compliance audit logs with filtering
 */
router.get('/audit-logs', async (req: any, res) => {
  try {
    const userId = req.user?.id || (req.session as any)?.userId;
    const { 
      page = 1, 
      limit = 50,
      eventType,
      actorType,
      resourceType,
      startDate,
      endDate,
      search
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);
    let query: any = db.select().from(complianceAuditLog);

    // Build where conditions
    const conditions = [];

    if (eventType) {
      conditions.push(like(complianceAuditLog.eventType, `${eventType}%`));
    }

    if (actorType) {
      conditions.push(eq(complianceAuditLog.actorType, actorType));
    }

    if (resourceType) {
      conditions.push(eq(complianceAuditLog.resourceType, resourceType));
    }

    if (startDate) {
      conditions.push(gte(complianceAuditLog.createdAt, new Date(startDate)));
    }

    if (endDate) {
      conditions.push(lte(complianceAuditLog.createdAt, new Date(endDate)));
    }

    if (search) {
      conditions.push(
        or(
          like(complianceAuditLog.actorId, `%${search}%`),
          like(complianceAuditLog.resourceId, `%${search}%`),
          like(complianceAuditLog.correlationId, `%${search}%`)
        )
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Get total count for pagination
    const totalQuery = db.select({ count: count() }).from(complianceAuditLog);
    if (conditions.length > 0) {
      totalQuery.where(and(...conditions));
    }
    const totalResult = await totalQuery;
    const total = totalResult[0]?.count || 0;

    // Get paginated results
    const logs = await query
      .orderBy(desc(complianceAuditLog.createdAt))
      .limit(Number(limit))
      .offset(offset);

    // Log audit log access
    await complianceAudit.logEvent({
      eventType: 'COMPLIANCE.AUDIT_ACCESSED',
      actorType: 'user',
      actorId: userId?.toString(),
      resourceType: 'audit_logs',
      details: {
        action: 'view_audit_logs',
        filters: { eventType, actorType, resourceType, startDate, endDate },
        userId
      } as any,
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      logs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

/**
 * GET /api/compliance/event-types - Get unique event types for filtering
 */
router.get('/event-types', async (req, res) => {
  try {
    const eventTypes = await db
      .selectDistinct({ eventType: complianceAuditLog.eventType })
      .from(complianceAuditLog)
      .orderBy(complianceAuditLog.eventType);

    // Group event types by category
    const grouped = eventTypes.reduce((acc, { eventType }) => {
      const [category] = eventType.split('.');
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(eventType);
      return acc;
    }, {} as Record<string, string[]>);

    res.json({ eventTypes: grouped });
  } catch (error) {
    console.error('Error fetching event types:', error);
    res.status(500).json({ error: 'Failed to fetch event types' });
  }
});

/**
 * GET /api/compliance/chain-integrity - Verify hash chain integrity
 */
router.get('/chain-integrity', async (req: any, res) => {
  try {
    const userId = req.user?.id || (req.session as any)?.userId;
    const { startId, endId } = req.query;

    const integrity = await hashChainService.verifyChainIntegrity(
      startId ? Number(startId) : undefined,
      endId ? Number(endId) : undefined
    );

    // Log integrity check
    await complianceAudit.logEvent({
      eventType: 'COMPLIANCE.INTEGRITY_CHECKED',
      actorType: 'user',
      actorId: userId?.toString(),
      resourceType: 'hash_chain',
      details: {
        action: 'verify_integrity',
        result: integrity.isValid,
        brokenLinks: integrity.brokenLinks.length,
        userId
      } as any,
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json(integrity);
  } catch (error) {
    console.error('Error verifying chain integrity:', error);
    res.status(500).json({ error: 'Failed to verify chain integrity' });
  }
});

/**
 * POST /api/compliance/audit-pack - Generate audit pack for date range
 */
router.post('/audit-pack', async (req: any, res) => {
  try {
    const userId = req.user?.id || (req.session as any)?.userId;
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const auditPack = await hashChainService.generateAuditPack(
      new Date(startDate),
      new Date(endDate)
    );

    // Log audit pack generation
    await complianceAudit.logEvent({
      eventType: 'COMPLIANCE.AUDIT_PACK_GENERATED',
      actorType: 'user',
      actorId: userId?.toString(),
      resourceType: 'audit_pack',
      details: {
        action: 'generate_audit_pack',
        startDate,
        endDate,
        entriesCount: auditPack.entries.length,
        userId
      } as any,
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json(auditPack);
  } catch (error) {
    console.error('Error generating audit pack:', error);
    res.status(500).json({ error: 'Failed to generate audit pack' });
  }
});

/**
 * GET /api/compliance/retention-policies - Get retention policies
 */
router.get('/retention-policies', async (req, res) => {
  try {
    const policies = await db
      .select()
      .from(retentionPolicy)
      .orderBy(retentionPolicy.dataClass);

    res.json({ policies });
  } catch (error) {
    console.error('Error fetching retention policies:', error);
    res.status(500).json({ error: 'Failed to fetch retention policies' });
  }
});

/**
 * GET /api/compliance/legal-holds - Get legal holds
 */
router.get('/legal-holds', async (req, res) => {
  try {
    const { active } = req.query;

    let query: any = db.select().from(legalHold);
    
    if (active !== undefined) {
      query = query.where(eq(legalHold.active, active === 'true'));
    }

    const holds = await query.orderBy(desc(legalHold.createdAt));

    res.json({ holds });
  } catch (error) {
    console.error('Error fetching legal holds:', error);
    res.status(500).json({ error: 'Failed to fetch legal holds' });
  }
});

/**
 * GET /api/compliance/deletion-receipts - Get deletion receipts
 */
router.get('/deletion-receipts', async (req, res) => {
  try {
    const { limit = 100 } = req.query;

    const receipts = await db
      .select()
      .from(deletionReceipt)
      .orderBy(desc(deletionReceipt.deletedAtUtc))
      .limit(Number(limit));

    res.json({ receipts });
  } catch (error) {
    console.error('Error fetching deletion receipts:', error);
    res.status(500).json({ error: 'Failed to fetch deletion receipts' });
  }
});

/**
 * GET /api/compliance/activity-timeline - Get activity timeline
 */
router.get('/activity-timeline', async (req: any, res) => {
  try {
    const { hours = 24 } = req.query;
    const startTime = subDays(new Date(), Number(hours) / 24);

    // Get events grouped by hour
    const timeline = await db
      .select({
        hour: sql<string>`DATE_TRUNC('hour', ${complianceAuditLog.createdAt})`,
        eventCount: count(),
        criticalCount: sql<number>`COUNT(CASE WHEN ${complianceAuditLog.eventType} LIKE 'SECURITY.%' OR ${complianceAuditLog.eventType} LIKE 'ERROR.%' THEN 1 END)`
      })
      .from(complianceAuditLog)
      .where(gte(complianceAuditLog.createdAt, startTime))
      .groupBy(sql`DATE_TRUNC('hour', ${complianceAuditLog.createdAt})`)
      .orderBy(sql`DATE_TRUNC('hour', ${complianceAuditLog.createdAt})`);

    res.json({ timeline });
  } catch (error) {
    console.error('Error fetching activity timeline:', error);
    res.status(500).json({ error: 'Failed to fetch activity timeline' });
  }
});

/**
 * Helper function to calculate compliance score
 */
function calculateComplianceScore(params: {
  chainValid: boolean;
  criticalEventsRatio: number;
  hasRetentionPolicies: boolean;
}): number {
  let score = 100;

  // Deduct for invalid chain
  if (!params.chainValid) {
    score -= 30;
  }

  // Deduct for high critical events ratio
  if (params.criticalEventsRatio > 0.1) {
    score -= Math.min(20, params.criticalEventsRatio * 100);
  }

  // Deduct for missing retention policies
  if (!params.hasRetentionPolicies) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

export default router;