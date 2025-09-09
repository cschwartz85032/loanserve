/**
 * Grok AI Service
 * Advanced document processing and intelligent payment classification
 * Uses Groq Cloud API for ultra-fast AI inference
 */

import Groq from 'groq-sdk';
import { db } from '../db';
import { paymentIngestions, paymentArtifacts, paymentEvents, outboxMessages } from '@shared/schema';
import crypto from 'crypto';
import { randomUUID } from 'crypto';

// Grok AI configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

export interface DocumentAnalysisResult {
  documentType: 'check' | 'wire_receipt' | 'ach_confirmation' | 'invoice' | 'statement' | 'unknown';
  confidence: number;
  extractedData: {
    amount?: number;
    payerName?: string;
    payerAccount?: string;
    payeeAccount?: string;
    referenceNumber?: string;
    transactionDate?: string;
    loanIdentifier?: string;
    paymentMethod?: 'ach' | 'wire' | 'check' | 'card';
    metadata?: Record<string, any>;
  };
  paymentIntent?: {
    type: 'principal' | 'interest' | 'escrow' | 'fees' | 'mixed';
    allocation?: {
      principal?: number;
      interest?: number;
      escrow?: number;
      fees?: number;
    };
  };
  validationIssues?: string[];
  aiInsights?: string[];
}

export interface PaymentClassification {
  category: 'regular' | 'prepayment' | 'payoff' | 'partial' | 'overpayment';
  urgency: 'standard' | 'expedited' | 'critical';
  riskScore: number; // 0-100, higher = riskier
  complianceFlags?: string[];
  processingRecommendation: 'auto_process' | 'manual_review' | 'hold' | 'reject';
  reasoning?: string;
}

export class GrokAIService {
  private groq: Groq;
  private modelName: string = 'llama-3.3-70b-versatile'; // Fast, accurate model
  
  constructor() {
    if (!GROQ_API_KEY) {
      console.warn('[GrokAI] API key not configured - AI features disabled');
    }
    
    this.groq = new Groq({
      apiKey: GROQ_API_KEY
    });
  }

