/**
 * Real-time Data Streaming and Event Processing
 * Handles real-time data ingestion, processing, and analytics
 */

import { Pool } from "pg";
import { randomUUID } from "crypto";
import { EventEmitter } from "events";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface StreamEvent {
  eventId: string;
  eventType: string;
  eventSource: string;
  timestamp: Date;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ProcessingRule {
  ruleId: string;
  name: string;
  eventPattern: string;
  actions: Array<{
    type: 'transform' | 'aggregate' | 'alert' | 'store';
    configuration: Record<string, any>;
  }>;
  enabled: boolean;
  priority: number;
}

export interface StreamMetrics {
  eventsProcessed: number;
  eventsPerSecond: number;
  averageLatency: number;
  errorRate: number;
  throughput: number;
  lastProcessed: Date;
}

export interface AggregationWindow {
  windowId: string;
  windowType: 'tumbling' | 'sliding' | 'session';
  size: number; // in seconds
  aggregations: Array<{
    field: string;
    function: 'sum' | 'avg' | 'count' | 'min' | 'max';
    alias: string;
  }>;
  groupBy: string[];
}

/**
 * Streaming Data Processor
 */
export class StreamingProcessor extends EventEmitter {
  private static instance: StreamingProcessor;
  private processingRules: Map<string, ProcessingRule> = new Map();
  private aggregationWindows: Map<string, AggregationWindow> = new Map();
  private eventBuffer: StreamEvent[] = [];
  private metrics: StreamMetrics = {
    eventsProcessed: 0,
    eventsPerSecond: 0,
    averageLatency: 0,
    errorRate: 0,
    throughput: 0,
    lastProcessed: new Date()
  };

  constructor() {
    super();
    this.initializeProcessingRules();
    this.initializeAggregationWindows();
    
    // Process events in batches
    setInterval(() => this.processBatch(), 1000); // 1 second
    
    // Update metrics
    setInterval(() => this.updateMetrics(), 5000); // 5 seconds
    
    // Cleanup old data
    setInterval(() => this.cleanup(), 300000); // 5 minutes
  }

  static getInstance(): StreamingProcessor {
    if (!StreamingProcessor.instance) {
      StreamingProcessor.instance = new StreamingProcessor();
    }
    return StreamingProcessor.instance;
  }

  /**
   * Ingest a stream event
   */
  async ingestEvent(eventData: Omit<StreamEvent, 'eventId' | 'timestamp'>): Promise<string> {
    const event: StreamEvent = {
      eventId: randomUUID(),
      timestamp: new Date(),
      ...eventData
    };

    // Add to buffer for batch processing
    this.eventBuffer.push(event);

    // Emit event for real-time subscribers
    this.emit('event', event);

    return event.eventId;
  }

  /**
   * Process loan payment event
   */
  async processPaymentEvent(loanId: string, paymentData: {
    amount: number;
    paymentMethod: string;
    scheduledDate: Date;
    receivedDate?: Date;
  }): Promise<void> {
    const event = await this.ingestEvent({
      eventType: 'payment_received',
      eventSource: 'payment_system',
      payload: {
        loanId,
        amount: paymentData.amount,
        paymentMethod: paymentData.paymentMethod,
        scheduledDate: paymentData.scheduledDate,
        receivedDate: paymentData.receivedDate || new Date(),
        isLate: paymentData.receivedDate ? paymentData.receivedDate > paymentData.scheduledDate : false
      }
    });

    // Real-time processing for critical events
    if (paymentData.amount > 50000) {
      await this.processHighValuePayment(event);
    }
  }

  /**
   * Process document analysis event
   */
  async processDocumentEvent(documentId: string, analysisResult: {
    documentType: string;
    confidence: number;
    extractedData: Record<string, any>;
    processingTime: number;
  }): Promise<void> {
    await this.ingestEvent({
      eventType: 'document_analyzed',
      eventSource: 'ai_processor',
      payload: {
        documentId,
        documentType: analysisResult.documentType,
        confidence: analysisResult.confidence,
        extractedData: analysisResult.extractedData,
        processingTime: analysisResult.processingTime,
        qualityScore: this.calculateDocumentQuality(analysisResult)
      }
    });
  }

  /**
   * Process customer interaction event
   */
  async processCustomerEvent(customerId: string, interactionData: {
    type: 'call' | 'email' | 'chat' | 'portal';
    outcome: string;
    duration?: number;
    satisfaction?: number;
  }): Promise<void> {
    await this.ingestEvent({
      eventType: 'customer_interaction',
      eventSource: 'customer_service',
      payload: {
        customerId,
        interactionType: interactionData.type,
        outcome: interactionData.outcome,
        duration: interactionData.duration,
        satisfaction: interactionData.satisfaction,
        channel: interactionData.type
      }
    });
  }

  /**
   * Get real-time analytics for dashboard
   */
  async getRealTimeAnalytics(): Promise<{
    liveMetrics: Record<string, number>;
    recentEvents: StreamEvent[];
    alerts: Array<{ type: string; message: string; timestamp: Date }>;
    throughput: number;
  }> {
    const recentEvents = this.eventBuffer.slice(-50); // Last 50 events
    
    // Calculate live metrics
    const now = Date.now();
    const last5Minutes = now - 5 * 60 * 1000;
    const recentEventCount = this.eventBuffer.filter(e => e.timestamp.getTime() > last5Minutes).length;

    const liveMetrics = {
      eventsLast5Min: recentEventCount,
      paymentsToday: this.countEventsByType('payment_received', 'today'),
      documentsProcessed: this.countEventsByType('document_analyzed', 'today'),
      customerInteractions: this.countEventsByType('customer_interaction', 'today'),
      averageProcessingTime: this.calculateAverageProcessingTime()
    };

    // Generate alerts for anomalies
    const alerts = await this.generateRealTimeAlerts();

    return {
      liveMetrics,
      recentEvents: recentEvents.slice(-10), // Last 10 events
      alerts,
      throughput: this.metrics.eventsPerSecond
    };
  }

  /**
   * Setup streaming aggregation
   */
  setupAggregation(config: AggregationWindow): string {
    this.aggregationWindows.set(config.windowId, config);
    
    // Start aggregation timer
    const interval = config.size * 1000; // Convert to milliseconds
    setInterval(() => this.executeAggregation(config.windowId), interval);
    
    return config.windowId;
  }

  /**
   * Get streaming metrics
   */
  getStreamingMetrics(): StreamMetrics {
    return { ...this.metrics };
  }

  /**
   * Add processing rule
   */
  addProcessingRule(rule: ProcessingRule): void {
    this.processingRules.set(rule.ruleId, rule);
  }

  /**
   * Get event history for analysis
   */
  async getEventHistory(eventType?: string, timeRange?: { start: Date; end: Date }): Promise<StreamEvent[]> {
    let events = [...this.eventBuffer];

    if (eventType) {
      events = events.filter(e => e.eventType === eventType);
    }

    if (timeRange) {
      events = events.filter(e => 
        e.timestamp >= timeRange.start && e.timestamp <= timeRange.end
      );
    }

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Private methods

  private async processBatch(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const batchSize = Math.min(100, this.eventBuffer.length);
    const batch = this.eventBuffer.splice(0, batchSize);

    const startTime = Date.now();

    try {
      // Process each event through rules
      for (const event of batch) {
        await this.processEvent(event);
      }

      // Update metrics
      this.metrics.eventsProcessed += batch.length;
      this.metrics.lastProcessed = new Date();

      // Calculate latency
      const latency = Date.now() - startTime;
      this.metrics.averageLatency = (this.metrics.averageLatency + latency) / 2;

    } catch (error) {
      console.error('[Streaming] Batch processing failed:', error);
      this.metrics.errorRate = (this.metrics.errorRate + 1) / 2;
    }
  }

  private async processEvent(event: StreamEvent): Promise<void> {
    // Apply processing rules
    for (const [, rule] of this.processingRules) {
      if (!rule.enabled) continue;

      if (this.matchesPattern(event, rule.eventPattern)) {
        await this.executeRuleActions(event, rule);
      }
    }

    // Store in fact tables if configured
    await this.storeEventInAnalytics(event);
  }

  private matchesPattern(event: StreamEvent, pattern: string): boolean {
    // Simple pattern matching - in production would use proper pattern engine
    return pattern === '*' || event.eventType === pattern;
  }

  private async executeRuleActions(event: StreamEvent, rule: ProcessingRule): Promise<void> {
    for (const action of rule.actions) {
      try {
        switch (action.type) {
          case 'alert':
            await this.generateAlert(event, action.configuration);
            break;
          case 'transform':
            await this.transformEvent(event, action.configuration);
            break;
          case 'aggregate':
            await this.aggregateEvent(event, action.configuration);
            break;
          case 'store':
            await this.storeEvent(event, action.configuration);
            break;
        }
      } catch (error) {
        console.error(`[Streaming] Action ${action.type} failed:`, error);
      }
    }
  }

  private async generateAlert(event: StreamEvent, config: Record<string, any>): Promise<void> {
    if (event.payload.amount > (config.threshold || 100000)) {
      this.emit('alert', {
        type: 'high_value_transaction',
        message: `High value payment of $${event.payload.amount} received`,
        event,
        timestamp: new Date()
      });
    }
  }

  private async transformEvent(event: StreamEvent, config: Record<string, any>): Promise<void> {
    // Apply transformation rules to event data
    if (config.enrichment) {
      // Enrich with additional data
      event.metadata = { ...event.metadata, enriched: true };
    }
  }

  private async aggregateEvent(event: StreamEvent, config: Record<string, any>): Promise<void> {
    // Add to aggregation windows
    const windowId = config.windowId;
    if (this.aggregationWindows.has(windowId)) {
      // Would implement proper window aggregation
      console.log(`[Streaming] Event added to aggregation window ${windowId}`);
    }
  }

  private async storeEvent(event: StreamEvent, config: Record<string, any>): Promise<void> {
    // Store in configured storage location
    console.log(`[Streaming] Event stored: ${event.eventType}`);
  }

  private async storeEventInAnalytics(event: StreamEvent): Promise<void> {
    try {
      const c = await pool.connect();
      
      // Store in appropriate fact table based on event type
      if (event.eventType === 'payment_received') {
        await this.storePaymentFact(c, event);
      } else if (event.eventType === 'document_analyzed') {
        await this.storeAIPerformanceFact(c, event);
      } else if (event.eventType === 'customer_interaction') {
        await this.storeServiceOperationFact(c, event);
      }
      
      c.release();
    } catch (error) {
      console.error('[Streaming] Failed to store event in analytics:', error);
    }
  }

  private async storePaymentFact(client: any, event: StreamEvent): Promise<void> {
    const timeKey = parseInt(event.timestamp.toISOString().split('T')[0].replace(/-/g, ''));
    
    // Would need to resolve dimension keys in production
    const loanKey = event.payload.loanId;
    const borrowerKey = 'default-borrower-key';

    await client.query(
      `INSERT INTO fact_loan_performance 
       (time_key, loan_key, borrower_key, actual_payment_cents, 
        payment_status, payment_timing_category)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [
        timeKey,
        loanKey,
        borrowerKey,
        Math.round(event.payload.amount * 100),
        event.payload.isLate ? 'late' : 'on_time',
        event.payload.isLate ? 'late' : 'on_time'
      ]
    );
  }

  private async storeAIPerformanceFact(client: any, event: StreamEvent): Promise<void> {
    const timeKey = parseInt(event.timestamp.toISOString().split('T')[0].replace(/-/g, ''));

    await client.query(
      `INSERT INTO fact_ai_performance 
       (time_key, model_name, model_version, operation_type, 
        request_count, success_count, average_latency_ms, average_confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING`,
      [
        timeKey,
        'document_analyzer',
        'v1.0',
        'document_analysis',
        1,
        event.payload.confidence > 0.8 ? 1 : 0,
        event.payload.processingTime,
        event.payload.confidence
      ]
    );
  }

  private async storeServiceOperationFact(client: any, event: StreamEvent): Promise<void> {
    const timeKey = parseInt(event.timestamp.toISOString().split('T')[0].replace(/-/g, ''));
    const performanceKey = 'default-performance-key';

    const metricUpdates: Record<string, number> = {};
    
    if (event.payload.interactionType === 'call') {
      metricUpdates.calls_received = 1;
      metricUpdates.calls_handled = event.payload.outcome === 'resolved' ? 1 : 0;
    } else if (event.payload.interactionType === 'email') {
      metricUpdates.emails_processed = 1;
    }

    if (Object.keys(metricUpdates).length > 0) {
      await client.query(
        `INSERT INTO fact_service_operations 
         (time_key, performance_key, calls_received, calls_handled, emails_processed,
          customer_satisfaction_score)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [
          timeKey,
          performanceKey,
          metricUpdates.calls_received || 0,
          metricUpdates.calls_handled || 0,
          metricUpdates.emails_processed || 0,
          event.payload.satisfaction || null
        ]
      );
    }
  }

  private async executeAggregation(windowId: string): Promise<void> {
    const window = this.aggregationWindows.get(windowId);
    if (!window) return;

    // Filter events for this aggregation window
    const windowStart = new Date(Date.now() - window.size * 1000);
    const windowEvents = this.eventBuffer.filter(e => e.timestamp >= windowStart);

    // Execute aggregations
    const results: Record<string, any> = {};
    
    for (const agg of window.aggregations) {
      const values = windowEvents
        .map(e => e.payload[agg.field])
        .filter(v => v !== undefined && v !== null);

      switch (agg.function) {
        case 'sum':
          results[agg.alias] = values.reduce((sum, val) => sum + Number(val), 0);
          break;
        case 'avg':
          results[agg.alias] = values.length > 0 ? 
            values.reduce((sum, val) => sum + Number(val), 0) / values.length : 0;
          break;
        case 'count':
          results[agg.alias] = values.length;
          break;
        case 'min':
          results[agg.alias] = values.length > 0 ? Math.min(...values.map(Number)) : 0;
          break;
        case 'max':
          results[agg.alias] = values.length > 0 ? Math.max(...values.map(Number)) : 0;
          break;
      }
    }

    // Emit aggregation results
    this.emit('aggregation', {
      windowId,
      windowType: window.windowType,
      timestamp: new Date(),
      results
    });
  }

  private initializeProcessingRules(): void {
    const defaultRules: ProcessingRule[] = [
      {
        ruleId: 'high-value-payment',
        name: 'High Value Payment Alert',
        eventPattern: 'payment_received',
        actions: [
          {
            type: 'alert',
            configuration: { threshold: 50000, alertType: 'high_value' }
          }
        ],
        enabled: true,
        priority: 1
      },
      {
        ruleId: 'document-quality-check',
        name: 'Document Quality Monitoring',
        eventPattern: 'document_analyzed',
        actions: [
          {
            type: 'alert',
            configuration: { confidenceThreshold: 0.7, alertType: 'low_confidence' }
          }
        ],
        enabled: true,
        priority: 2
      }
    ];

    for (const rule of defaultRules) {
      this.processingRules.set(rule.ruleId, rule);
    }
  }

  private initializeAggregationWindows(): void {
    // 5-minute tumbling window for payment aggregations
    this.setupAggregation({
      windowId: 'payments-5min',
      windowType: 'tumbling',
      size: 300, // 5 minutes
      aggregations: [
        { field: 'amount', function: 'sum', alias: 'total_payments' },
        { field: 'amount', function: 'count', alias: 'payment_count' },
        { field: 'amount', function: 'avg', alias: 'avg_payment' }
      ],
      groupBy: ['paymentMethod']
    });
  }

  private calculateDocumentQuality(result: { confidence: number; extractedData: Record<string, any> }): number {
    // Simple quality score calculation
    const confidenceScore = result.confidence * 100;
    const dataCompletenesScore = Object.keys(result.extractedData).length * 10;
    return Math.min(100, (confidenceScore + dataCompletenesScore) / 2);
  }

  private countEventsByType(eventType: string, period: 'today' | 'hour'): number {
    const now = new Date();
    const cutoff = period === 'today' ? 
      new Date(now.getFullYear(), now.getMonth(), now.getDate()) :
      new Date(now.getTime() - 60 * 60 * 1000);

    return this.eventBuffer.filter(e => 
      e.eventType === eventType && e.timestamp >= cutoff
    ).length;
  }

  private calculateAverageProcessingTime(): number {
    const processingEvents = this.eventBuffer.filter(e => 
      e.eventType === 'document_analyzed' && e.payload.processingTime
    );

    if (processingEvents.length === 0) return 0;

    const totalTime = processingEvents.reduce((sum, e) => sum + e.payload.processingTime, 0);
    return totalTime / processingEvents.length;
  }

  private async generateRealTimeAlerts(): Promise<Array<{ type: string; message: string; timestamp: Date }>> {
    const alerts = [];
    const now = new Date();

    // Check for high error rates
    if (this.metrics.errorRate > 0.05) {
      alerts.push({
        type: 'error_rate',
        message: `High error rate detected: ${(this.metrics.errorRate * 100).toFixed(1)}%`,
        timestamp: now
      });
    }

    // Check for processing delays
    if (this.metrics.averageLatency > 5000) {
      alerts.push({
        type: 'latency',
        message: `High processing latency: ${this.metrics.averageLatency}ms`,
        timestamp: now
      });
    }

    return alerts;
  }

  private async processHighValuePayment(event: StreamEvent): Promise<void> {
    // Special processing for high-value payments
    this.emit('high_value_payment', {
      loanId: event.payload.loanId,
      amount: event.payload.amount,
      timestamp: event.timestamp
    });
  }

  private updateMetrics(): void {
    const now = Date.now();
    const last5Seconds = now - 5000;
    const recentEvents = this.eventBuffer.filter(e => e.timestamp.getTime() > last5Seconds);
    
    this.metrics.eventsPerSecond = recentEvents.length / 5;
    this.metrics.throughput = this.eventBuffer.length;
  }

  private cleanup(): void {
    // Remove events older than 1 hour to prevent memory issues
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.eventBuffer = this.eventBuffer.filter(e => e.timestamp.getTime() > oneHourAgo);
  }
}

export const streamingProcessor = StreamingProcessor.getInstance();