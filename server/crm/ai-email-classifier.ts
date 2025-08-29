/**
 * AI-Powered Email Classification Service
 * Uses X.AI Grok to classify emails as transactional vs marketing
 */

import OpenAI from "openai";

const openai = new OpenAI({ 
  baseURL: "https://api.x.ai/v1", 
  apiKey: process.env.XAI_API_KEY 
});

export interface EmailClassificationResult {
  category: 'transactional' | 'marketing';
  topic: string;
  confidence: number;
  reasoning: string;
}

export class AIEmailClassifier {
  
  /**
   * Classify email using Grok AI
   */
  async classifyEmail(
    subject: string,
    templateId?: string,
    variables?: Record<string, any>
  ): Promise<EmailClassificationResult> {
    try {
      const prompt = this.buildClassificationPrompt(subject, templateId, variables);
      
      const response = await openai.chat.completions.create({
        model: "grok-beta", // Lower-powered, less expensive model
        messages: [
          {
            role: "system",
            content: this.getSystemPrompt()
          },
          {
            role: "user", 
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 200, // Keep it concise for cost efficiency
        temperature: 0.1 // Low temperature for consistent classification
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        category: result.category === 'transactional' ? 'transactional' : 'marketing',
        topic: result.topic || (result.category === 'transactional' ? 'loan_servicing' : 'marketing_general'),
        confidence: Math.min(Math.max(result.confidence || 0.5, 0), 1),
        reasoning: result.reasoning || 'AI classification'
      };

    } catch (error) {
      console.error('[AIEmailClassifier] Classification failed:', this.redactEmailFromError(error));
      
      // Fallback to conservative classification
      return {
        category: 'transactional', // Default to transactional for safety
        topic: 'loan_servicing',
        confidence: 0.3,
        reasoning: 'Fallback classification due to AI service error'
      };
    }
  }

  /**
   * Build classification prompt for Grok
   */
  private buildClassificationPrompt(
    subject: string,
    templateId?: string,
    variables?: Record<string, any>
  ): string {
    let prompt = `Classify this email for a mortgage loan servicing platform:

Subject: "${subject}"`;

    if (templateId) {
      prompt += `\nTemplate ID: "${templateId}"`;
    }

    if (variables && Object.keys(variables).length > 0) {
      prompt += `\nTemplate Variables: ${JSON.stringify(variables, null, 2)}`;
    }

    return prompt;
  }

  /**
   * System prompt for email classification
   */
  private getSystemPrompt(): string {
    return `You are an expert email classifier for a mortgage loan servicing platform. Your job is to determine whether an email is TRANSACTIONAL or MARKETING.

TRANSACTIONAL emails are essential business communications that customers cannot opt out of:
- Payment due notices, payment confirmations, payment failures
- Account statements, balance updates
- Escrow analysis, property tax notices, insurance notices  
- Delinquency notices, late fee assessments
- Document requests, verification requirements
- Legal notices, compliance notifications
- Loan maturity notices, servicing transfers
- Security alerts, account changes

MARKETING emails are promotional communications that customers can opt out of:
- Promotional offers, refinancing offers
- Marketing campaigns, newsletters
- Product updates (non-essential)
- Customer surveys, feedback requests
- General company announcements

For TRANSACTIONAL emails, use these topics:
- payment_notifications (payment-related)
- account_statements (statements, balances)
- escrow_notifications (escrow, taxes, insurance)
- delinquency_notifications (late payments, fees)
- document_requests (required documents)
- legal_compliance (legal notices, compliance)
- loan_servicing (general loan servicing)

For MARKETING emails, use these topics:
- promotional_offers (refinancing, products)
- newsletters (company updates)
- surveys (feedback requests)
- marketing_general (other marketing)

Respond with JSON:
{
  "category": "transactional" | "marketing",
  "topic": "specific_topic",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Be conservative - when in doubt, classify as transactional to ensure important communications are delivered.`;
  }

  /**
   * Batch classify multiple emails (for efficiency)
   */
  async classifyEmailsBatch(
    emails: Array<{
      subject: string;
      templateId?: string;
      variables?: Record<string, any>;
    }>
  ): Promise<EmailClassificationResult[]> {
    // For now, process sequentially to avoid rate limits
    // In production, could implement parallel processing with rate limiting
    const results: EmailClassificationResult[] = [];
    
    for (const email of emails) {
      const result = await this.classifyEmail(
        email.subject,
        email.templateId,
        email.variables
      );
      results.push(result);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
  }

  /**
   * Redact email addresses from error messages for privacy
   */
  private redactEmailFromError(error: any): any {
    if (!error || typeof error !== 'object') return error;
    
    const errorStr = JSON.stringify(error);
    const redactedStr = errorStr.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      (match) => {
        const [local, domain] = match.split('@');
        const redactedLocal = local.length > 2 ? 
          local.substring(0, 2) + '***' : 
          '***';
        return `${redactedLocal}@${domain}`;
      }
    );
    
    try {
      return JSON.parse(redactedStr);
    } catch {
      return redactedStr;
    }
  }
}

// Export singleton instance
export const aiEmailClassifier = new AIEmailClassifier();