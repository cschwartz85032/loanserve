/**
 * Wire Fraud Protection System
 * Implements multi-layer approval process for wire transfers
 */

import { DbContext } from "./abac";
import { redactPII } from "./pii-protection";

export interface WireTransferRequest {
  id?: string;
  loanId: string;
  amount: number;
  recipientName: string;
  recipientBank: string;
  recipientAccount: string;
  recipientRouting: string;
  purpose: string;
  requestedBy: string;
  requestedAt?: Date;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'cancelled';
  approvals: WireApproval[];
  riskScore?: number;
  riskFlags?: string[];
}

export interface WireApproval {
  approverSub: string;
  approverRole: string;
  action: 'approve' | 'reject';
  reason?: string;
  approvedAt: Date;
  ipAddress: string;
  userAgent: string;
}

export interface WireRiskAssessment {
  score: number; // 0-100, higher is riskier
  flags: string[];
  requiresAdditionalApproval: boolean;
}

/**
 * Wire Transfer Risk Engine
 */
export class WireRiskEngine {
  /**
   * Assess risk factors for wire transfer request
   */
  static assessRisk(request: WireTransferRequest, loanData: any): WireRiskAssessment {
    const flags: string[] = [];
    let score = 0;

    // Amount-based risk
    if (request.amount > 50000) {
      flags.push("HIGH_AMOUNT");
      score += 25;
    }
    if (request.amount > 100000) {
      flags.push("VERY_HIGH_AMOUNT");
      score += 25;
    }

    // Recipient analysis
    if (!request.recipientName || request.recipientName.length < 3) {
      flags.push("INVALID_RECIPIENT_NAME");
      score += 30;
    }

    // Bank validation
    if (!request.recipientRouting || !/^\d{9}$/.test(request.recipientRouting)) {
      flags.push("INVALID_ROUTING_NUMBER");
      score += 40;
    }

    // Account validation
    if (!request.recipientAccount || request.recipientAccount.length < 4) {
      flags.push("INVALID_ACCOUNT_NUMBER");
      score += 40;
    }

    // Time-based risk (outside business hours)
    const hour = new Date().getHours();
    if (hour < 9 || hour > 17) {
      flags.push("OFF_HOURS_REQUEST");
      score += 15;
    }

    // Frequency check (would require database lookup in real implementation)
    // This is a simplified version
    if (request.purpose?.toLowerCase().includes('urgent')) {
      flags.push("URGENT_REQUEST");
      score += 10;
    }

    // Known fraud patterns
    const fraudKeywords = ['lottery', 'prince', 'inheritance', 'tax refund', 'prize'];
    const purpose = request.purpose?.toLowerCase() || '';
    if (fraudKeywords.some(keyword => purpose.includes(keyword))) {
      flags.push("FRAUD_KEYWORDS");
      score += 50;
    }

    return {
      score: Math.min(100, score),
      flags,
      requiresAdditionalApproval: score > 50 || flags.includes("VERY_HIGH_AMOUNT")
    };
  }
}

/**
 * Wire Transfer Service
 */
export class WireTransferService {
  private client: any;
  private context: DbContext;

  constructor(client: any, context: DbContext) {
    this.client = client;
    this.context = context;
  }

  /**
   * Submit wire transfer request
   */
  async submitRequest(request: WireTransferRequest): Promise<string> {
    // Risk assessment
    const riskAssessment = WireRiskEngine.assessRisk(request, null);
    
    // Insert wire transfer request
    const result = await this.client.query(`
      INSERT INTO wire_transfer_requests (
        id, tenant_id, loan_id, amount, 
        recipient_name, recipient_bank, recipient_account, recipient_routing,
        purpose, requested_by, status, risk_score, risk_flags,
        created_at
      )
      VALUES (
        gen_random_uuid(), $1, $2, $3,
        $4, $5, $6, $7,
        $8, $9, 'pending', $10, $11,
        now()
      )
      RETURNING id
    `, [
      this.context.tenantId,
      request.loanId,
      request.amount,
      request.recipientName,
      request.recipientBank,
      request.recipientAccount,
      request.recipientRouting,
      request.purpose,
      request.requestedBy,
      riskAssessment.score,
      riskAssessment.flags
    ]);

    const wireId = result.rows[0].id;

    // Create audit log
    await this.auditWireAction(wireId, 'WIRE_REQUESTED', {
      amount: request.amount,
      recipient: request.recipientName,
      riskScore: riskAssessment.score,
      flags: riskAssessment.flags
    });

    // Auto-reject high-risk transfers
    if (riskAssessment.score > 80) {
      await this.rejectTransfer(wireId, 'system', 'Automatic rejection due to high risk score');
    }

    return wireId;
  }