  /**
   * Analyze a payment document using Grok AI
   */
  async analyzeDocument(
    documentContent: string | Buffer,
    documentType?: string
  ): Promise<DocumentAnalysisResult> {
    console.log('[GrokAI] Analyzing document...');
    
    if (!GROQ_API_KEY) {
      return this.getFallbackAnalysis();
    }

    try {
      // Convert buffer to base64 if needed
      const content = Buffer.isBuffer(documentContent) 
        ? documentContent.toString('base64')
        : documentContent;

      // Prepare the AI prompt
      const prompt = this.buildDocumentAnalysisPrompt(content, documentType);
      
      // Call Grok AI for analysis
      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a financial document analysis expert specializing in mortgage loan servicing. Analyze documents to extract payment information with extreme precision. Always return valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: this.modelName,
        temperature: 0.1, // Low temperature for consistency
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from Grok AI');
      }

      // Parse and validate the AI response
      const result = JSON.parse(response) as DocumentAnalysisResult;
      
      // Enhance with validation
      result.validationIssues = this.validateExtractedData(result.extractedData);
      
      console.log('[GrokAI] Document analysis complete:', {
        type: result.documentType,
        confidence: result.confidence,
        amount: result.extractedData.amount
      });

      return result;
      
    } catch (error) {
      console.error('[GrokAI] Document analysis failed:', error);
      return this.getFallbackAnalysis();
    }
  }

  /**
   * Classify a payment and determine processing path
   */
  async classifyPayment(
    amount: number,
    loanId: string,
    paymentData: any
  ): Promise<PaymentClassification> {
    console.log(`[GrokAI] Classifying payment for loan ${loanId}`);
    
    if (!GROQ_API_KEY) {
      return this.getDefaultClassification();
    }

    try {
      // Get loan context for better classification
      const loanContext = await this.getLoanContext(loanId);
      
      const prompt = this.buildClassificationPrompt(amount, loanContext, paymentData);
      
      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a mortgage payment classification expert. Analyze payments to determine their category, risk level, and processing requirements. Consider compliance, fraud risk, and servicing rules. Return valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: this.modelName,
        temperature: 0.2,
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from Grok AI');
      }

      const classification = JSON.parse(response) as PaymentClassification;
      
      console.log('[GrokAI] Payment classified:', {
        category: classification.category,
        risk: classification.riskScore,
        recommendation: classification.processingRecommendation
      });

      return classification;
      
    } catch (error) {
      console.error('[GrokAI] Payment classification failed:', error);
      return this.getDefaultClassification();
    }
  }

  /**
   * Generate payment allocation recommendations
   */
  async recommendPaymentAllocation(
    amount: number,
    loanId: string,
    dueAmounts: {
      principal: number;
      interest: number;
      escrow?: number;
      fees?: number;
      lateFees?: number;
    }
  ): Promise<{
    recommended: Record<string, number>;
    reasoning: string;
    alternativeOptions?: Array<{
      allocation: Record<string, number>;
      description: string;
    }>;
  }> {
    console.log(`[GrokAI] Generating allocation for loan ${loanId}`);
    
    if (!GROQ_API_KEY) {
      return this.getDefaultAllocation(amount, dueAmounts);
    }

    try {
      const prompt = `
        Allocate payment of $${amount.toFixed(2)} for a mortgage loan with:
        - Principal Due: $${dueAmounts.principal.toFixed(2)}
        - Interest Due: $${dueAmounts.interest.toFixed(2)}
        - Escrow Due: $${(dueAmounts.escrow || 0).toFixed(2)}
        - Fees Due: $${(dueAmounts.fees || 0).toFixed(2)}
        - Late Fees: $${(dueAmounts.lateFees || 0).toFixed(2)}
        
        Follow standard mortgage servicing waterfall:
        1. Late fees first
        2. Other fees
        3. Interest
        4. Escrow
        5. Principal
        
        Return as JSON with 'recommended' allocation, 'reasoning', and optional 'alternativeOptions'.
      `;

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a mortgage servicing expert. Apply payment allocation rules precisely following regulatory requirements.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: this.modelName,
        temperature: 0.1,
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from Grok AI');
      }

      return JSON.parse(response);
      
    } catch (error) {
      console.error('[GrokAI] Allocation recommendation failed:', error);
      return this.getDefaultAllocation(amount, dueAmounts);
    }
  }

  /**
   * Detect anomalies in payment patterns
   */
  async detectAnomalies(
    loanId: string,
    currentPayment: any
  ): Promise<{
    anomalies: Array<{
      type: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      recommendation: string;
    }>;
    overallRisk: number; // 0-100
  }> {
    console.log(`[GrokAI] Detecting anomalies for loan ${loanId}`);
    
    if (!GROQ_API_KEY) {
      return { anomalies: [], overallRisk: 0 };
    }

    try {
      // Get payment history for pattern analysis
      const paymentHistory = await this.getPaymentHistory(loanId);
      
      const prompt = `
        Analyze this payment for anomalies:
        Current Payment: ${JSON.stringify(currentPayment)}
        Payment History (last 12): ${JSON.stringify(paymentHistory)}
        
        Look for:
        - Unusual amounts (too high/low)
        - Suspicious timing patterns
        - Account changes
        - Potential fraud indicators
        - Compliance violations
        
        Return JSON with 'anomalies' array and 'overallRisk' score (0-100).
      `;

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a fraud detection and compliance expert for mortgage servicing. Identify payment anomalies and assess risk.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: this.modelName,
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from Grok AI');
      }

      const result = JSON.parse(response);
      
      if (result.anomalies.length > 0) {
        console.warn('[GrokAI] Anomalies detected:', result.anomalies);
        
        // Record anomalies in payment events
        await this.recordAnomalies(loanId, currentPayment, result.anomalies);
      }

      return result;
      
    } catch (error) {
      console.error('[GrokAI] Anomaly detection failed:', error);
      return { anomalies: [], overallRisk: 0 };
    }
  }

  /**
   * Process document with AI and create payment artifacts
   */
  async processDocumentForPayment(
    documentPath: string,
    documentContent: Buffer,
    channel: 'ach' | 'wire' | 'check' | 'manual'
  ): Promise<{
    ingestionId: string;
    artifactId: string;
    analysis: DocumentAnalysisResult;
    classification: PaymentClassification;
  }> {
    console.log('[GrokAI] Processing document for payment ingestion');
    
    // Analyze the document
    const analysis = await this.analyzeDocument(documentContent);
    
    // Create ingestion record
    const ingestionId = randomUUID();
    const idempotencyKey = `ai-doc-${crypto.createHash('sha256').update(documentContent).digest('hex').substring(0, 16)}`;
    
    // Extract loan ID from analysis
    const loanId = analysis.extractedData.loanIdentifier || 'unknown';
    const amount = analysis.extractedData.amount || 0;
    
    // Classify the payment
    const classification = await this.classifyPayment(
      amount,
      loanId,
      analysis.extractedData
    );
    
    // Detect anomalies
    const anomalies = await this.detectAnomalies(loanId, {
      amount,
      ...analysis.extractedData
    });
    
    // Create normalized envelope with AI insights
    const envelope = {
      message_id: randomUUID(),
      correlation_id: randomUUID(),
      idempotency_key: idempotencyKey,
      timestamp: new Date().toISOString(),
      source: {
        channel,
        document: documentPath
      },
      payment: {
        amount_cents: Math.round(amount * 100),
        reference: analysis.extractedData.referenceNumber,
        value_date: analysis.extractedData.transactionDate
      },
      borrower: {
        loan_id: loanId,
        name: analysis.extractedData.payerName
      },
      ai_analysis: {
        document_type: analysis.documentType,
        confidence: analysis.confidence,
        payment_intent: analysis.paymentIntent,
        classification: classification.category,
        risk_score: classification.riskScore,
        anomaly_score: anomalies.overallRisk,
        processing_recommendation: classification.processingRecommendation
      }
    };
    
    // Store ingestion with AI metadata
    await db.insert(paymentIngestions).values({
      id: ingestionId,
      idempotencyKey,
      channel,
      sourceReference: documentPath,
      rawPayloadHash: crypto.createHash('sha256').update(documentContent).digest('hex'),
      artifactUri: [`file://${documentPath}`],
      artifactHash: [crypto.createHash('sha256').update(documentContent).digest('hex')],
      receivedAt: new Date(),
      normalizedEnvelope: envelope,
      status: classification.processingRecommendation === 'auto_process' ? 'normalized' : 'received'
    });
    
    // Create payment artifact
    const artifactId = randomUUID();
    await db.insert(paymentArtifacts).values({
      id: artifactId,
      ingestionId,
      type: analysis.documentType === 'unknown' ? 'document' : analysis.documentType,
      uri: `file://${documentPath}`,
      sha256: crypto.createHash('sha256').update(documentContent).digest('hex'),
      sizeBytes: documentContent.length,
      mime: 'application/pdf',
      sourceMetadata: {
        ai_analysis: analysis,
        classification,
        anomalies: anomalies.anomalies
      }
    });
    
    // If auto-process recommended, publish to payment pipeline
    if (classification.processingRecommendation === 'auto_process') {
      await db.insert(outboxMessages).values({
        id: randomUUID(),
        aggregateType: 'payments',
        aggregateId: ingestionId,
        eventType: 'payment.ai.processed',
        payload: envelope,
        createdAt: new Date(),
        publishedAt: null,
        attemptCount: 0,
        lastError: null
      });
      
      console.log('[GrokAI] Payment auto-processed and published to pipeline');
    } else {
      console.log(`[GrokAI] Payment held for ${classification.processingRecommendation}: ${classification.reasoning}`);
    }
    
    return {
      ingestionId,
      artifactId,
      analysis,
      classification
    };
  }

  /**
   * Build document analysis prompt
   */
  private buildDocumentAnalysisPrompt(content: string, documentType?: string): string {
    return `
      Analyze this financial document${documentType ? ` (type: ${documentType})` : ''} and extract payment information.
      
      Document content: ${content.substring(0, 10000)} // Limit for token efficiency
      
      Extract and return as JSON:
      {
        "documentType": "check|wire_receipt|ach_confirmation|invoice|statement|unknown",
        "confidence": 0.0-1.0,
        "extractedData": {
          "amount": numeric value in dollars,
          "payerName": "name of payer",
          "payerAccount": "account number if visible",
          "payeeAccount": "destination account",
          "referenceNumber": "transaction reference",
          "transactionDate": "YYYY-MM-DD",
          "loanIdentifier": "loan number or ID",
          "paymentMethod": "ach|wire|check|card",
          "metadata": { any additional relevant data }
        },
        "paymentIntent": {
          "type": "principal|interest|escrow|fees|mixed",
          "allocation": { breakdown if determinable }
        },
        "aiInsights": ["relevant observations about the document"]
      }
    `;
  }

  /**
   * Build payment classification prompt
   */
  private buildClassificationPrompt(amount: number, loanContext: any, paymentData: any): string {
    return `
      Classify this mortgage payment:
      Amount: $${amount.toFixed(2)}
      Loan Context: ${JSON.stringify(loanContext)}
      Payment Data: ${JSON.stringify(paymentData)}
      
      Determine:
      {
        "category": "regular|prepayment|payoff|partial|overpayment",
        "urgency": "standard|expedited|critical",
        "riskScore": 0-100 (fraud/compliance risk),
        "complianceFlags": ["any compliance concerns"],
        "processingRecommendation": "auto_process|manual_review|hold|reject",
        "reasoning": "explanation of classification"
      }
      
      Consider:
      - Is amount consistent with regular payment?
      - Any fraud indicators?
      - Compliance requirements (RESPA, TILA, etc.)
      - Processing urgency based on due dates
    `;
  }

  /**
   * Get loan context for AI analysis
   */
  private async getLoanContext(loanId: string): Promise<any> {
    try {
      // Query actual loan data from database
      const loanQuery = await db.query(`
        SELECT 
          l.id,
          l.loan_number,
          l.current_balance,
          l.monthly_payment,
          l.interest_rate,
          l.next_due_date,
          l.days_past_due,
          l.status,
          l.created_at,
          p.street_address,
          p.city,
          p.state,
          p.zip_code,
          b.first_name,
          b.last_name,
          b.email,
          b.phone
        FROM loans l
        LEFT JOIN properties p ON l.property_id = p.id
        LEFT JOIN borrowers b ON l.primary_borrower_id = b.id
        WHERE l.loan_number = $1 OR l.id = $2
        LIMIT 1
      `, [loanId, parseInt(loanId) || 0]);

      if (loanQuery.rows.length > 0) {
        const loan = loanQuery.rows[0];
        return {
          loanId: loan.loan_number || loan.id,
          regularPaymentAmount: parseFloat(loan.monthly_payment) || 0,
          currentBalance: parseFloat(loan.current_balance) || 0,
          interestRate: parseFloat(loan.interest_rate) || 0,
          nextDueDate: loan.next_due_date,
          isDelinquent: loan.days_past_due > 0,
          daysPastDue: loan.days_past_due || 0,
          status: loan.status,
          borrowerName: `${loan.first_name || ''} ${loan.last_name || ''}`.trim(),
          propertyAddress: `${loan.street_address || ''} ${loan.city || ''} ${loan.state || ''} ${loan.zip_code || ''}`.trim()
        };
      }
    } catch (error) {
      console.warn(`[GrokAI] Failed to fetch loan context for ${loanId}:`, error);
    }

    // Fallback to basic context if database query fails
    return {
      loanId,
      regularPaymentAmount: 0,
      currentBalance: 0,
      nextDueDate: null,
      isDelinquent: false,
      daysPastDue: 0,
      status: 'unknown',
      error: 'Could not fetch loan data from database'
    };
  }

  /**
   * Get payment history for pattern analysis
   */
  private async getPaymentHistory(loanId: string): Promise<any[]> {
    try {
      // Query actual payment history from database
      const paymentQuery = await db.query(`
        SELECT 
          p.payment_date,
          p.amount_cents,
          p.payment_method,
          p.reference_number,
          p.status,
          p.created_at
        FROM payments p
        JOIN loans l ON p.loan_id = l.id
        WHERE l.loan_number = $1 OR l.id = $2
        ORDER BY p.payment_date DESC
        LIMIT 12
      `, [loanId, parseInt(loanId) || 0]);

      if (paymentQuery.rows.length > 0) {
        return paymentQuery.rows.map(payment => ({
          date: payment.payment_date,
          amount: parseFloat(payment.amount_cents) / 100,
          method: payment.payment_method,
          reference: payment.reference_number,
          status: payment.status,
          created_at: payment.created_at
        }));
      }
    } catch (error) {
      console.warn(`[GrokAI] Failed to fetch payment history for ${loanId}:`, error);
    }

    // Return empty array if no payments found or query fails
    return [];
  }

  /**
   * Record detected anomalies
   */
  private async recordAnomalies(loanId: string, payment: any, anomalies: any[]): Promise<void> {
    for (const anomaly of anomalies) {
      const correlationId = randomUUID();
      const eventData = {
        type: anomaly.type,
        severity: anomaly.severity,
        description: anomaly.description,
        recommendation: anomaly.recommendation,
        loanId
      };
      
      const eventHash = crypto.createHash('sha256')
        .update(JSON.stringify(eventData))
        .digest('hex');
      
      await db.insert(paymentEvents).values({
        paymentId: payment.id || null,
        ingestionId: payment.ingestionId || null,
        type: 'anomaly_detected',
        eventTime: new Date(),
        actorType: 'ai',
        actorId: 'grok-ai-service',
        correlationId,
        data: eventData,
        prevEventHash: null,
        eventHash
      });
    }
  }

  /**
   * Validate extracted data
   */
  private validateExtractedData(data: any): string[] {
    const issues: string[] = [];
    
    if (!data.amount || data.amount <= 0) {
      issues.push('Invalid or missing payment amount');
    }
    
    if (!data.loanIdentifier) {
      issues.push('Cannot identify associated loan');
    }
    
    if (!data.transactionDate) {
      issues.push('Missing transaction date');
    }
    
    if (!data.paymentMethod) {
      issues.push('Payment method not identified');
    }
    
    return issues;
  }

  /**
   * Get fallback analysis when AI is unavailable
   */
  private getFallbackAnalysis(): DocumentAnalysisResult {
    return {
      documentType: 'unknown',
      confidence: 0,
      extractedData: {},
      validationIssues: ['AI service unavailable - manual review required']
    };
  }

  /**
   * Get default classification when AI is unavailable
   */
  private getDefaultClassification(): PaymentClassification {
    return {
      category: 'regular',
      urgency: 'standard',
      riskScore: 50, // Medium risk when uncertain
      processingRecommendation: 'manual_review',
      reasoning: 'AI service unavailable - defaulting to manual review'
    };
  }

  /**
   * Get default allocation using standard waterfall
   */
  private getDefaultAllocation(amount: number, dueAmounts: any): any {
    const allocation: Record<string, number> = {};
    let remaining = amount;
    
    // Standard waterfall order
    const waterfall = [
      { key: 'lateFees', amount: dueAmounts.lateFees || 0 },
      { key: 'fees', amount: dueAmounts.fees || 0 },
      { key: 'interest', amount: dueAmounts.interest || 0 },
      { key: 'escrow', amount: dueAmounts.escrow || 0 },
      { key: 'principal', amount: dueAmounts.principal || 0 }
    ];
    
    for (const item of waterfall) {
      if (remaining <= 0) break;
      const allocated = Math.min(remaining, item.amount);
      if (allocated > 0) {
        allocation[item.key] = allocated;
        remaining -= allocated;
      }
    }
    
    // Any excess goes to principal
    if (remaining > 0) {
      allocation.principal = (allocation.principal || 0) + remaining;
    }
    
    return {
      recommended: allocation,
      reasoning: 'Standard mortgage servicing waterfall applied'
    };
  }

  /**
   * Health check for AI service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    model: string;
    apiConfigured: boolean;
    lastResponseTime?: number;
  }> {
    if (!GROQ_API_KEY) {
      return {
        status: 'unhealthy',
        model: this.modelName,
        apiConfigured: false
      };
    }

    try {
      const start = Date.now();
      
      // Simple test prompt
      await this.groq.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: 'Return JSON: {"status": "ok"}'
          }
        ],
        model: this.modelName,
        temperature: 0,
        max_tokens: 10,
        response_format: { type: 'json_object' }
      });
      
      const responseTime = Date.now() - start;
      
      return {
        status: 'healthy',
        model: this.modelName,
        apiConfigured: true,
        lastResponseTime: responseTime
      };
    } catch (error) {
      console.error('[GrokAI] Health check failed:', error);
      return {
        status: 'degraded',
        model: this.modelName,
        apiConfigured: true
      };
    }
  }
}

// Export singleton instance
export const grokAIService = new GrokAIService();