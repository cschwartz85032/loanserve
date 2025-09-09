/**
 * Escrow Microservice - Phase 3: Independent Escrow Management Service
 * Handles all escrow-related operations independently using queue communication
 */

import express from 'express';
import type { Connection } from 'amqplib';
import { globalServiceRegistry, type ServiceDefinition } from './service-registry';
import { createEnvelope } from '../messaging/envelope-helpers';
import { Exchanges } from '../queues/topology';
import { EscrowDisbursementSchema, type EscrowDisbursementMessage } from '../queues/escrow/escrow-consumer';
import { z } from 'zod';
import { ulid } from 'ulid';

// Escrow service API schemas
const CreateDisbursementSchema = z.object({
  loan_id: z.number(),
  disbursement_type: z.enum(['property_tax', 'homeowners_insurance', 'flood_insurance', 'pmi', 'hoa_fee', 'other']),
  payee_name: z.string(),
  payee_address: z.string().optional(),
  amount_cents: z.number().positive(),
  due_date: z.string(),
  account_number: z.string().optional(),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
  requires_approval: z.boolean().default(false)
});

const EscrowAnalysisSchema = z.object({
  loan_id: z.number(),
  analysis_type: z.enum(['annual', 'shortage', 'surplus', 'projection']).default('annual'),
  projection_months: z.number().min(1).max(24).default(12)
});

const ApproveDisbursementSchema = z.object({
  disbursement_id: z.string(),
  approved_by: z.number(),
  approval_notes: z.string().optional()
});

export class EscrowService {
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
   * Initialize escrow service
   */
  async initialize(connection: Connection): Promise<void> {
    this.connection = connection;
    this.publishChannel = await connection.createChannel();
    
    console.log('[Escrow Service] Initializing independent escrow microservice...');
    
    // Register with service registry
    const definition: ServiceDefinition = {
      name: 'escrow-service',
      version: '1.0.0',
      port: 5003,
      healthEndpoint: '/health',
      capabilities: [
        'escrow.disbursement',
        'escrow.analysis',
        'escrow.balance_management',
        'escrow.forecasting',
        'escrow.reporting'
      ],
      dependencies: ['loan-service', 'payment-service', 'database'],
      queueBindings: {
        consumes: ['tenant.*.escrow.disburse', 'tenant.*.escrow.analyze'],
        publishes: ['escrow.disbursement.processed', 'escrow.disbursement.failed', 'escrow.analysis.completed']
      }
    };

    this.serviceInstance = await globalServiceRegistry.registerService(definition);
    
    console.log('[Escrow Service] ✅ Escrow microservice initialized on port 5003');
  }

