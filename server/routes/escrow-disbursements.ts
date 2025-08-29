import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { escrowDisbursementPayments, escrowAccounts, loanLedger } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { insertEscrowDisbursementSchema, insertEscrowDisbursementPaymentSchema } from "../../shared/schema";
import { complianceAudit, COMPLIANCE_EVENTS } from '../compliance/auditService';

const router = Router();

// Get all disbursements for a loan
router.get("/api/loans/:loanId/escrow-disbursements", async (req: any, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const userId = req.user?.id || (req.session as any)?.userId;
    
    const disbursements = await storage.getEscrowDisbursements(loanId);
    
    // Log escrow disbursements access
    await complianceAudit.logEvent({
      eventType: COMPLIANCE_EVENTS.ESCROW.VIEWED,
      actorType: 'user',
      actorId: userId?.toString(),
      resourceType: 'escrow_disbursements',
      resourceId: loanId.toString(),
      details: {
        action: 'view_escrow_disbursements',
        loanId,
        disbursementCount: disbursements.length,
        userId
      },
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.json(disbursements);
  } catch (error) {
    console.error("Error fetching escrow disbursements:", error);
    res.status(500).json({ error: "Failed to fetch escrow disbursements" });
  }
});

// Get single disbursement with payment history
router.get("/api/escrow-disbursements/:id", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.user?.id || (req.session as any)?.userId;
    
    const disbursement = await storage.getEscrowDisbursement(id);
    
    if (!disbursement) {
      return res.status(404).json({ error: "Disbursement not found" });
    }
    
    // Log disbursement detail access
    await complianceAudit.logEvent({
      eventType: COMPLIANCE_EVENTS.ESCROW.VIEWED,
      actorType: 'user',
      actorId: userId?.toString(),
      resourceType: 'escrow_disbursement',
      resourceId: id.toString(),
      details: {
        action: 'view_disbursement_detail',
        disbursementId: id,
        disbursementType: disbursement.disbursementType,
        payeeName: disbursement.payeeName,
        userId
      },
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.json(disbursement);
  } catch (error) {
    console.error("Error fetching disbursement:", error);
    res.status(500).json({ error: "Failed to fetch disbursement" });
  }
});

// Create new disbursement
router.post("/api/loans/:loanId/escrow-disbursements", async (req: any, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const userId = req.user?.id || (req.session as any)?.userId;
    
    // Get or create escrow account for this loan
    let escrowAccount = await storage.getEscrowAccount(loanId);
    
    if (!escrowAccount) {
      // Create escrow account if it doesn't exist
      escrowAccount = await storage.createEscrowAccount({
        loanId,
        accountNumber: `ESC-${loanId}-${Date.now()}`,
        currentBalance: "0",
        isActive: true
      });
      
      // Log escrow account creation
      await complianceAudit.logEvent({
        eventType: COMPLIANCE_EVENTS.ESCROW.ACCOUNT_CREATED,
        actorType: 'user',
        actorId: userId?.toString(),
        resourceType: 'escrow_account',
        resourceId: escrowAccount.id.toString(),
        details: {
          action: 'create_escrow_account',
          loanId,
          accountNumber: escrowAccount.accountNumber,
          userId
        },
        userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
    }
    
    // Helper function to clean numeric values
    const cleanNumeric = (value: any) => {
      if (value === undefined || value === '' || value === null) {
        return null;
      }
      return value;
    };
    
    // Helper function to clean string values
    const cleanString = (value: any) => {
      if (value === undefined || value === '' || value === null) {
        return null;
      }
      return value;
    };
    
    // Clean up all fields - convert empty strings to null for dates, strings, and numerics
    const cleanedData = {
      // Don't spread req.body - build cleanedData from scratch
      loanId,
      escrowAccountId: escrowAccount.id,
      // Copy over required fields from body
      disbursementType: req.body.disbursementType,
      description: req.body.description,
      payeeName: req.body.payeeName,
      frequency: req.body.frequency,
      paymentMethod: req.body.paymentMethod || 'check',
      status: req.body.status || 'active',
      isOnHold: req.body.isOnHold || false,
      autoPayEnabled: req.body.autoPayEnabled ?? true,
      // Required date field
      nextDueDate: cleanString(req.body.nextDueDate),
      // Optional date fields - convert empty strings to null
      firstDueDate: cleanString(req.body.firstDueDate),
      lastPaidDate: cleanString(req.body.lastPaidDate),
      policyExpirationDate: cleanString(req.body.policyExpirationDate),
      holdDate: cleanString(req.body.holdDate),
      // Numeric fields - convert empty strings to null
      coverageAmount: cleanNumeric(req.body.coverageAmount),
      monthlyAmount: cleanNumeric(req.body.monthlyAmount),
      annualAmount: cleanNumeric(req.body.annualAmount),
      paymentAmount: cleanNumeric(req.body.paymentAmount),
      daysBeforeDue: cleanNumeric(req.body.daysBeforeDue),
      // Clean up string fields that might be empty
      parcelNumber: cleanString(req.body.parcelNumber),
      policyNumber: cleanString(req.body.policyNumber),
      accountNumber: cleanString(req.body.accountNumber),
      referenceNumber: cleanString(req.body.referenceNumber),
      specificDueDates: cleanString(req.body.specificDueDates),
      metadata: cleanString(req.body.metadata),
      notes: cleanString(req.body.notes),
      // Clean all address and contact fields
      payeeStreetAddress: cleanString(req.body.payeeStreetAddress),
      payeeCity: cleanString(req.body.payeeCity),
      payeeState: cleanString(req.body.payeeState),
      payeeZipCode: cleanString(req.body.payeeZipCode),
      payeeContactName: cleanString(req.body.payeeContactName),
      payeePhone: cleanString(req.body.payeePhone),
      payeeEmail: cleanString(req.body.payeeEmail),
      payeeFax: cleanString(req.body.payeeFax),
      // Insurance fields
      insuredName: cleanString(req.body.insuredName),
      insuranceCompanyName: cleanString(req.body.insuranceCompanyName),
      policyDescription: cleanString(req.body.policyDescription),
      insurancePropertyAddress: cleanString(req.body.insurancePropertyAddress),
      insurancePropertyCity: cleanString(req.body.insurancePropertyCity),
      insurancePropertyState: cleanString(req.body.insurancePropertyState),
      insurancePropertyZipCode: cleanString(req.body.insurancePropertyZipCode),
      // Agent fields
      agentName: cleanString(req.body.agentName),
      agentBusinessAddress: cleanString(req.body.agentBusinessAddress),
      agentCity: cleanString(req.body.agentCity),
      agentState: cleanString(req.body.agentState),
      agentZipCode: cleanString(req.body.agentZipCode),
      agentPhone: cleanString(req.body.agentPhone),
      agentFax: cleanString(req.body.agentFax),
      agentEmail: cleanString(req.body.agentEmail),
      // Banking fields
      bankAccountNumber: cleanString(req.body.bankAccountNumber),
      achRoutingNumber: cleanString(req.body.achRoutingNumber),
      wireRoutingNumber: cleanString(req.body.wireRoutingNumber),
      accountType: cleanString(req.body.accountType),
      bankName: cleanString(req.body.bankName),
      wireInstructions: cleanString(req.body.wireInstructions),
      // Remittance fields
      remittanceAddress: cleanString(req.body.remittanceAddress),
      remittanceCity: cleanString(req.body.remittanceCity),
      remittanceState: cleanString(req.body.remittanceState),
      remittanceZipCode: cleanString(req.body.remittanceZipCode),
      // Other fields
      category: cleanString(req.body.category),
      holdReason: cleanString(req.body.holdReason),
      holdRequestedBy: cleanString(req.body.holdRequestedBy),
      // Insurance tracking fields
      insuranceDocumentId: cleanNumeric(req.body.insuranceDocumentId),
      insuranceTracking: req.body.insuranceTracking
    };
    
    // Remove null/undefined values from cleanedData to avoid overwriting defaults
    Object.keys(cleanedData).forEach(key => {
      if (cleanedData[key] === null || cleanedData[key] === undefined) {
        delete cleanedData[key];
      }
    });
    
    console.log("Processing escrow disbursement request");
    console.log("Data validation in progress...");
    
    const validatedData = insertEscrowDisbursementSchema.parse(cleanedData);
    
    console.log("Validation complete, creating disbursement...");
    
    const disbursement = await storage.createEscrowDisbursement(validatedData);
    
    // Log disbursement creation
    await complianceAudit.logEvent({
      eventType: COMPLIANCE_EVENTS.ESCROW.DISBURSEMENT_CREATED,
      actorType: 'user',
      actorId: userId?.toString(),
      resourceType: 'escrow_disbursement',
      resourceId: disbursement.id.toString(),
      details: {
        action: 'create_escrow_disbursement',
        disbursementId: disbursement.id,
        loanId,
        disbursementType: disbursement.disbursementType,
        payeeName: disbursement.payeeName,
        annualAmount: disbursement.annualAmount,
        paymentMethod: disbursement.paymentMethod,
        frequency: disbursement.frequency,
        status: disbursement.status,
        autoPayEnabled: disbursement.autoPayEnabled,
        userId
      },
      newValues: disbursement,
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.status(201).json(disbursement);
  } catch (error: any) {
    console.error("Error creating disbursement:", error);
    const errorMessage = error.issues ? error.issues[0].message : error.message || "Invalid disbursement data";
    res.status(400).json({ error: errorMessage, details: error.issues || error.message });
  }
});

// Update disbursement
router.patch("/api/escrow-disbursements/:id", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.user?.id || (req.session as any)?.userId;
    
    const existingDisbursement = await storage.getEscrowDisbursement(id);
    
    if (!existingDisbursement) {
      return res.status(404).json({ error: "Disbursement not found" });
    }
    
    // Helper function to clean numeric values
    const cleanNumeric = (value: any) => {
      if (value === undefined || value === '' || value === null) {
        return undefined; // Return undefined so it's not included in update
      }
      return value;
    };
    
    // Helper function to clean string values
    const cleanString = (value: any) => {
      if (value === undefined || value === '' || value === null) {
        return undefined; // Return undefined so it's not included in update
      }
      return value;
    };
    
    // Build update data only with provided fields
    const cleanedData: any = {};
    
    // Only include fields that are explicitly provided in the request
    if ('nextDueDate' in req.body) cleanedData.nextDueDate = cleanString(req.body.nextDueDate);
    if ('firstDueDate' in req.body) cleanedData.firstDueDate = cleanString(req.body.firstDueDate);
    if ('lastPaidDate' in req.body) cleanedData.lastPaidDate = cleanString(req.body.lastPaidDate);
    if ('policyExpirationDate' in req.body) cleanedData.policyExpirationDate = cleanString(req.body.policyExpirationDate);
    if ('holdDate' in req.body) cleanedData.holdDate = cleanString(req.body.holdDate);
    
    // Numeric fields
    if ('coverageAmount' in req.body) cleanedData.coverageAmount = cleanNumeric(req.body.coverageAmount);
    if ('monthlyAmount' in req.body) cleanedData.monthlyAmount = cleanNumeric(req.body.monthlyAmount);
    if ('annualAmount' in req.body) cleanedData.annualAmount = cleanNumeric(req.body.annualAmount);
    if ('paymentAmount' in req.body) cleanedData.paymentAmount = cleanNumeric(req.body.paymentAmount);
    if ('daysBeforeDue' in req.body) cleanedData.daysBeforeDue = cleanNumeric(req.body.daysBeforeDue);
    
    // Copy over other fields only if provided
    Object.keys(req.body).forEach(key => {
      if (!(key in cleanedData)) {
        const value = req.body[key];
        if (value !== undefined && value !== '') {
          cleanedData[key] = value;
        }
      }
    });
    
    // Remove undefined values
    Object.keys(cleanedData).forEach(key => {
      if (cleanedData[key] === undefined) {
        delete cleanedData[key];
      }
    });
    
    const updatedDisbursement = await storage.updateEscrowDisbursement(id, cleanedData);
    
    // Log disbursement update with changed fields
    await complianceAudit.logEvent({
      eventType: COMPLIANCE_EVENTS.ESCROW.DISBURSEMENT_UPDATED,
      actorType: 'user',
      actorId: userId?.toString(),
      resourceType: 'escrow_disbursement',
      resourceId: id.toString(),
      details: {
        action: 'update_escrow_disbursement',
        disbursementId: id,
        loanId: existingDisbursement.loanId,
        changedFields: Object.keys(cleanedData),
        userId
      },
      previousValues: existingDisbursement,
      newValues: updatedDisbursement,
      changedFields: Object.keys(cleanedData),
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.json(updatedDisbursement);
  } catch (error) {
    console.error("Error updating disbursement:", error);
    res.status(400).json({ error: "Failed to update disbursement" });
  }
});

// Delete disbursement
router.delete("/api/escrow-disbursements/:id", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.user?.id || (req.session as any)?.userId;
    
    // Get disbursement before deletion for audit log
    const disbursement = await storage.getEscrowDisbursement(id);
    
    await storage.deleteEscrowDisbursement(id);
    
    // Log disbursement deletion
    if (disbursement) {
      await complianceAudit.logEvent({
        eventType: COMPLIANCE_EVENTS.ESCROW.DISBURSEMENT_DELETED,
        actorType: 'user',
        actorId: userId?.toString(),
        resourceType: 'escrow_disbursement',
        resourceId: id.toString(),
        details: {
          action: 'delete_escrow_disbursement',
          disbursementId: id,
          loanId: disbursement.loanId,
          disbursementType: disbursement.disbursementType,
          payeeName: disbursement.payeeName,
          deletedData: disbursement,
          userId
        },
        previousValues: disbursement,
        userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
    }
    
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting disbursement:", error);
    res.status(400).json({ error: "Failed to delete disbursement" });
  }
});

// Combined hold/release endpoint - removed old separate endpoints
// This unified endpoint handles both hold and release actions based on the action parameter

// Record a disbursement payment
router.post("/api/escrow-disbursements/:id/payments", async (req: any, res) => {
  try {
    const disbursementId = parseInt(req.params.id);
    const userId = req.user?.id || (req.session as any)?.userId;
    
    const disbursement = await storage.getEscrowDisbursement(disbursementId);
    
    if (!disbursement) {
      return res.status(404).json({ error: "Disbursement not found" });
    }
    
    const validatedData = insertEscrowDisbursementPaymentSchema.parse({
      ...req.body,
      disbursementId,
      loanId: disbursement.loanId
    });
    
    // Create the payment record
    // Use transaction to ensure atomicity of payment and ledger entry
    const result = await db.transaction(async (tx) => {
      // Insert payment
      const [payment] = await tx
        .insert(escrowDisbursementPayments)
        .values(validatedData)
        .returning();
      
      // Create corresponding ledger entry
      const [ledgerEntry] = await tx
        .insert(loanLedger)
        .values({
          loanId: disbursement.loanId,
          transactionDate: validatedData.paymentDate,
          transactionId: `DISB-${payment.id}-${Date.now()}`,
          description: `Escrow disbursement: ${disbursement.description}`,
          transactionType: 'disbursement',
          debitAmount: validatedData.amount,
          creditAmount: "0",
          category: 'escrow',
          notes: `Payment for ${disbursement.disbursementType} - ${disbursement.description}`,
          runningBalance: '0', // Will be calculated properly in production
          principalBalance: '0',
          interestBalance: '0',
          status: 'posted'
        })
        .returning();
      
      // Update payment with ledger entry ID
      const [updatedPayment] = await tx
        .update(escrowDisbursementPayments)
        .set({ ledgerEntryId: ledgerEntry.id })
        .where(eq(escrowDisbursementPayments.id, payment.id))
        .returning();
      
      // Update escrow account balance
      const [escrowAccount] = await tx
        .select()
        .from(escrowAccounts)
        .where(eq(escrowAccounts.loanId, disbursement.loanId))
        .limit(1);
      
      if (escrowAccount) {
        const newBalance = (parseFloat(escrowAccount.balance) - parseFloat(validatedData.amount)).toFixed(2);
        await tx
          .update(escrowAccounts)
          .set({ 
            balance: newBalance,
            lastTransactionDate: validatedData.paymentDate
          })
          .where(eq(escrowAccounts.id, escrowAccount.id));
      }
      
      return { ...updatedPayment, ledgerEntryId: ledgerEntry.id };
    });
    
    // Log payment processing
    await complianceAudit.logEvent({
      eventType: COMPLIANCE_EVENTS.ESCROW.PAYMENT_PROCESSED,
      actorType: 'user',
      actorId: userId?.toString(),
      resourceType: 'escrow_payment',
      resourceId: result.id.toString(),
      details: {
        action: 'process_escrow_payment',
        paymentId: result.id,
        disbursementId,
        loanId: disbursement.loanId,
        amount: validatedData.amount,
        paymentDate: validatedData.paymentDate,
        paymentMethod: validatedData.paymentMethod,
        checkNumber: validatedData.checkNumber,
        transactionNumber: validatedData.transactionNumber,
        ledgerEntryId: result.ledgerEntryId,
        userId
      },
      newValues: result,
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.status(201).json(result);
  } catch (error: any) {
    console.error("Error recording disbursement payment:", error);
    const errorMessage = error.issues ? error.issues[0].message : error.message || "Invalid payment data";
    res.status(400).json({ error: errorMessage, details: error.issues || error.message });
  }
});

// Get escrow account summary for a loan
router.get("/api/loans/:loanId/escrow-summary", async (req: any, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const userId = req.user?.id || (req.session as any)?.userId;
    
    const summary = await storage.getEscrowSummary(loanId);
    
    // Log escrow summary access
    await complianceAudit.logEvent({
      eventType: COMPLIANCE_EVENTS.ESCROW.VIEWED,
      actorType: 'user',
      actorId: userId?.toString(),
      resourceType: 'escrow_summary',
      resourceId: loanId.toString(),
      details: {
        action: 'view_escrow_summary',
        loanId,
        totalDisbursements: summary.summary.totalDisbursements,
        activeDisbursements: summary.summary.activeDisbursements,
        onHoldDisbursements: summary.summary.onHoldDisbursements,
        totalAnnualAmount: summary.summary.totalAnnualAmount,
        userId
      },
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.json(summary);
  } catch (error) {
    console.error("Error getting escrow summary:", error);
    res.status(500).json({ error: "Failed to get escrow summary" });
  }
});

// Put escrow disbursement on hold or release from hold  
router.post("/api/escrow-disbursements/:id/hold", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid disbursement ID" });
    }
    
    const { action, reason, requestedBy } = req.body;
    const userId = req.user?.id || (req.session as any)?.userId;
    
    let result;
    let eventType;
    if (action === 'hold') {
      result = await storage.holdEscrowDisbursement(id, reason, requestedBy);
      eventType = COMPLIANCE_EVENTS.ESCROW.DISBURSEMENT_HELD;
    } else if (action === 'release') {
      result = await storage.releaseEscrowDisbursement(id);
      eventType = COMPLIANCE_EVENTS.ESCROW.DISBURSEMENT_RELEASED;
    } else {
      return res.status(400).json({ error: "Action must be 'hold' or 'release'" });
    }
    
    // Log hold/release action
    await complianceAudit.logEvent({
      eventType,
      actorType: 'user',
      actorId: userId?.toString(),
      resourceType: 'escrow_disbursement',
      resourceId: id.toString(),
      details: {
        action: action === 'hold' ? 'hold_escrow_disbursement' : 'release_escrow_disbursement',
        disbursementId: id,
        loanId: result.loanId,
        reason: reason || null,
        requestedBy: requestedBy || userId,
        isOnHold: result.isOnHold,
        holdReason: result.holdReason,
        userId
      },
      newValues: result,
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.json(result);
  } catch (error) {
    console.error("Error putting disbursement on hold:", error);
    res.status(400).json({ error: "Failed to update disbursement hold status" });
  }
});

export default router;