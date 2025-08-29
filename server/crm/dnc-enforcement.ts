/**
 * Do Not Contact (DNC) Enforcement Service
 * Handles email category-based DNC checks for CRM system
 */

import { db } from '../db';
import { communicationPreference, borrowerEntities, loans } from '@shared/schema';
import { eq, and, or } from 'drizzle-orm';
import { ConsentManagementService } from '../compliance/consentManagement';

export interface ContactRestriction {
  email: string;
  reason: string;
  category: 'transactional' | 'marketing';
  topic?: string;
}

export interface ContactCheckResult {
  allowed: boolean;
  restrictions: ContactRestriction[];
  category: 'transactional' | 'marketing';
}

export class DNCEnforcementService {
  private consentService = new ConsentManagementService();

  /**
   * Check contact restrictions for email list based on loan and email category
   */
  async checkContactRestrictions(
    loanId: number, 
    emailAddresses: string[],
    category: 'transactional' | 'marketing' = 'marketing',
    topic?: string
  ): Promise<ContactCheckResult> {
    const restrictions: ContactRestriction[] = [];

    // Get loan details to identify borrower
    const loanResult = await db
      .select({
        borrowerId: loans.borrowerId,
        borrowerEmail: borrowerEntities.email
      })
      .from(loans)
      .leftJoin(borrowerEntities, eq(loans.borrowerId, borrowerEntities.id))
      .where(eq(loans.id, loanId))
      .limit(1);

    if (loanResult.length === 0) {
      // If loan not found, block all emails as precautionary measure
      return {
        allowed: false,
        restrictions: emailAddresses.map(email => ({
          email,
          reason: 'Loan not found - precautionary DNC',
          category
        })),
        category
      };
    }

    const borrower = loanResult[0];

    // Check each email address
    for (const email of emailAddresses) {
      // Skip if email doesn't match borrower (could be internal users)
      if (email !== borrower.borrowerEmail) {
        continue;
      }

      // For transactional emails, only block if explicitly opted out
      if (category === 'transactional') {
        const isBlocked = await this.checkTransactionalBlock(
          borrower.borrowerId.toString(),
          'email',
          topic || 'loan_servicing'
        );

        if (isBlocked) {
          restrictions.push({
            email,
            reason: 'Explicit opt-out from transactional communications',
            category,
            topic
          });
        }
      } else {
        // For marketing emails, default to blocked unless explicitly allowed
        const isAllowed = await this.consentService.isCommunicationAllowed(
          borrower.borrowerId.toString(),
          'email',
          topic || 'marketing_general'
        );

        if (!isAllowed) {
          restrictions.push({
            email,
            reason: 'Marketing communications not permitted',
            category,
            topic
          });
        }
      }
    }

    return {
      allowed: restrictions.length === 0,
      restrictions,
      category
    };
  }

  /**
   * Check if transactional email is explicitly blocked
   * Transactional emails are allowed by default unless explicitly opted out
   */
  private async checkTransactionalBlock(
    subjectId: string,
    channel: string,
    topic: string
  ): Promise<boolean> {
    const preference = await db
      .select()
      .from(communicationPreference)
      .where(
        and(
          eq(communicationPreference.subjectId, subjectId),
          eq(communicationPreference.channel, channel),
          eq(communicationPreference.topic, topic)
        )
      )
      .limit(1);

    // If no preference exists, transactional is allowed
    // Only blocked if explicitly set to false
    return preference.length > 0 && !preference[0].allowed;
  }

  /**
   * Determine email category based on content and template
   */
  determineEmailCategory(
    subject: string,
    templateId?: string,
    variables?: Record<string, any>
  ): 'transactional' | 'marketing' {
    // Transactional email patterns
    const transactionalPatterns = [
      /payment.*due/i,
      /payment.*received/i,
      /payment.*failed/i,
      /statement/i,
      /escrow.*analysis/i,
      /insurance.*expir/i,
      /property.*tax/i,
      /loan.*maturity/i,
      /delinquent/i,
      /late.*fee/i,
      /account.*update/i,
      /document.*required/i,
      /verification/i,
      /compliance/i,
      /regulatory/i,
      /legal.*notice/i
    ];

    // Transactional template IDs
    const transactionalTemplateIds = [
      'payment_due_notice',
      'payment_received_confirmation', 
      'payment_failed_notice',
      'escrow_analysis',
      'insurance_expiration_notice',
      'property_tax_notice',
      'loan_maturity_notice',
      'delinquency_notice',
      'late_fee_assessment',
      'account_statement',
      'document_request',
      'verification_required',
      'compliance_notice',
      'legal_notice'
    ];

    // Check template ID first
    if (templateId && transactionalTemplateIds.includes(templateId)) {
      return 'transactional';
    }

    // Check subject line patterns
    for (const pattern of transactionalPatterns) {
      if (pattern.test(subject)) {
        return 'transactional';
      }
    }

    // Default to marketing for safety
    return 'marketing';
  }

  /**
   * Get appropriate topic based on email category and content
   */
  determineEmailTopic(
    category: 'transactional' | 'marketing',
    subject: string,
    templateId?: string
  ): string {
    if (category === 'transactional') {
      // Map to specific transactional topics
      if (/payment/i.test(subject) || templateId?.includes('payment')) {
        return 'payment_notifications';
      }
      if (/escrow/i.test(subject) || templateId?.includes('escrow')) {
        return 'escrow_notifications';
      }
      if (/insurance|tax/i.test(subject)) {
        return 'insurance_tax_notifications';
      }
      if (/delinquent|late/i.test(subject)) {
        return 'delinquency_notifications';
      }
      if (/document|verification/i.test(subject)) {
        return 'document_requests';
      }
      if (/legal|compliance/i.test(subject)) {
        return 'legal_compliance';
      }
      return 'loan_servicing'; // Default transactional topic
    } else {
      // Marketing topics
      if (/promotion|offer|deal/i.test(subject)) {
        return 'promotional_offers';
      }
      if (/newsletter|update/i.test(subject)) {
        return 'newsletters';
      }
      if (/survey|feedback/i.test(subject)) {
        return 'surveys';
      }
      return 'marketing_general'; // Default marketing topic
    }
  }

  /**
   * Enhanced contact restriction check with automatic categorization
   */
  async checkEmailRestrictions(
    loanId: number,
    emailAddresses: string[],
    subject: string,
    templateId?: string,
    variables?: Record<string, any>
  ): Promise<ContactCheckResult> {
    // Automatically determine category and topic
    const category = this.determineEmailCategory(subject, templateId, variables);
    const topic = this.determineEmailTopic(category, subject, templateId);

    return this.checkContactRestrictions(loanId, emailAddresses, category, topic);
  }
}

// Export singleton instance
export const dncEnforcementService = new DNCEnforcementService();

// Legacy function for backward compatibility with existing email routes
export async function checkContactRestrictions(
  loanId: number,
  emailAddresses: string[]
): Promise<ContactCheckResult> {
  return dncEnforcementService.checkContactRestrictions(loanId, emailAddresses, 'marketing');
}