  /**
   * Setup REST API routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'escrow-service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        capabilities: [
          'escrow.disbursement',
          'escrow.analysis',
          'escrow.balance_management',
          'escrow.forecasting',
          'escrow.reporting'
        ]
      });
    });

    // Create escrow disbursement endpoint
    this.app.post('/disbursements', async (req, res) => {
      try {
        const disbursementData = CreateDisbursementSchema.parse(req.body);
        
        const disbursementId = ulid();
        const correlationId = ulid();
        
        // Create escrow disbursement message
        const escrowMessage: EscrowDisbursementMessage = {
          disbursement_id: disbursementId,
          loan_id: disbursementData.loan_id,
          disbursement_type: disbursementData.disbursement_type,
          payee_name: disbursementData.payee_name,
          payee_address: disbursementData.payee_address,
          amount_cents: disbursementData.amount_cents,
          due_date: disbursementData.due_date,
          account_number: disbursementData.account_number,
          reference_number: disbursementData.reference_number,
          notes: disbursementData.notes,
          requires_approval: disbursementData.requires_approval,
          requested_by: 1, // TODO: Get from authenticated user
          requested_at: new Date().toISOString()
        };

        // Publish to escrow disbursement queue
        const envelope = createEnvelope({
          tenantId: 'default',
          correlationId,
          payload: escrowMessage
        });

        await this.publishChannel.publish(
          Exchanges.Commands,
          'tenant.default.escrow.disburse',
          Buffer.from(JSON.stringify(envelope))
        );

        res.status(202).json({
          success: true,
          disbursement_id: disbursementId,
          correlation_id: correlationId,
          status: 'processing',
          message: 'Escrow disbursement submitted for processing',
          requires_approval: disbursementData.requires_approval
        });

      } catch (error) {
        console.error('[Escrow Service] Error creating disbursement:', error);
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    });

    // Approve disbursement endpoint
    this.app.post('/disbursements/:disbursementId/approve', async (req, res) => {
      try {
        const { disbursementId } = req.params;
        const approvalData = ApproveDisbursementSchema.parse(req.body);
        
        const correlationId = ulid();
        
        // Create approval message
        const approvalMessage = {
          disbursement_id: disbursementId,
          approved_by: approvalData.approved_by,
          approved_at: new Date().toISOString(),
          approval_notes: approvalData.approval_notes,
          action: 'approve'
        };

        // Publish approval event
        const envelope = createEnvelope({
          tenantId: 'default',
          correlationId,
          payload: approvalMessage
        });

        await this.publishChannel.publish(
          Exchanges.Events,
          'escrow.disbursement.approved',
          Buffer.from(JSON.stringify(envelope))
        );

        res.json({
          success: true,
          disbursement_id: disbursementId,
          correlation_id: correlationId,
          status: 'approved',
          message: 'Disbursement approved and queued for processing'
        });

      } catch (error) {
        console.error('[Escrow Service] Error approving disbursement:', error);
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    });

    // Run escrow analysis endpoint
    this.app.post('/analysis', async (req, res) => {
      try {
        const analysisData = EscrowAnalysisSchema.parse(req.body);
        
        const analysisId = ulid();
        const correlationId = ulid();
        
        // Create analysis message
        const analysisMessage = {
          analysis_id: analysisId,
          loan_id: analysisData.loan_id,
          analysis_type: analysisData.analysis_type,
          projection_months: analysisData.projection_months,
          requested_at: new Date().toISOString()
        };

        // Publish to escrow analysis queue
        const envelope = createEnvelope({
          tenantId: 'default',
          correlationId,
          payload: analysisMessage
        });

        await this.publishChannel.publish(
          Exchanges.Commands,
          'tenant.default.escrow.analyze',
          Buffer.from(JSON.stringify(envelope))
        );

        res.status(202).json({
          success: true,
          analysis_id: analysisId,
          correlation_id: correlationId,
          status: 'processing',
          message: 'Escrow analysis submitted for processing'
        });

      } catch (error) {
        console.error('[Escrow Service] Error running analysis:', error);
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get escrow account balance endpoint
    this.app.get('/accounts/:loanId/balance', async (req, res) => {
      try {
        const { loanId } = req.params;
        
        // TODO: Query escrow account from database
        // For now, return simulated data
        res.json({
          success: true,
          loan_id: parseInt(loanId),
          balance: {
            current_balance: 2500.00,
            required_balance: 2200.00,
            shortage: 0,
            surplus: 300.00,
            monthly_payment: 183.33,
            last_updated: new Date().toISOString()
          },
          next_disbursements: [
            {
              type: 'property_tax',
              amount: 850.00,
              due_date: '2025-02-15',
              payee: 'County Tax Assessor'
            },
            {
              type: 'homeowners_insurance',
              amount: 1200.00,
              due_date: '2025-03-01',
              payee: 'Insurance Company'
            }
          ]
        });

      } catch (error) {
        console.error('[Escrow Service] Error getting balance:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get disbursement status endpoint
    this.app.get('/disbursements/:disbursementId/status', async (req, res) => {
      try {
        const { disbursementId } = req.params;
        
        // TODO: Query disbursement status from database
        // For now, return simulated status
        res.json({
          success: true,
          disbursement_id: disbursementId,
          status: 'processed',
          disbursement_type: 'property_tax',
          payee_name: 'County Tax Assessor',
          amount: 850.00,
          processed_at: new Date().toISOString(),
          payment_method: 'ach',
          reference_number: 'ESC-' + disbursementId.slice(-8)
        });

      } catch (error) {
        console.error('[Escrow Service] Error getting disbursement status:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // List disbursements endpoint
    this.app.get('/disbursements', async (req, res) => {
      try {
        const { loan_id, status, disbursement_type } = req.query;
        
        // TODO: Query disbursements from database with filters
        // For now, return empty array
        res.json({
          success: true,
          disbursements: [],
          total: 0,
          filters: {
            loan_id,
            status,
            disbursement_type
          }
        });

      } catch (error) {
        console.error('[Escrow Service] Error listing disbursements:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }

  /**
   * Start the escrow service server
   */
  async start(): Promise<void> {
    const port = 5003;
    
    this.app.listen(port, '0.0.0.0', () => {
      console.log(`[Escrow Service] 🚀 Escrow microservice running on port ${port}`);
      
      // Update service status to healthy
      if (this.serviceInstance) {
        globalServiceRegistry.updateServiceHealth(this.serviceInstance.serviceId, 'healthy');
      }
    });
  }

  /**
   * Stop the escrow service
   */
  async stop(): Promise<void> {
    if (this.publishChannel) {
      await this.publishChannel.close();
    }
    
    if (this.serviceInstance) {
      await globalServiceRegistry.deregisterService(this.serviceInstance.serviceId);
    }
    
    console.log('[Escrow Service] Escrow microservice stopped');
  }
}

// Export service instance
export const escrowService = new EscrowService();