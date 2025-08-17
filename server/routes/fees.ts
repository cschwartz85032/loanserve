import { Router } from 'express';
import { db } from '../db';
import { feeTemplates, loanFees, loans } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';

const router = Router();

// Authentication middleware
function requireAuth(req: any, res: any, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}

// Get all fee templates for a lender
router.get('/templates', requireAuth, async (req, res) => {
  try {
    const templates = await db
      .select()
      .from(feeTemplates)
      .where(eq(feeTemplates.lenderId, req.user!.id))
      .orderBy(desc(feeTemplates.isDefault), desc(feeTemplates.createdAt));
    
    res.json(templates);
  } catch (error) {
    console.error('Error fetching fee templates:', error);
    res.status(500).json({ error: 'Failed to fetch fee templates' });
  }
});

// Get default fee template
router.get('/templates/default', requireAuth, async (req, res) => {
  try {
    const [template] = await db
      .select()
      .from(feeTemplates)
      .where(and(
        eq(feeTemplates.lenderId, req.user!.id),
        eq(feeTemplates.isDefault, true)
      ))
      .limit(1);
    
    res.json(template || null);
  } catch (error) {
    console.error('Error fetching default template:', error);
    res.status(500).json({ error: 'Failed to fetch default template' });
  }
});

// Create fee template
router.post('/templates', requireAuth, async (req, res) => {
  try {
    const { templateName, description, fees, isDefault } = req.body;
    
    // If setting as default, unset other defaults
    if (isDefault) {
      await db
        .update(feeTemplates)
        .set({ isDefault: false })
        .where(eq(feeTemplates.lenderId, req.user!.id));
    }
    
    const [template] = await db
      .insert(feeTemplates)
      .values({
        lenderId: req.user!.id,
        templateName,
        description,
        fees,
        isDefault: isDefault || false
      })
      .returning();
    
    res.json(template);
  } catch (error) {
    console.error('Error creating fee template:', error);
    res.status(500).json({ error: 'Failed to create fee template' });
  }
});

// Update fee template
router.put('/templates/:id', requireAuth, async (req, res) => {
  try {
    const { templateName, description, fees, isDefault } = req.body;
    const templateId = parseInt(req.params.id);
    
    // If setting as default, unset other defaults
    if (isDefault) {
      await db
        .update(feeTemplates)
        .set({ isDefault: false })
        .where(and(
          eq(feeTemplates.lenderId, req.user!.id),
          eq(feeTemplates.id, templateId)
        ));
    }
    
    const [template] = await db
      .update(feeTemplates)
      .set({
        templateName,
        description,
        fees,
        isDefault,
        updatedAt: new Date()
      })
      .where(and(
        eq(feeTemplates.id, templateId),
        eq(feeTemplates.lenderId, req.user!.id)
      ))
      .returning();
    
    res.json(template);
  } catch (error) {
    console.error('Error updating fee template:', error);
    res.status(500).json({ error: 'Failed to update fee template' });
  }
});

// Delete fee template
router.delete('/templates/:id', requireAuth, async (req, res) => {
  try {
    await db
      .delete(feeTemplates)
      .where(and(
        eq(feeTemplates.id, parseInt(req.params.id)),
        eq(feeTemplates.lenderId, req.user!.id)
      ));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting fee template:', error);
    res.status(500).json({ error: 'Failed to delete fee template' });
  }
});

// Get loan fees
router.get('/loan/:loanId', requireAuth, async (req, res) => {
  try {
    const fees = await db
      .select()
      .from(loanFees)
      .where(eq(loanFees.loanId, parseInt(req.params.loanId)))
      .orderBy(desc(loanFees.createdAt));
    
    res.json(fees);
  } catch (error) {
    console.error('Error fetching loan fees:', error);
    res.status(500).json({ error: 'Failed to fetch loan fees' });
  }
});

// Add fee to loan
router.post('/loan/:loanId', requireAuth, async (req, res) => {
  try {
    const { feeType, feeName, feeAmount, feePercentage, frequency, chargeDate, dueDate, notes } = req.body;
    
    const [fee] = await db
      .insert(loanFees)
      .values({
        loanId: parseInt(req.params.loanId),
        feeType,
        feeName,
        feeAmount,
        feePercentage,
        frequency,
        chargeDate,
        dueDate,
        notes
      })
      .returning();
    
    res.json(fee);
  } catch (error) {
    console.error('Error adding loan fee:', error);
    res.status(500).json({ error: 'Failed to add loan fee' });
  }
});

// Update loan fee
router.put('/loan-fee/:id', requireAuth, async (req, res) => {
  try {
    const { feeAmount, dueDate, paidDate, waived, waivedReason, notes } = req.body;
    
    const [fee] = await db
      .update(loanFees)
      .set({
        feeAmount,
        dueDate,
        paidDate,
        waived,
        waivedBy: waived ? req.user!.id : null,
        waivedReason,
        notes,
        updatedAt: new Date()
      })
      .where(eq(loanFees.id, parseInt(req.params.id)))
      .returning();
    
    res.json(fee);
  } catch (error) {
    console.error('Error updating loan fee:', error);
    res.status(500).json({ error: 'Failed to update loan fee' });
  }
});

// Delete loan fee
router.delete('/loan-fee/:id', requireAuth, async (req, res) => {
  try {
    await db
      .delete(loanFees)
      .where(eq(loanFees.id, parseInt(req.params.id)));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting loan fee:', error);
    res.status(500).json({ error: 'Failed to delete loan fee' });
  }
});

// Apply template to loan
router.post('/loan/:loanId/apply-template/:templateId', requireAuth, async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const templateId = parseInt(req.params.templateId);
    
    // Get the template
    const [template] = await db
      .select()
      .from(feeTemplates)
      .where(eq(feeTemplates.id, templateId))
      .limit(1);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Get loan details for calculating percentage-based fees
    const [loan] = await db
      .select()
      .from(loans)
      .where(eq(loans.id, loanId))
      .limit(1);
    
    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    
    // Apply fees from template
    const feesData = template.fees as any[];
    const createdFees = [];
    
    for (const fee of feesData) {
      let feeAmount = fee.amount;
      
      // Calculate percentage-based fees
      if (fee.isPercentage && fee.percentage) {
        feeAmount = (parseFloat(loan.originalAmount) * fee.percentage / 100).toFixed(2);
      }
      
      const [createdFee] = await db
        .insert(loanFees)
        .values({
          loanId,
          feeType: fee.type,
          feeName: fee.name,
          feeAmount: feeAmount.toString(),
          feePercentage: fee.percentage?.toString(),
          frequency: fee.frequency,
          chargeDate: fee.chargeDate,
          dueDate: fee.dueDate,
          notes: `Applied from template: ${template.templateName}`
        })
        .returning();
      
      createdFees.push(createdFee);
    }
    
    res.json({ success: true, fees: createdFees });
  } catch (error) {
    console.error('Error applying template to loan:', error);
    res.status(500).json({ error: 'Failed to apply template to loan' });
  }
});

export default router;