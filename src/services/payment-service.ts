/**
 * Payment Microservice - Phase 3: Independent Payment Processing Service
 * Handles all payment-related operations independently using queue communication
 */

import express from 'express';
import type { Connection } from 'amqplib';
import { globalServiceRegistry, type ServiceDefinition } from './service-registry';
import { createEnvelope, validateMessage } from '../messaging/envelope-helpers';
import { Exchanges, ROUTING_KEYS } from '../queues/topology';
import { PaymentProcessingSchema, type PaymentProcessingMessage } from '../queues/payment/payment-consumer';
import { z } from 'zod';
import { ulid } from 'ulid';

// Payment service API schemas
const CreatePaymentSchema = z.object({
  loan_id: z.number(),
  payment_method: z.enum(['ach', 'wire', 'check', 'card', 'manual']),
  amount_cents: z.number().positive(),
  payment_date: z.string(),
  reference_number: z.string().optional(),
  bank_account_id: z.string().optional(),
  notes: z.string().optional()
});

const AllocatePaymentSchema = z.object({
  payment_id: z.string(),
  allocation_rules: z.object({
    fees_first: z.boolean().default(true),
    interest_before_principal: z.boolean().default(true),
    escrow_percentage: z.number().min(0).max(100).optional()
  }).optional()
});

export class PaymentService {
  private app: express.Application;
  private connection: Connection | null = null;
  private publishChannel: any = null;
  private serviceInstance: any = null;

  constructor() {
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  /**
   * Initialize payment service
   */
  async initialize(connection: Connection): Promise<void> {
    this.connection = connection;
    this.publishChannel = await connection.createConfirmChannel();
    
    console.log('[Payment Service] Initializing independent payment microservice...');
    
    // Register with service registry
    const definition: ServiceDefinition = {
      name: 'payment-service',
      version: '1.0.0',
      port: 5001,
      healthEndpoint: '/health',
      capabilities: [
        'payment.processing',
        'payment.allocation',
        'payment.validation',
        'payment.reporting'
      ],
      dependencies: ['loan-service', 'database'],
      queueBindings: {
        consumes: ['tenant.*.payment.process', 'tenant.*.payment.allocate'],
        publishes: ['payment.processed', 'payment.allocated', 'payment.failed']
      }
    };

    this.serviceInstance = await globalServiceRegistry.registerService(definition);
    
    // Start consuming payment messages
    await this.startConsumers();
    
    console.log('[Payment Service] ✅ Payment microservice initialized on port 5001');
  }

  /**
   * Setup REST API routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'payment-service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        capabilities: [
          'payment.processing',
          'payment.allocation',
          'payment.validation',
          'payment.reporting'
        ]
      });
    });

    // Create payment endpoint
    this.app.post('/payments', async (req, res) => {
      try {
        const paymentData = CreatePaymentSchema.parse(req.body);
        
        // Generate payment ID and correlation ID
        const paymentId = ulid();
        const correlationId = ulid();
        
        // Create payment processing message
        const paymentMessage: PaymentProcessingMessage = {
          payment_id: paymentId,
          loan_id: paymentData.loan_id,
          source: paymentData.payment_method,
          amount_cents: paymentData.amount_cents,
          payment_date: paymentData.payment_date,
          reference_number: paymentData.reference_number,
          bank_account_id: paymentData.bank_account_id,
          notes: paymentData.notes,
          processing_options: {
            validate_loan: true,
            check_balances: true,
            apply_waterfall: true,
            update_escrow: true
          }
        };

        // Publish to payment processing queue
        const envelope = createEnvelope({
          tenantId: 'default',
          correlationId,
          payload: paymentMessage
        });

        await this.publishChannel.publish(
          Exchanges.Commands,
          'tenant.default.payment.process',
          Buffer.from(JSON.stringify(envelope))
        );

        res.status(202).json({
          success: true,
          payment_id: paymentId,
          correlation_id: correlationId,
          status: 'processing',
          message: 'Payment submitted for processing'
        });

      } catch (error) {
        console.error('[Payment Service] Error creating payment:', error);
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Allocate payment endpoint
    this.app.post('/payments/:paymentId/allocate', async (req, res) => {
      try {
        const { paymentId } = req.params;
        const allocationData = AllocatePaymentSchema.parse(req.body);
        
        const correlationId = ulid();
        
        // Create allocation message
        const allocationMessage = {
          payment_id: paymentId,
          allocation_rules: allocationData.allocation_rules || {
            fees_first: true,
            interest_before_principal: true
          },
          correlation_id: correlationId
        };

        // Publish to payment allocation queue
        const envelope = createEnvelope({
          tenantId: 'default',
          correlationId,
          payload: allocationMessage
        });

        await this.publishChannel.publish(
          Exchanges.Commands,
          'tenant.default.payment.allocate',
          Buffer.from(JSON.stringify(envelope))
        );

        res.status(202).json({
          success: true,
          payment_id: paymentId,
          correlation_id: correlationId,
          status: 'allocating',
          message: 'Payment allocation submitted for processing'
        });

      } catch (error) {
        console.error('[Payment Service] Error allocating payment:', error);
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get payment status endpoint
    this.app.get('/payments/:paymentId/status', async (req, res) => {
      try {
        const { paymentId } = req.params;
        
        // TODO: Query payment status from database or cache
        // For now, return a simulated status
        res.json({
          success: true,
          payment_id: paymentId,
          status: 'processed',
          allocation_status: 'completed',
          processed_at: new Date().toISOString()
        });

      } catch (error) {
        console.error('[Payment Service] Error getting payment status:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  /**
   * Start queue consumers for payment processing
   */
  private async startConsumers(): Promise<void> {
    if (!this.connection) return;

    // The actual payment processing is handled by existing payment-consumer
    // This service acts as an API gateway and coordinator
    console.log('[Payment Service] Queue consumers delegation to payment-consumer');
  }

  /**
   * Start the payment service server
   */
  async start(): Promise<void> {
    const port = 5001;
    
    this.app.listen(port, '0.0.0.0', () => {
      console.log(`[Payment Service] 🚀 Payment microservice running on port ${port}`);
      
      // Update service status to healthy
      if (this.serviceInstance) {
        globalServiceRegistry.updateServiceHealth(this.serviceInstance.serviceId, 'healthy');
      }
    });
  }

  /**
   * Stop the payment service
   */
  async stop(): Promise<void> {
    if (this.publishChannel) {
      await this.publishChannel.close();
    }
    
    if (this.serviceInstance) {
      await globalServiceRegistry.deregisterService(this.serviceInstance.serviceId);
    }
    
    console.log('[Payment Service] Payment microservice stopped');
  }
}

// Export service instance
export const paymentService = new PaymentService();