import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { complianceAudit, COMPLIANCE_EVENTS } from './compliance/auditService';
import { db } from "./db";
import { getRealUserIP } from './utils/audit-helper.js';
import { sql } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { analyzeDocument } from "./openai";
import feeRoutes from "./routes/fees";
import { registerLedgerRoutes } from "./routes/ledger";
import authRoutes from "./routes/auth";
import { adminUsersRouter } from "./routes/admin-users";
import { ipAllowlistRouter } from "./routes/ip-allowlist";
import mfaRoutes from "./routes/mfa";
import crmRoutes from "./routes/crm";
import crmEmailRoutes from "./crm/email-routes";
import communicationPreferencesRoutes from "./routes/communication-preferences";
import { registerBorrowerRoutes } from "./routes/borrower";
import { settingsRouter } from "./routes/settings";
import { noticeTemplatesRouter } from "./routes/notice-templates";
import { emailTemplatesRouter } from "./routes/email-templates";
import paymentRoutes from "./routes/payment-routes";
import rabbitmqConfigRoutes from "./routes/rabbitmq-config";
import metricsRoutes from "./routes/metrics";
import { 
  insertLoanSchema, 
  insertPaymentSchema, 
  insertEscrowAccountSchema,
  insertEscrowTransactionSchema,
  insertDocumentSchema,
  insertNotificationSchema,
  insertBorrowerEntitySchema,
  insertPropertySchema,
  insertLoanBorrowerSchema,
  insertPaymentScheduleSchema,
  insertEscrowDisbursementSchema,
  insertInvestorSchema
} from "@shared/schema";
import {
  loadUserPolicy,
  requireAuth,
  requirePermission,
  applyPIIMasking,
  requireAdmin,
  requireRole,
  auditLog
} from "./auth/middleware";
import { PermissionLevel } from "./auth/policy-engine";
import { 
  handleError, 
  asyncHandler, 
  validateInput, 
  successResponse, 
  paginatedResponse, 
  AppError, 
  ErrorCode 
} from './utils/error-handler';

function isAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}

