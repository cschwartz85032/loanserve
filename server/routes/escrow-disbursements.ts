import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { escrowDisbursementPayments, loanLedger } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { insertEscrowDisbursementSchema, insertEscrowDisbursementPaymentSchema } from "../../shared/schema";

const router = Router();

// Get all disbursements for a loan
router.get("/api/loans/:loanId/escrow-disbursements", async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    
    const disbursements = await storage.getEscrowDisbursements(loanId);
    
    res.json(disbursements);
  } catch (error) {
    console.error("Error fetching escrow disbursements:", error);
    res.status(500).json({ error: "Failed to fetch escrow disbursements" });
  }
});

// Get single disbursement with payment history
router.get("/api/escrow-disbursements/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    const disbursement = await storage.getEscrowDisbursement(id);
    
    if (!disbursement) {
      return res.status(404).json({ error: "Disbursement not found" });
    }
    
    res.json(disbursement);
  } catch (error) {
    console.error("Error fetching disbursement:", error);
    res.status(500).json({ error: "Failed to fetch disbursement" });
  }
});

// Create new disbursement
router.post("/api/loans/:loanId/escrow-disbursements", async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    
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
    }
    
    // Clean up date fields - convert empty strings to null
    const cleanedData = {
      ...req.body,
      loanId,
      escrowAccountId: escrowAccount.id,
      nextDueDate: req.body.nextDueDate && req.body.nextDueDate !== '' ? req.body.nextDueDate : null,
      lastPaymentDate: req.body.lastPaymentDate && req.body.lastPaymentDate !== '' ? req.body.lastPaymentDate : null
    };
    
    const validatedData = insertEscrowDisbursementSchema.parse(cleanedData);
    
    const disbursement = await storage.createEscrowDisbursement(validatedData);
    
    res.status(201).json(disbursement);
  } catch (error: any) {
    console.error("Error creating disbursement:", error);
    const errorMessage = error.issues ? error.issues[0].message : error.message || "Invalid disbursement data";
    res.status(400).json({ error: errorMessage, details: error.issues || error.message });
  }
});

// Update disbursement
router.patch("/api/escrow-disbursements/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    const existingDisbursement = await storage.getEscrowDisbursement(id);
    
    if (!existingDisbursement) {
      return res.status(404).json({ error: "Disbursement not found" });
    }
    
    // Clean up date fields - convert empty strings to null
    const cleanedData = {
      ...req.body,
      nextDueDate: req.body.nextDueDate && req.body.nextDueDate !== '' ? req.body.nextDueDate : null,
      lastPaymentDate: req.body.lastPaymentDate && req.body.lastPaymentDate !== '' ? req.body.lastPaymentDate : null
    };
    
    const updatedDisbursement = await storage.updateEscrowDisbursement(id, cleanedData);
    
    res.json(updatedDisbursement);
  } catch (error) {
    console.error("Error updating disbursement:", error);
    res.status(400).json({ error: "Failed to update disbursement" });
  }
});

// Delete disbursement
router.delete("/api/escrow-disbursements/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    await storage.deleteEscrowDisbursement(id);
    
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting disbursement:", error);
    res.status(400).json({ error: "Failed to delete disbursement" });
  }
});

// Combined hold/release endpoint - removed old separate endpoints
// This unified endpoint handles both hold and release actions based on the action parameter

// Record a disbursement payment
router.post("/api/escrow-disbursements/:id/payments", async (req, res) => {
  try {
    const disbursementId = parseInt(req.params.id);
    
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
    
    res.status(201).json(result);
  } catch (error: any) {
    console.error("Error recording disbursement payment:", error);
    const errorMessage = error.issues ? error.issues[0].message : error.message || "Invalid payment data";
    res.status(400).json({ error: errorMessage, details: error.issues || error.message });
  }
});

// Get escrow account summary for a loan
router.get("/api/loans/:loanId/escrow-summary", async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    
    const summary = await storage.getEscrowSummary(loanId);
    
    res.json(summary);
  } catch (error) {
    console.error("Error getting escrow summary:", error);
    res.status(500).json({ error: "Failed to get escrow summary" });
  }
});

// Put escrow disbursement on hold or release from hold  
router.post("/api/escrow-disbursements/:id/hold", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid disbursement ID" });
    }
    
    const { action, reason, requestedBy } = req.body;
    
    let result;
    if (action === 'hold') {
      result = await storage.holdEscrowDisbursement(id, reason, requestedBy);
    } else if (action === 'release') {
      result = await storage.releaseEscrowDisbursement(id);
    } else {
      return res.status(400).json({ error: "Action must be 'hold' or 'release'" });
    }
    
    res.json(result);
  } catch (error) {
    console.error("Error putting disbursement on hold:", error);
    res.status(400).json({ error: "Failed to update disbursement hold status" });
  }
});

export default router;