  /**
   * Approve wire transfer
   */
  async approveTransfer(
    wireId: string,
    approverSub: string,
    approverRole: string,
    reason?: string,
    ipAddress: string = '',
    userAgent: string = ''
  ): Promise<boolean> {
    const approval: WireApproval = {
      approverSub,
      approverRole,
      action: 'approve',
      reason,
      approvedAt: new Date(),
      ipAddress,
      userAgent
    };

    // Record approval
    await this.client.query(`
      INSERT INTO wire_transfer_approvals (
        wire_id, approver_sub, approver_role, action, reason,
        ip_address, user_agent, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, now())
    `, [
      wireId, approval.approverSub, approval.approverRole, approval.action,
      approval.reason, approval.ipAddress, approval.userAgent
    ]);

    // Check if enough approvals
    const approvalCount = await this.getApprovalCount(wireId);
    const requiredApprovals = await this.getRequiredApprovals(wireId);

    if (approvalCount >= requiredApprovals) {
      await this.client.query(`
        UPDATE wire_transfer_requests 
        SET status = 'approved', approved_at = now()
        WHERE id = $1
      `, [wireId]);

      await this.auditWireAction(wireId, 'WIRE_APPROVED', {
        approver: approverSub,
        totalApprovals: approvalCount
      });

      return true;
    }

    await this.auditWireAction(wireId, 'WIRE_APPROVAL_RECORDED', {
      approver: approverSub,
      approvalsReceived: approvalCount,
      approvalsRequired: requiredApprovals
    });

    return false;
  }

  /**
   * Reject wire transfer
   */
  async rejectTransfer(
    wireId: string,
    approverSub: string,
    reason: string,
    ipAddress: string = '',
    userAgent: string = ''
  ): Promise<void> {
    await this.client.query(`
      INSERT INTO wire_transfer_approvals (
        wire_id, approver_sub, approver_role, action, reason,
        ip_address, user_agent, created_at
      )
      VALUES ($1, $2, 'system', 'reject', $3, $4, $5, now())
    `, [wireId, approverSub, reason, ipAddress, userAgent]);

    await this.client.query(`
      UPDATE wire_transfer_requests 
      SET status = 'rejected', rejected_at = now()
      WHERE id = $1
    `, [wireId]);

    await this.auditWireAction(wireId, 'WIRE_REJECTED', {
      rejectedBy: approverSub,
      reason
    });
  }

  /**
   * Get wire transfer details with redacted PII for logs
   */
  async getWireTransfer(wireId: string, includePII: boolean = false): Promise<WireTransferRequest | null> {
    const result = await this.client.query(`
      SELECT * FROM wire_transfer_requests
      WHERE id = $1 AND tenant_id = $2
    `, [wireId, this.context.tenantId]);

    if (result.rows.length === 0) {
      return null;
    }

    const wire = result.rows[0];
    
    if (!includePII) {
      // Redact sensitive information for audit logs
      wire.recipient_account = `***${wire.recipient_account?.slice(-4) || ''}`;
      wire.recipient_routing = `***${wire.recipient_routing?.slice(-4) || ''}`;
    }

    return {
      id: wire.id,
      loanId: wire.loan_id,
      amount: parseFloat(wire.amount),
      recipientName: wire.recipient_name,
      recipientBank: wire.recipient_bank,
      recipientAccount: wire.recipient_account,
      recipientRouting: wire.recipient_routing,
      purpose: wire.purpose,
      requestedBy: wire.requested_by,
      requestedAt: wire.created_at,
      status: wire.status,
      approvals: [], // Would load separately
      riskScore: wire.risk_score,
      riskFlags: wire.risk_flags || []
    };
  }

  private async getApprovalCount(wireId: string): Promise<number> {
    const result = await this.client.query(`
      SELECT COUNT(*) as count
      FROM wire_transfer_approvals
      WHERE wire_id = $1 AND action = 'approve'
    `, [wireId]);
    
    return parseInt(result.rows[0].count);
  }

  private async getRequiredApprovals(wireId: string): Promise<number> {
    const wire = await this.client.query(`
      SELECT amount, risk_score FROM wire_transfer_requests
      WHERE id = $1
    `, [wireId]);
    
    const amount = parseFloat(wire.rows[0].amount);
    const riskScore = wire.rows[0].risk_score;
    
    // Approval matrix based on amount and risk
    if (amount > 100000 || riskScore > 70) return 2; // Two approvals
    if (amount > 25000 || riskScore > 40) return 1;   // One approval
    return 0; // Auto-approve low risk/amount
  }

  private async auditWireAction(wireId: string, action: string, details: any): Promise<void> {
    const { auditLogger } = await import('../audit/audit-logger');
    
    await auditLogger.logEvent({
      eventType: action,
      actorType: 'user',
      actorId: this.context.userSub,
      resourceType: 'wire_transfer',
      resourceId: wireId,
      tenantId: this.context.tenantId,
      eventData: redactPII(details),
      timestamp: new Date()
    });
  }
}