// Configure multer for file uploads
const uploadStorage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const uploadDir = 'server/uploads';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
    } catch (error) {
      console.error('Error creating upload directory:', error);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: uploadStorage });

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check routes (no auth required - must be accessible for monitoring)
  const healthRoutes = (await import('./routes/health')).default;
  app.use('/healthz', healthRoutes);
  app.use('/', metricsRoutes); // Prometheus metrics endpoint at /metrics

  // Mount Column webhook BEFORE JSON parser (needs raw body for signature verification)
  const columnWebhookHandler = await import('./routes/webhook-column');
  app.use(columnWebhookHandler.default);

  // Setup authentication
  await setupAuth(app);

  // Apply global middleware for policy engine (must be after auth setup)
  // Only apply to API routes to avoid blocking frontend HTML serving
  app.use(loadUserPolicy); // Load user policy for ALL requests (middleware will filter)
  app.use('/api', applyPIIMasking()); // Apply PII masking for regulators
  
  // Register auth routes after policy middleware
  app.use('/api/auth', authRoutes);

  // Register admin routes (requires authentication)
  app.use('/api/admin/users', adminUsersRouter);
  app.use('/api/ip-allowlist', ipAllowlistRouter);
  app.use('/api', settingsRouter);
  app.use('/api', noticeTemplatesRouter);
  app.use('/api', emailTemplatesRouter);
  app.use('/api', rabbitmqConfigRoutes);
  
  // Register MFA routes
  app.use('/api/mfa', mfaRoutes);

  // Register CRM routes
  app.use('/api', crmRoutes);
  app.use('/api/crm/emails', crmEmailRoutes);
  app.use('/api/communication-preferences', communicationPreferencesRoutes);

  // Register Borrower Portal routes
  registerBorrowerRoutes(app);

  // Register payment processing routes
  app.use('/api', paymentRoutes);

  // Register Column banking routes (Step 17)
  const columnWebhookRoutes = await import('./routes/column-webhooks');
  app.use('/api', columnWebhookRoutes.default);

  // Register Compliance routes (Phase 9)
  const complianceRoutes = await import('./routes/compliance');
  app.use(complianceRoutes.default);
  
  // Register Compliance Console routes (Phase 9)
  const complianceConsoleRoutes = await import('./routes/compliance-console');
  app.use('/api/compliance', complianceConsoleRoutes.default);
  console.log('[Routes] Registered compliance console routes');

  // Register Beneficiary and Investor audit routes (Phase 9 Enhanced CRM)
  const beneficiaryRoutes = await import('./routes/beneficiary-routes');
  app.use('/api', beneficiaryRoutes.default);
  console.log('[Routes] Registered beneficiary audit routes');

  const investorRoutes = await import('./routes/investor-routes');
  app.use('/api', investorRoutes.default);
  console.log('[Routes] Registered investor audit routes');
  
  console.log('[Routes] Registered Column banking routes');

  // Register payment ingestion routes (Step 2)
  const paymentIngestionRoutes = (await import('./routes/payment-ingestion')).default;
  app.use('/api/payment-ingestions', paymentIngestionRoutes);

  // Register payment artifact routes (Step 3)
  const paymentArtifactRoutes = (await import('./routes/payment-artifact')).default;
  app.use('/api/payment-artifacts', paymentArtifactRoutes);

  // Register payment event routes (Step 4)
  const paymentEventRoutes = (await import('./routes/payment-event')).default;
  app.use('/api/payment-events', paymentEventRoutes);

  // Register enhanced payment UI routes
  const enhancedPaymentRoutes = (await import('./routes/payments')).default;
  app.use('/api', enhancedPaymentRoutes);

  // Register queue monitoring routes
  const queueMonitorRoutes = (await import('./routes/queue-monitor-routes.js')).default;
  app.use('/api/queue-monitor', queueMonitorRoutes);

  // Register DLQ management routes
  const dlqRoutes = (await import('./routes/dlq-routes.js')).default;
  app.use('/api', dlqRoutes);

  // Register Phase 3 Escrow Subsystem routes
  const { escrowRoutes } = await import('./escrow/routes');
  app.use('/api/escrow', escrowRoutes);
  console.log('[Routes] Registered escrow subsystem routes');

  // Register Phase 4 Documents and Notices routes
  const documentRoutes = (await import('./docs/routes')).default;
  app.use(documentRoutes);
  console.log('[Routes] Registered document generation routes');

  // Register Phase 6 Cash Management and Reconciliation routes
  const { registerCashRoutes } = await import('./cash/routes');
  const { pool } = await import('./db');
  registerCashRoutes(app, pool);
  console.log('[Routes] Registered cash management routes');

  // Register Phase 7 Investor Remittance routes
  const { createRemittanceRoutes } = await import('./remittance/routes');
  app.use('/api/remittance', createRemittanceRoutes(pool));
  console.log('[Routes] Registered investor remittance routes');

  // Serve observability dashboard
  app.get('/observability', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'server/observability/dashboard-ui.html'));
  });

  // ============= BORROWER ENTITY ROUTES =============
  app.get("/api/borrowers", 
    requireAuth,
    requirePermission('Loans', PermissionLevel.Read),
    async (req, res) => {
    try {
      const borrowers = await storage.getBorrowerEntities();
      res.json(borrowers);
    } catch (error) {
      console.error("Error fetching borrowers:", error);
      res.status(500).json({ error: "Failed to fetch borrowers" });
    }
  });

  app.get("/api/borrowers/:id", async (req, res) => {
    try {
      const borrower = await storage.getBorrowerEntity(parseInt(req.params.id));
      if (!borrower) {
        return res.status(404).json({ error: "Borrower not found" });
      }
      res.json(borrower);
    } catch (error) {
      console.error("Error fetching borrower:", error);
      res.status(500).json({ error: "Failed to fetch borrower" });
    }
  });

  app.post("/api/borrowers", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertBorrowerEntitySchema.parse(req.body);
      const borrower = await storage.createBorrowerEntity(validatedData);
      
      await complianceAudit.logEvent({
        actorType: 'user',
        actorId: req.user?.id,
        eventType: COMPLIANCE_EVENTS.BORROWER.CREATED,
        resourceType: 'borrower',
        resourceId: borrower.id,
        newValues: borrower,
        ipAddr: getRealUserIP(req),
        userAgent: req.headers['user-agent']
      });

      res.status(201).json(borrower);
    } catch (error) {
      console.error("Error creating borrower:", error);
      res.status(400).json({ error: "Invalid borrower data" });
    }
  });

  app.put("/api/borrowers/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingBorrower = await storage.getBorrowerEntity(id);
      if (!existingBorrower) {
        return res.status(404).json({ error: "Borrower not found" });
      }

      const borrower = await storage.updateBorrowerEntity(id, req.body);
      
      await complianceAudit.logEvent({
        actorType: 'user',
        actorId: req.user?.id,
        eventType: COMPLIANCE_EVENTS.BORROWER.UPDATED,
        resourceType: 'borrower',
        resourceId: borrower.id,
        previousValues: existingBorrower,
        newValues: borrower,
        ipAddr: getRealUserIP(req),
        userAgent: req.headers['user-agent']
      });

      res.json(borrower);
    } catch (error) {
      console.error("Error updating borrower:", error);
      res.status(400).json({ error: "Failed to update borrower" });
    }
  });

  // ============= PROPERTY ROUTES =============
  app.get("/api/properties", async (req, res) => {
    try {
      const properties = await storage.getProperties();
      res.json(properties);
    } catch (error) {
      console.error("Error fetching properties:", error);
      res.status(500).json({ error: "Failed to fetch properties" });
    }
  });

  app.get("/api/properties/:id", async (req, res) => {
    try {
      const property = await storage.getProperty(parseInt(req.params.id));
      if (!property) {
        return res.status(404).json({ error: "Property not found" });
      }
      res.json(property);
    } catch (error) {
      console.error("Error fetching property:", error);
      res.status(500).json({ error: "Failed to fetch property" });
    }
  });

  app.post("/api/properties", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertPropertySchema.parse(req.body);
      const property = await storage.createProperty(validatedData);
      
      await complianceAudit.logEvent({
        actorType: 'user',
        actorId: req.user?.id,
        eventType: COMPLIANCE_EVENTS.PROPERTY.CREATED,
        resourceType: 'property',
        resourceId: property.id,
        newValues: property,
        ipAddr: getRealUserIP(req),
        userAgent: req.headers['user-agent']
      });

      res.status(201).json(property);
    } catch (error: any) {
      console.error("Error creating property:", error);
      const errorMessage = error.issues ? error.issues[0].message : error.message || "Invalid property data";
      res.status(400).json({ error: errorMessage, details: error.issues || error.message });
    }
  });

  app.put("/api/properties/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingProperty = await storage.getProperty(id);
      if (!existingProperty) {
        return res.status(404).json({ error: "Property not found" });
      }

      const property = await storage.updateProperty(id, req.body);
      
      await complianceAudit.logEvent({
        actorType: 'user',
        actorId: req.user?.id,
        eventType: COMPLIANCE_EVENTS.PROPERTY.UPDATED,
        resourceType: 'property',
        resourceId: property.id,
        previousValues: existingProperty,
        newValues: property,
        ipAddr: getRealUserIP(req),
        userAgent: req.headers['user-agent']
      });

      res.json(property);
    } catch (error) {
      console.error("Error updating property:", error);
      res.status(400).json({ error: "Failed to update property" });
    }
  });

  // ============= LOAN ROUTES =============
  app.get("/api/loans", 
    requireAuth,
    requirePermission('Loans', PermissionLevel.Read),
    async (req: any, res) => {
    try {
      // Apply row-level filter if present
      let filters: any = {};
      if (req.rowLevelFilter) {
        filters = { ...req.rowLevelFilter };
      }
      
      const { 
        lenderId, 
        servicerId, 
        investorId, 
        status, 
        limit = "50", 
        offset = "0" 
      } = req.query as Record<string, string>;

      const loans = await storage.getLoans({
        lenderId: lenderId ? parseInt(lenderId) : undefined,
        servicerId: servicerId ? parseInt(servicerId) : undefined,
        investorId: investorId ? parseInt(investorId) : undefined,
        status: status || undefined,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json(loans);
    } catch (error) {
      console.error("Error fetching loans:", error);
      res.status(500).json({ error: "Failed to fetch loans" });
    }
  });

  app.get("/api/loans/metrics", async (req, res) => {
    try {
      const userId = req.user?.id;
      const metrics = await storage.getLoanMetrics(userId);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching loan metrics:", error);
      res.status(500).json({ error: "Failed to fetch metrics" });
    }
  });

  app.get("/api/loans/:id", async (req, res) => {
    try {
      const loan = await storage.getLoan(parseInt(req.params.id));
      if (!loan) {
        return res.status(404).json({ error: "Loan not found" });
      }
      res.json(loan);
    } catch (error) {
      console.error("Error fetching loan:", error);
      res.status(500).json({ error: "Failed to fetch loan" });
    }
  });

  app.post("/api/loans", isAuthenticated, asyncHandler(async (req, res) => {
    console.log("=== BACKEND: LOAN CREATION ENDPOINT CALLED (v2) ===");
    
    // Validate input with centralized error handling
    const validatedData = validateInput(insertLoanSchema, req.body, 'Invalid loan data');
    console.log("Validation successful.");
    
    // Create loan with transaction (already implemented in storage)
    console.log("Calling storage.createLoan...");
    const loan = await storage.createLoan(validatedData);
    console.log("Loan created in database:", loan);
    
    await complianceAudit.logEvent({
      actorType: 'user',
      actorId: req.user?.id,
      eventType: COMPLIANCE_EVENTS.LOAN.CREATED,
      resourceType: 'loan',
      resourceId: loan.id,
      loanId: loan.id,
      newValues: loan,
      ipAddr: req.ip,
      userAgent: req.headers['user-agent']
    });

    console.log("Sending success response");
    return successResponse(res, loan, 201);
  }));

  app.delete("/api/loans/:id", isAuthenticated, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    const existingLoan = await storage.getLoan(id);
    if (!existingLoan) {
      throw new AppError('Loan not found', ErrorCode.NOT_FOUND, 404);
    }

    // Delete loan with transaction (already implemented in storage)
    await storage.deleteLoan(id);
    res.status(204).send();
  }));

  // Handler for updating loans
  const updateLoanHandler = async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const existingLoan = await storage.getLoan(id);
      if (!existingLoan) {
        return res.status(404).json({ error: "Loan not found" });
      }

      // Remove timestamp fields that are automatically managed
      const { createdAt, updatedAt, ...updateData } = req.body;
      
      // Extract property-related fields that belong in properties table
      const propertyFields: any = {};
      const loanFields: any = {};
      
      // Separate property fields from loan fields
      Object.entries(updateData).forEach(([key, value]) => {
        if (key === 'parcelNumber') {
          // Map parcelNumber to apn for properties table
          propertyFields.apn = value;
        } else if (key === 'legalDescription') {
          propertyFields.legalDescription = value;
        } else if (key === 'propertyValue') {
          // Map propertyValue to currentValue for properties table
          propertyFields.currentValue = value === '' ? null : value;
        } else if (key === 'propertyAddress') {
          propertyFields.address = value;
        } else if (key === 'propertyCity') {
          propertyFields.city = value;
        } else if (key === 'propertyState') {
          propertyFields.state = value;
        } else if (key === 'propertyZip') {
          propertyFields.zipCode = value;
        } else if (key === 'propertyType') {
          propertyFields.propertyType = value;
        } else {
          loanFields[key] = value;
        }
      });
      
      // Clean the loan data: convert empty strings to null for numeric/integer fields
      const cleanedLoanData = Object.entries(loanFields).reduce((acc: any, [key, value]) => {
        // Integer fields that should be null instead of empty string
        const integerFields = ['gracePeriodDays', 'loanTerm', 'amortizationTerm', 'balloonMonths', 
                              'prepaymentPenaltyTerm', 'rateAdjustmentFrequency', 'yearBuilt', 
                              'squareFeet', 'bedrooms', 'bathrooms', 'stories', 'garageSpaces'];
        
        // Numeric/decimal fields that should be null instead of empty string
        const numericFields = ['servicingFee', 'lateCharge', 'interestRate', 'margin', 
                              'rateCapInitial', 'rateCapPeriodic', 'rateCapLifetime', 'rateFloor',
                              'balloonAmount', 'prepaymentPenaltyAmount',
                              'originalAmount', 'principalBalance', 'paymentAmount', 'monthlyEscrow',
                              'monthlyMI', 'originalLTV', 'currentLTV', 'combinedLTV',
                              'propertyTax', 'homeInsurance', 'pmi', 'otherMonthly',
                              'hazardInsurance', 'propertyTaxes', 'hoaFees', 'pmiAmount',
                              'principalAndInterest', 'escrowAmount', 'closingCosts', 'downPayment',
                              'borrowerIncome', 'coBorrowerIncome', 'creditScoreEquifax', 
                              'creditScoreExperian', 'creditScoreTransunion',
                              'coBorrowerCreditScoreEquifax', 'coBorrowerCreditScoreExperian', 
                              'coBorrowerCreditScoreTransunion', 'purchasePrice', 'originalAppraisalValue',
                              'currentValue', 'annualPropertyTax', 'annualInsurance', 'annualHOA',
                              'lotSize', 'rentalIncome'];
        
        if ((integerFields.includes(key) || numericFields.includes(key)) && value === '') {
          acc[key] = null;
        } else {
          acc[key] = value;
        }
        return acc;
      }, {});
      
      // Update property if there are property fields to update
      if (Object.keys(propertyFields).length > 0 && existingLoan.propertyId) {
        await storage.updateProperty(existingLoan.propertyId, propertyFields);
        console.log(`Updated property ${existingLoan.propertyId} with:`, propertyFields);
      }
      
      // Update loan fields if there are any
      let loan = existingLoan;
      if (Object.keys(cleanedLoanData).length > 0) {
        loan = await storage.updateLoan(id, cleanedLoanData);
      }
      
      // Implement field-by-field audit logging for loan fields
      if (Object.keys(cleanedLoanData).length > 0) {
        for (const [field, newValue] of Object.entries(cleanedLoanData)) {
          const oldValue = (existingLoan as any)[field];
          
          // Only log if the value actually changed (use String conversion for comparison)
          if (String(oldValue) !== String(newValue)) {
            await complianceAudit.logEvent({
              eventType: COMPLIANCE_EVENTS.LOAN.UPDATED,
              actorType: 'user',
              actorId: req.user?.id?.toString() || '1',
              resourceType: 'loan',
              resourceId: loan.id.toString(),
              loanId: loan.id,
              ipAddr: getRealUserIP(req),
              userAgent: req.headers?.['user-agent'],
              description: `Loan field '${field}' updated from '${oldValue}' to '${newValue}' on ${existingLoan.loanNumber}`,
              previousValues: { [field]: oldValue },
              newValues: { [field]: newValue },
              changedFields: [field]
            });
          }
        }
      }

      // Implement field-by-field audit logging for property fields
      if (Object.keys(propertyFields).length > 0) {
        // Get the existing property data for comparison
        const existingProperty = await storage.getProperty(existingLoan.propertyId);
        
        for (const [field, newValue] of Object.entries(propertyFields)) {
          const oldValue = (existingProperty as any)[field];
          
          // Only log if the value actually changed (use String conversion for comparison)
          if (String(oldValue) !== String(newValue)) {
            await complianceAudit.logEvent({
              eventType: COMPLIANCE_EVENTS.PROPERTY.UPDATED,
              actorType: 'user',
              actorId: req.user?.id?.toString() || '1',
              resourceType: 'property',
              resourceId: existingLoan.propertyId.toString(),
              loanId: loan.id,
              ipAddr: getRealUserIP(req),
              userAgent: req.headers?.['user-agent'],
              description: `Property field '${field}' updated from '${oldValue}' to '${newValue}' on ${existingLoan.loanNumber}`,
              previousValues: { [field]: oldValue },
              newValues: { [field]: newValue },
              changedFields: [field]
            });
          }
        }
      }

      // Send cache invalidation signals in response headers for client-side cache refresh
      res.setHeader('X-Cache-Invalidate', JSON.stringify([
        `/api/compliance/audit-log`,
        `/api/loans/${loan.id}`
      ]));

      res.json(loan);
    } catch (error) {
      console.error("Error updating loan:", error);
      res.status(400).json({ error: "Failed to update loan" });
    }
  };

  // Support both PUT and PATCH for loan updates
  app.put("/api/loans/:id", isAuthenticated, updateLoanHandler);
  app.patch("/api/loans/:id", isAuthenticated, updateLoanHandler);

  // ============= LOAN BORROWER ROUTES =============
  app.get("/api/loans/:loanId/borrowers", async (req, res) => {
    try {
      const loanBorrowers = await storage.getLoanBorrowers(parseInt(req.params.loanId));
      res.json(loanBorrowers);
    } catch (error) {
      console.error("Error fetching loan borrowers:", error);
      res.status(500).json({ error: "Failed to fetch loan borrowers" });
    }
  });

  app.post("/api/loans/:loanId/borrowers", isAuthenticated, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const validatedData = insertLoanBorrowerSchema.parse({
        ...req.body,
        loanId
      });
      const loanBorrower = await storage.createLoanBorrower(validatedData);
      res.status(201).json(loanBorrower);
    } catch (error) {
      console.error("Error creating loan borrower:", error);
      res.status(400).json({ error: "Invalid loan borrower data" });
    }
  });

  app.delete("/api/loan-borrowers/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req as any).user?.id || 1;
      
      // Get existing loan borrower before deletion for audit
      const loanBorrowers = await db.select().from(loanBorrower).where(eq(loanBorrower.id, id));
      const existingLoanBorrower = loanBorrowers[0];
      
      await storage.deleteLoanBorrower(id);
      
      // Log compliance audit
      if (existingLoanBorrower) {
        await complianceAudit.logEvent({
          actorType: 'user',
          actorId: userId.toString(),
          eventType: 'LOAN.BORROWER_REMOVED',
          resourceType: 'loan_borrower',
          resourceId: id.toString(),
          details: {
            action: 'delete_loan_borrower',
            loanBorrowerId: id,
            loanId: existingLoanBorrower.loanId,
            borrowerId: existingLoanBorrower.borrowerId,
            userId,
            previousValues: existingLoanBorrower
          },
          userId,
          ipAddress: (req as any).ip,
          userAgent: (req as any).headers?.['user-agent']
        });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting loan borrower:", error);
      res.status(400).json({ error: "Failed to delete loan borrower" });
    }
  });

  // ============= INVESTOR ROUTES =============
  app.get("/api/loans/:loanId/investors", async (req, res) => {
    try {
      const investors = await storage.getInvestorsByLoan(parseInt(req.params.loanId));
      res.json(investors);
    } catch (error) {
      console.error("Error fetching investors:", error);
      res.status(500).json({ error: "Failed to fetch investors" });
    }
  });

  app.post("/api/loans/:loanId/investors", isAuthenticated, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      
      // Generate unique investor ID if not provided
      const investorId = req.body.investorId || `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const validatedData = insertInvestorSchema.parse({
        ...req.body,
        loanId,
        investorId
      });
      
      const investor = await storage.createInvestor(validatedData);
      res.status(201).json(investor);
    } catch (error) {
      console.error("Error creating investor:", error);
      res.status(400).json({ error: "Invalid investor data" });
    }
  });

  app.put("/api/investors/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const actorId = req.user?.id?.toString() || 'system';
      
      // Get current investor data before update for audit
      const previousInvestor = await storage.getInvestor(id);
      if (!previousInvestor) {
        return res.status(404).json({ error: "Investor not found" });
      }
      
      // Remove timestamp fields that are automatically managed
      const { createdAt, updatedAt, ...updateData } = req.body;
      
      // Ensure dates are properly formatted
      if (updateData.investmentDate) {
        updateData.investmentDate = typeof updateData.investmentDate === 'string' 
          ? updateData.investmentDate 
          : new Date(updateData.investmentDate).toISOString().split('T')[0];
      }
      
      const investor = await storage.updateInvestor(id, updateData);
      
      // Determine what changed for audit
      const changedFields = [];
      const oldValues: any = {};
      const newValues: any = {};
      
      for (const [key, newValue] of Object.entries(updateData)) {
        const oldValue = (previousInvestor as any)[key];
        if (oldValue !== newValue) {
          changedFields.push(key);
          oldValues[key] = oldValue;
          newValues[key] = newValue;
        }
      }
      
      // Log separate audit event for each changed field
      if (changedFields.length > 0) {
        for (const field of changedFields) {
          await complianceAudit.logEvent({
            actorType: 'user',
            actorId: actorId,
            eventType: 'CRM.INVESTOR.FIELD_UPDATED',
            resourceType: 'investor',
            resourceId: id.toString(),
            loanId: investor.loanId,
            previousValues: { [field]: oldValues[field] },
            newValues: { [field]: newValues[field] },
            changedFields: [field],
            ipAddr: getRealUserIP(req),
            userAgent: req.get('user-agent'),
            description: `Investor ${investor.investorId || investor.name} field '${field}' updated from '${oldValues[field]}' to '${newValues[field]}'`
          });
        }
      }
      
      res.json(investor);
    } catch (error) {
      console.error("Error updating investor:", error);
      res.status(400).json({ error: "Failed to update investor" });
    }
  });

  app.delete("/api/investors/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteInvestor(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting investor:", error);
      res.status(400).json({ error: "Failed to delete investor" });
    }
  });

  // ============= PAYMENT ROUTES =============
  app.get("/api/loans/:loanId/payments", async (req, res) => {
    try {
      const { limit = "50" } = req.query as Record<string, string>;
      const payments = await storage.getPayments(parseInt(req.params.loanId), parseInt(limit));
      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });

  app.post("/api/loans/:loanId/payments", isAuthenticated, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const validatedData = insertPaymentSchema.parse({
        ...req.body,
        loanId
      });
      const payment = await storage.createPayment(validatedData);
      
      await complianceAudit.logEvent({
        actorType: 'user',
        actorId: req.user?.id,
        eventType: COMPLIANCE_EVENTS.PAYMENT.CREATED,
        resourceType: 'payment',
        resourceId: payment.id,
        loanId: loanId,
        newValues: payment,
        ipAddr: getRealUserIP(req),
        userAgent: req.headers['user-agent']
      });

      res.status(201).json(payment);
    } catch (error) {
      console.error("Error creating payment:", error);
      res.status(400).json({ error: "Invalid payment data" });
    }
  });

  app.put("/api/payments/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const payment = await storage.updatePayment(id, req.body);
      
      await complianceAudit.logEvent({
        actorType: 'user',
        actorId: req.user?.id,
        eventType: COMPLIANCE_EVENTS.PAYMENT.UPDATED,
        resourceType: 'payment',
        resourceId: payment.id,
        loanId: payment.loanId,
        previousValues: await storage.getPayment(id),
        newValues: payment,
        ipAddr: getRealUserIP(req),
        userAgent: req.headers['user-agent']
      });

      res.json(payment);
    } catch (error) {
      console.error("Error updating payment:", error);
      res.status(400).json({ error: "Failed to update payment" });
    }
  });

  // ============= PAYMENT SCHEDULE ROUTES =============
  app.get("/api/loans/:loanId/payment-schedule", async (req, res) => {
    try {
      const schedule = await storage.getPaymentSchedule(parseInt(req.params.loanId));
      res.json(schedule);
    } catch (error) {
      console.error("Error fetching payment schedule:", error);
      res.status(500).json({ error: "Failed to fetch payment schedule" });
    }
  });

  app.post("/api/loans/:loanId/payment-schedule", isAuthenticated, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const validatedData = insertPaymentScheduleSchema.parse({
        ...req.body,
        loanId
      });
      const schedule = await storage.createPaymentSchedule(validatedData);
      res.status(201).json(schedule);
    } catch (error) {
      console.error("Error creating payment schedule:", error);
      res.status(400).json({ error: "Invalid payment schedule data" });
    }
  });

  app.post("/api/loans/:loanId/payment-schedule/generate", isAuthenticated, async (req, res) => {
    try {
      const schedule = await storage.generatePaymentSchedule(parseInt(req.params.loanId));
      res.json(schedule);
    } catch (error) {
      console.error("Error generating payment schedule:", error);
      res.status(500).json({ error: "Failed to generate payment schedule" });
    }
  });

  // ============= ESCROW ROUTES =============
  app.get("/api/loans/:loanId/escrow", async (req, res) => {
    try {
      const escrowAccount = await storage.getEscrowAccount(parseInt(req.params.loanId));
      if (!escrowAccount) {
        return res.status(404).json({ error: "Escrow account not found" });
      }
      res.json(escrowAccount);
    } catch (error) {
      console.error("Error fetching escrow account:", error);
      res.status(500).json({ error: "Failed to fetch escrow account" });
    }
  });

  app.post("/api/loans/:loanId/escrow", isAuthenticated, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const validatedData = insertEscrowAccountSchema.parse({
        ...req.body,
        loanId
      });
      const escrowAccount = await storage.createEscrowAccount(validatedData);
      
      await complianceAudit.logEvent({
        actorType: 'user',
        actorId: req.user?.id,
        eventType: COMPLIANCE_EVENTS.ESCROW.ACCOUNT_CREATED,
        resourceType: 'escrow_account',
        resourceId: escrowAccount.id,
        loanId: loanId,
        newValues: escrowAccount,
        ipAddr: getRealUserIP(req),
        userAgent: req.headers['user-agent']
      });

      res.status(201).json(escrowAccount);
    } catch (error) {
      console.error("Error creating escrow account:", error);
      res.status(400).json({ error: "Invalid escrow account data" });
    }
  });

  app.put("/api/escrow/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const escrowAccount = await storage.updateEscrowAccount(id, req.body);
      
      await complianceAudit.logEvent({
        actorType: 'user',
        actorId: req.user?.id,
        eventType: COMPLIANCE_EVENTS.ESCROW.ACCOUNT_UPDATED,
        resourceType: 'escrow_account',
        resourceId: escrowAccount.id,
        loanId: escrowAccount.loanId,
        previousValues: await storage.getEscrowAccount(id),
        newValues: escrowAccount,
        ipAddr: getRealUserIP(req),
        userAgent: req.headers['user-agent']
      });

      res.json(escrowAccount);
    } catch (error) {
      console.error("Error updating escrow account:", error);
      res.status(400).json({ error: "Failed to update escrow account" });
    }
  });

  app.get("/api/escrow/metrics", async (req, res) => {
    try {
      const metrics = await storage.getEscrowMetrics();
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching escrow metrics:", error);
      res.status(500).json({ error: "Failed to fetch escrow metrics" });
    }
  });

  // ============= ESCROW PAYMENTS ROUTES (for legacy compatibility) =============
  app.get("/api/escrow-payments", async (req, res) => {
    try {
      const { limit = "10" } = req.query as Record<string, string>;
      // Return recent escrow transactions across all accounts
      const transactions = await storage.getEscrowTransactions({
        limit: parseInt(limit)
      });
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching escrow payments:", error);
      res.status(500).json({ error: "Failed to fetch escrow payments" });
    }
  });

  // ============= ESCROW TRANSACTION ROUTES =============
  app.get("/api/escrow/:escrowId/transactions", async (req, res) => {
    try {
      const { limit = "50" } = req.query as Record<string, string>;
      const transactions = await storage.getEscrowTransactions({
        escrowAccountId: parseInt(req.params.escrowId),
        limit: parseInt(limit)
      });
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching escrow transactions:", error);
      res.status(500).json({ error: "Failed to fetch escrow transactions" });
    }
  });

  app.post("/api/escrow/:escrowId/transactions", isAuthenticated, async (req, res) => {
    try {
      const escrowAccountId = parseInt(req.params.escrowId);
      const validatedData = insertEscrowTransactionSchema.parse({
        ...req.body,
        escrowAccountId
      });
      const transaction = await storage.createEscrowTransaction(validatedData);
      
      await complianceAudit.logEvent({
        actorType: 'user',
        actorId: req.user?.id,
        eventType: COMPLIANCE_EVENTS.ESCROW.DISBURSEMENT_COMPLETED,
        resourceType: 'escrow_transaction',
        resourceId: transaction.id,
        newValues: transaction,
        ipAddr: getRealUserIP(req),
        userAgent: req.headers['user-agent']
      });

      res.status(201).json(transaction);
    } catch (error) {
      console.error("Error creating escrow transaction:", error);
      res.status(400).json({ error: "Invalid escrow transaction data" });
    }
  });

  // ============= ESCROW ITEM ROUTES =============
  app.get("/api/escrow/:escrowId/items", async (req, res) => {
    try {
      const items = await storage.getEscrowItems(parseInt(req.params.escrowId));
      res.json(items);
    } catch (error) {
      console.error("Error fetching escrow items:", error);
      res.status(500).json({ error: "Failed to fetch escrow items" });
    }
  });

  app.post("/api/escrow/:escrowId/items", isAuthenticated, async (req, res) => {
    try {
      const escrowAccountId = parseInt(req.params.escrowId);
      const validatedData = insertEscrowItemSchema.parse({
        ...req.body,
        escrowAccountId
      });
      const item = await storage.createEscrowItem(validatedData);
      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating escrow item:", error);
      res.status(400).json({ error: "Invalid escrow item data" });
    }
  });

  // ============= DOCUMENT ROUTES =============
  
  // Document upload endpoint with multipart/form-data support
  app.post("/api/documents/upload", isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const { loanId, category, description } = req.body;
      
      if (!loanId) {
        return res.status(400).json({ error: "Loan ID is required" });
      }

      // Create document record in database
      const document = await storage.createDocument({
        loanId: parseInt(loanId),
        category: category || 'other', // Fixed: use 'other' instead of invalid 'loan_document'
        title: req.file.originalname,
        description: description || `Uploaded ${req.file.originalname}`,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        storageUrl: `/uploads/${req.file.filename}`,
        uploadedBy: req.user?.id,
        notes: req.body.notes || null // Store AI extraction JSON or other notes
      });

      res.status(201).json(document);
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  app.get("/api/documents", async (req, res) => {
    try {
      const { loanId, borrowerId, category } = req.query as Record<string, string>;
      const documents = await storage.getDocuments({
        loanId: loanId ? parseInt(loanId) : undefined,
        borrowerId: borrowerId ? parseInt(borrowerId) : undefined,
        category: category || undefined
      });
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/:id", async (req, res) => {
    try {
      const document = await storage.getDocument(parseInt(req.params.id));
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      console.error("Error fetching document:", error);
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  app.delete("/api/documents/:id", isAuthenticated, async (req, res) => {
    try {
      const document = await storage.getDocument(parseInt(req.params.id));
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      await storage.deleteDocument(parseInt(req.params.id));
      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // Serve document file content
  app.get("/api/documents/:id/file", async (req, res) => {
    try {
      const document = await storage.getDocument(parseInt(req.params.id));
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Get the file path from storageUrl
      let filePath = '';
      if (document.storageUrl) {
        // Handle local file storage - storageUrl already points to the filename
        if (document.storageUrl.startsWith('/documents/')) {
          filePath = path.join('server/uploads', document.storageUrl.replace('/documents/', ''));
        } else if (document.storageUrl.startsWith('/uploads/')) {
          filePath = path.join('server', document.storageUrl);
        } else {
          // Assume it's just the filename
          filePath = path.join('server/uploads', document.storageUrl);
        }
      } else {
        return res.status(404).json({ error: "File not found" });
      }

      try {
        // Check if file exists
        await fs.access(filePath);
        
        // Set headers for proper file serving
        const fileName = document.fileName || document.originalFileName || 'document';
        const mimeType = document.mimeType || 'application/octet-stream';
        
        res.set({
          'Content-Type': mimeType,
          'Content-Disposition': `inline; filename="${fileName}"`,
          'Cache-Control': 'public, max-age=3600',
          'X-Frame-Options': 'SAMEORIGIN',
          'X-Content-Type-Options': 'nosniff'
        });

        // Stream the file
        const fileStream = await fs.readFile(filePath);
        res.send(fileStream);
        
      } catch (fileError) {
        console.error("File not found:", filePath);
        
        // Fallback: Return a sample document if actual file doesn't exist
        const fileName = document.fileName || document.originalFileName || 'document';
        const mimeType = document.mimeType || 'application/octet-stream';
        
        res.set({
          'Content-Type': 'text/plain',
          'Content-Disposition': `inline; filename="${fileName}.txt"`,
          'Cache-Control': 'public, max-age=3600',
        });

        const fallbackContent = `DOCUMENT: ${document.title || fileName}

This document was uploaded to the system but the file content is not available for preview.

Document Information:
- Type: ${document.category || 'Document'}
- Created: ${new Date(document.createdAt).toLocaleDateString()}  
- File Size: ${document.fileSize ? Math.round(document.fileSize / 1024) + ' KB' : 'Unknown'}
- MIME Type: ${mimeType}
- Description: ${document.description || 'No description available'}

To implement full file serving:
1. Upload actual files using the file upload endpoint
2. Store files in the server/uploads directory
3. Reference the correct file path in the database`;

        res.send(fallbackContent);
      }
    } catch (error) {
      console.error("Error serving document file:", error);
      res.status(500).json({ error: "Failed to serve document file" });
    }
  });

  // Helper function to safely parse numeric values
  function safeParseNumber(value: any, defaultValue: number = 0): number {
    if (value === null || value === undefined || value === '') return defaultValue;
    const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  // Helper function to determine document category
  function determineCategory(fileName: string): string {
    const lowerName = fileName.toLowerCase();
    if (lowerName.includes('loan') || lowerName.includes('application')) return 'loan_application';
    if (lowerName.includes('agreement')) return 'loan_agreement';
    if (lowerName.includes('note')) return 'promissory_note';
    if (lowerName.includes('deed')) return 'deed_of_trust';
    if (lowerName.includes('mortgage')) return 'mortgage';
    if (lowerName.includes('insurance') || lowerName.includes('policy')) return 'insurance_policy';
    if (lowerName.includes('tax')) return 'tax_document';
    if (lowerName.includes('escrow')) return 'escrow_statement';
    if (lowerName.includes('title')) return 'title_report';
    if (lowerName.includes('appraisal')) return 'appraisal';
    if (lowerName.includes('inspection')) return 'inspection';
    if (lowerName.includes('financial') || lowerName.includes('statement')) return 'financial_statement';
    if (lowerName.includes('income')) return 'income_verification';
    if (lowerName.includes('closing')) return 'closing_disclosure';
    if (lowerName.includes('settlement')) return 'settlement_statement';
    return 'other';
  }

  // File upload endpoint for documents
  app.post("/api/documents/upload", isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      // Determine document category based on file type or filename
      const category = determineCategory(req.file.originalname);
      
      // Create document record in database
      const documentData = {
        title: req.body.title || req.file.originalname.split('.')[0],
        fileName: req.file.originalname,
        category: req.body.category || category,
        storageUrl: `/documents/${req.file.filename}`,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        description: req.body.description || 'Uploaded via file upload',
        uploadedBy: req.user?.id,
        version: 1,
        isActive: true,
        loanId: req.body.loanId ? parseInt(req.body.loanId) : null,
        borrowerId: req.body.borrowerId ? parseInt(req.body.borrowerId) : null,
        notes: req.body.notes || null, // Store AI extraction JSON or other notes
      };

      const validatedData = insertDocumentSchema.parse(documentData);
      const document = await storage.createDocument(validatedData);
      
      await complianceAudit.logEvent({
        actorType: 'user',
        actorId: req.user?.id,
        eventType: COMPLIANCE_EVENTS.DOCUMENT.UPLOADED,
        resourceType: 'document',
        resourceId: document.id,
        loanId: document.loanId,
        newValues: document,
        ipAddr: getRealUserIP(req),
        userAgent: req.headers['user-agent']
      });

      res.status(201).json(document);
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(400).json({ error: "Failed to upload document" });
    }
  });

  app.post("/api/documents", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertDocumentSchema.parse({
        ...req.body,
        uploadedBy: req.user?.id
      });
      const document = await storage.createDocument(validatedData);
      
      await complianceAudit.logEvent({
        actorType: 'user',
        actorId: req.user?.id,
        eventType: COMPLIANCE_EVENTS.DOCUMENT.UPLOADED,
        resourceType: 'document',
        resourceId: document.id,
        loanId: document.loanId,
        newValues: document,
        ipAddr: getRealUserIP(req),
        userAgent: req.headers['user-agent']
      });

      res.status(201).json(document);
    } catch (error) {
      console.error("Error creating document:", error);
      res.status(400).json({ error: "Invalid document data" });
    }
  });

  app.put("/api/documents/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingDocument = await storage.getDocument(id);
      if (!existingDocument) {
        return res.status(404).json({ error: "Document not found" });
      }

      const document = await storage.updateDocument(id, req.body);
      
      await complianceAudit.logEvent({
        actorType: 'user',
        actorId: req.user?.id,
        eventType: COMPLIANCE_EVENTS.DOCUMENT.RENAMED,
        resourceType: 'document',
        resourceId: document.id,
        loanId: document.loanId,
        previousValues: existingDocument,
        newValues: document,
        ipAddr: getRealUserIP(req),
        userAgent: req.headers['user-agent']
      });

      res.json(document);
    } catch (error) {
      console.error("Error updating document:", error);
      res.status(400).json({ error: "Failed to update document" });
    }
  });

  app.delete("/api/documents/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      await storage.deleteDocument(id);
      
      await complianceAudit.logEvent({
        actorType: 'user',
        actorId: req.user?.id,
        eventType: COMPLIANCE_EVENTS.DOCUMENT.DELETED,
        resourceType: 'document',
        resourceId: document.id,
        loanId: document.loanId,
        previousValues: document,
        ipAddr: getRealUserIP(req),
        userAgent: req.headers['user-agent']
      });

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(400).json({ error: "Failed to delete document" });
    }
  });

  // ============= NOTIFICATION ROUTES =============
  app.get("/api/notifications", isAuthenticated, async (req, res) => {
    try {
      const { limit = "20" } = req.query as Record<string, string>;
      const notifications = await storage.getNotifications(req.user!.id, parseInt(limit));
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", isAuthenticated, async (req, res) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.user!.id);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread notification count:", error);
      res.status(500).json({ error: "Failed to fetch notification count" });
    }
  });

  app.post("/api/notifications", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification(validatedData);
      res.status(201).json(notification);
    } catch (error) {
      console.error("Error creating notification:", error);
      res.status(400).json({ error: "Invalid notification data" });
    }
  });

  app.put("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    try {
      await storage.markNotificationAsRead(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(400).json({ error: "Failed to mark notification as read" });
    }
  });

  // ============= AUDIT LOG ROUTES =============
  // Database Migration Endpoint
  app.post("/api/migrate-database", isAuthenticated, async (req, res) => {
    try {
      // Only allow admin users to run migrations
      if (req.user?.username !== 'loanatik') {
        return res.status(403).json({ 
          success: false, 
          error: 'Only administrators can run database migrations' 
        });
      }

      const details: string[] = [];
      
      // Run migration queries
      const migrations = [
        // Servicing settings
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS servicing_fee_type text DEFAULT 'percentage'`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS late_charge_type text DEFAULT 'percentage'`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS fee_payer text`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS grace_period_days integer`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS investor_loan_number text`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS pool_number text`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS late_charge decimal(10, 2)`,
        // Payment settings
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS property_tax decimal(10, 2)`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS home_insurance decimal(10, 2)`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS pmi decimal(10, 2)`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS other_monthly decimal(10, 2)`,
        // Other fields
        `ALTER TABLE properties ADD COLUMN IF NOT EXISTS apn text`,
        `ALTER TABLE loans ADD COLUMN IF NOT EXISTS escrow_number text`
      ];

      for (const migration of migrations) {
        try {
          await db.execute(sql.raw(migration));
          const columnName = migration.match(/ADD COLUMN IF NOT EXISTS (\w+)/)?.[1];
          details.push(`✓ Added column: ${columnName}`);
        } catch (error: any) {
          if (error.code === '42701') {
            const columnName = migration.match(/ADD COLUMN IF NOT EXISTS (\w+)/)?.[1];
            details.push(`✓ Column already exists: ${columnName}`);
          } else {
            details.push(`✗ Error: ${error.message}`);
          }
        }
      }

      res.json({ success: true, details });
    } catch (error) {
      console.error("Error running migration:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to run migration",
        details: []
      });
    }
  });

  app.get("/api/audit-logs/:entityType/:entityId", isAuthenticated, async (req, res) => {
    try {
      const logs = await storage.getAuditLogs(req.params.entityType, parseInt(req.params.entityId));
      res.json(logs);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  // ============= FEE MANAGEMENT ROUTES =============
  app.use("/api/fees", feeRoutes);

  // Register admin user routes
  app.use("/api/admin/users", adminUsersRouter);
  
  // Register IP allowlist routes
  app.use("/api/ip-allowlist", ipAllowlistRouter);
  
  // Register ledger routes
  registerLedgerRoutes(app);

  // ============= AI DOCUMENT ANALYSIS ROUTES =============
  app.post("/api/documents/analyze", upload.single('file'), isAuthenticated, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      console.log(`[Document Analysis] Starting analysis for: ${req.file.originalname}, Size: ${req.file.size} bytes`);
      const result = await analyzeDocument(req.file.path, req.file.originalname || req.file.filename);
      
      // Check if analysis failed (returned unknown document type)
      if (result.documentType === "unknown" && result.confidence === 0) {
        console.error(`[Document Analysis] Failed to analyze ${req.file.originalname} - returning error`);
        return res.status(500).json({ error: "Document analysis failed - document may be too complex or large" });
      }
      
      console.log(`[Document Analysis] Successfully analyzed: ${req.file.originalname}, Type: ${result.documentType}`);
      res.json(result);
    } catch (error: any) {
      console.error(`[Document Analysis] Error analyzing ${req.file?.originalname}:`, error.message);
      console.error("Full error:", error);
      res.status(500).json({ error: `Failed to analyze document: ${error.message || "Unknown error"}` });
    }
  });

  app.post("/api/loans/create-from-documents", isAuthenticated, async (req, res) => {
    try {
      const { extractedData, documentTypes } = req.body;
      
      // Create loan with AI-extracted data using safe numeric parsing
      const loanAmount = safeParseNumber(extractedData.loanAmount);
      const loanTerm = safeParseNumber(extractedData.loanTerm, 30);
      
      const loanData = {
        borrowerName: extractedData.borrowerName || "Unknown",
        propertyAddress: extractedData.propertyAddress || "Unknown",
        loanAmount: loanAmount,
        interestRate: safeParseNumber(extractedData.interestRate),
        loanTerm: loanTerm,
        monthlyPayment: safeParseNumber(extractedData.monthlyPayment),
        loanStatus: "active" as const,
        originationDate: new Date().toISOString().split('T')[0],
        maturityDate: new Date(Date.now() + loanTerm * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        remainingBalance: loanAmount,
        nextPaymentDate: extractedData.firstPaymentDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        nextPaymentAmount: safeParseNumber(extractedData.monthlyPayment),
        servicingFee: 25, // Default servicing fee
        // Additional extracted fields
        loanType: extractedData.loanType || "conventional",
        propertyType: extractedData.propertyType || "single_family",
        propertyValue: safeParseNumber(extractedData.propertyValue),
        downPayment: safeParseNumber(extractedData.downPayment),
        closingCosts: safeParseNumber(extractedData.closingCosts),
        pmiAmount: safeParseNumber(extractedData.pmi),
        hazardInsurance: safeParseNumber(extractedData.insurance),
        propertyTaxes: safeParseNumber(extractedData.taxes),
        hoaFees: safeParseNumber(extractedData.hoaFees),
        escrowAmount: safeParseNumber(extractedData.escrowAmount),
      };

      const validatedData = insertLoanSchema.parse(loanData);
      const loan = await storage.createLoan(validatedData);

      // Create audit log
      await complianceAudit.logEvent({
        actorType: 'user',
        actorId: req.user?.id,
        eventType: COMPLIANCE_EVENTS.LOAN.CREATED,
        resourceType: 'loan',
        resourceId: loan.id,
        loanId: loan.id,
        newValues: { ...loan, documentTypes },
        metadata: { source: 'ai_extraction' },
        ipAddr: getRealUserIP(req),
        userAgent: req.headers['user-agent']
      });

      res.status(201).json(loan);
    } catch (error) {
      console.error("Error creating loan from documents:", error);
      res.status(400).json({ error: "Failed to create loan from extracted data" });
    }
  });

  // Register escrow disbursement routes
  const escrowDisbursementRoutes = await import('./routes/escrow-disbursements');
  app.use(escrowDisbursementRoutes.default);

  // Register servicing cycle routes
  const servicingCycleRoutes = await import('./routes/servicing-cycle');
  app.use('/api/servicing-cycle', servicingCycleRoutes.default);

  // Register RabbitMQ test routes
  const rabbitmqTestRoutes = await import('./routes/rabbitmq-test');
  app.use('/api/rabbitmq', rabbitmqTestRoutes.default);

  // Register messaging infrastructure test routes
  const messagingTestRoutes = await import('./routes/messaging-test');
  app.use('/api/messaging', messagingTestRoutes.default);

  // Register reconciliation routes
  const reconciliationRoutes = await import('./routes/reconciliation');
  app.use('/api/reconciliation', reconciliationRoutes.default);

  const httpServer = createServer(app);
  return httpServer;
}