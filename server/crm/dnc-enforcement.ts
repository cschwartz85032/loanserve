/**
 * Do Not Contact (DNC) Enforcement Service
 * Handles email category-based DNC checks for CRM system
 */

import { db } from '../db';
import { communicationPreference, borrowerEntities, loans } from '@shared/schema';
import { eq, and, or } from 'drizzle-orm';
import { ConsentManagementService } from '../compliance/consentManagement';
import { aiEmailClassifier } from './ai-email-classifier';

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

      // Transactional emails CANNOT be blocked - they are required business communications
      if (category === 'transactional') {
        // Skip - transactional emails are always allowed
        continue;
      } else {
        // For marketing emails, default to blocked unless explicitly allowed
        const isAllowed = await this.consentService.isCommunicationAllowed(
          borrower.borrowerId?.toString() || '0',
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
   * Determine email category using AI classification
   */
  async determineEmailCategory(
    subject: string,
    templateId?: string,
    variables?: Record<string, any>
  ): Promise<{ category: 'transactional' | 'marketing'; topic: string }> {
    try {
      const classification = await aiEmailClassifier.classifyEmail(
        subject,
        templateId,
        variables
      );

      const redactedSubject = this.redactEmailFromString(subject);
      console.log(`[DNCEnforcement] AI classified email "${redactedSubject}" as ${classification.category} (confidence: ${classification.confidence})`);
      
      return {
        category: classification.category,
        topic: classification.topic
      };
    } catch (error) {
      console.error('[DNCEnforcement] AI classification failed, using fallback:', this.redactEmailFromError(error));
      
      // Fallback to conservative classification
      return {
        category: 'transactional', // Default to transactional for safety
        topic: 'loan_servicing'
      };
    }
  }


  /**
   * Enhanced contact restriction check with AI categorization
   */
  async checkEmailRestrictions(
    loanId: number,
    emailAddresses: string[],
    subject: string,
    templateId?: string,
    variables?: Record<string, any>
  ): Promise<ContactCheckResult> {
    // Use AI to determine category and topic
    const { category, topic } = await this.determineEmailCategory(subject, templateId, variables);

    return this.checkContactRestrictions(loanId, emailAddresses, category, topic);
  }

  /**
   * Redact email addresses from strings for privacy in logs
   */
  private redactEmailFromString(text: string): string {
    return text.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      (match) => {
        const [local, domain] = match.split('@');
        const redactedLocal = local.length > 2 ? 
          local.substring(0, 2) + '***' : 
          '***';
        return `${redactedLocal}@${domain}`;
      }
    );
  }

  /**
   * Redact email addresses from error objects for privacy
   */
  private redactEmailFromError(error: any): any {
    if (!error || typeof error !== 'object') return error;
    
    const errorStr = JSON.stringify(error);
    const redactedStr = this.redactEmailFromString(errorStr);
    
    try {
      return JSON.parse(redactedStr);
    } catch {
      return redactedStr;
    }
  }
}

// Export singleton instance
export const dncEnforcementService = new DNCEnforcementService();

// Legacy function for backward compatibility with existing email routes
export async function checkContactRestrictions(
  loanId: number,
  emailAddresses: string[]
): Promise<ContactCheckResult> {
  // Default to marketing category for legacy calls (safe default)
  return dncEnforcementService.checkContactRestrictions(loanId, emailAddresses, 'marketing');
}