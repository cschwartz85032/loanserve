/**
 * Investor Routes - Audited investor management endpoints
 * All operations include proper audit trails and correlation IDs
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/database';
import { pool } from '../db';
import { InvestorRepository } from '../repositories/investor-repo';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const investorRepo = new InvestorRepository();

// Validation schemas
const addInvestorSchema = z.object({
  investorId: z.string().min(1),
  entityType: z.enum(['individual', 'entity']),
  name: z.string().min(1),
  ownershipPercentage: z.number().min(0).max(100),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  streetAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  routingNumber: z.string().optional(),
  accountType: z.enum(['checking', 'savings']).optional()
});

const updateInvestorSchema = z.object({
  name: z.string().optional(),
  ownershipPercentage: z.number().min(0).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  streetAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  routingNumber: z.string().optional(),
  accountType: z.enum(['checking', 'savings']).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional()
});

/**
 * POST /api/loans/:loanId/investors
 * Add new investor to loan with full audit trail
 */
router.post('/loans/:loanId/investors', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const loanId = req.params.loanId;
    const actorId = (req as any).user?.id?.toString() || 'system';
    const correlationId = (req as any).correlationId || `investor_add_${uuidv4()}`;

    // Validate request body
    const validation = addInvestorSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid investor data',
        details: validation.error.errors
      });
    }

    const data = validation.data;

    // Perform audited add
    const result = await investorRepo.addInvestor(client, {
      loanId,
      investorId: data.investorId,
      entityType: data.entityType,
      name: data.name,
      ownershipPercentage: data.ownershipPercentage,
      actorId,
      correlationId,
      additionalInfo: {
        contactName: data.contactName,
        email: data.email,
        phone: data.phone,
        streetAddress: data.streetAddress,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        bankName: data.bankName,
        accountNumber: data.accountNumber,
        routingNumber: data.routingNumber,
        accountType: data.accountType
      }
    });

    res.status(201).json({
      success: true,
      correlationId,
      result: {
        dbId: result.dbId,
        investorId: result.investorId,
        loanId
      },
      message: `Investor ${data.name} added successfully`
    });

  } catch (error) {
    console.error('[InvestorRoutes] Error adding investor:', error);
    
    if (error instanceof Error && error.message === 'INVESTOR_ALREADY_EXISTS') {
      return res.status(409).json({
        error: 'Investor already exists for this loan',
        code: 'INVESTOR_ALREADY_EXISTS'
      });
    }

    res.status(500).json({
      error: 'Failed to add investor',
      code: 'INVESTOR_ADD_FAILED'
    });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/loans/:loanId/investors/:investorDbId
 * Update existing investor with full audit trail
 */
router.patch('/loans/:loanId/investors/:investorDbId', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const loanId = req.params.loanId;
    const investorDbId = req.params.investorDbId;
    const actorId = (req as any).user?.id?.toString() || 'system';
    const correlationId = (req as any).correlationId || `investor_update_${uuidv4()}`;

    // Validate request body
    const validation = updateInvestorSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid investor update data',
        details: validation.error.errors
      });
    }

    const updates = validation.data;

    // Remove undefined values
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );

    if (Object.keys(cleanUpdates).length === 0) {
      return res.status(400).json({
        error: 'No valid updates provided'
      });
    }

    // Perform audited update
    const result = await investorRepo.updateInvestor(client, {
      investorDbId,
      loanId,
      actorId,
      correlationId,
      req, // Pass request context for IP and user agent
      updates: cleanUpdates
    });

    res.status(200).json({
      success: true,
      correlationId,
      result: {
        loanId,
        investorDbId,
        changedFields: result.changedFields,
        changeCount: result.changedFields.length
      },
      message: result.changedFields.length > 0 
        ? `Updated ${result.changedFields.length} investor field(s)`
        : 'No changes detected'
    });

  } catch (error) {
    console.error('[InvestorRoutes] Error updating investor:', error);
    
    if (error instanceof Error && error.message === 'INVESTOR_NOT_FOUND') {
      return res.status(404).json({
        error: 'Investor not found',
        code: 'INVESTOR_NOT_FOUND'
      });
    }

    res.status(500).json({
      error: 'Failed to update investor',
      code: 'INVESTOR_UPDATE_FAILED'
    });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/loans/:loanId/investors/:investorDbId
 * Remove investor from loan with full audit trail
 */
router.delete('/loans/:loanId/investors/:investorDbId', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const loanId = req.params.loanId;
    const investorDbId = req.params.investorDbId;
    const actorId = (req as any).user?.id?.toString() || 'system';
    const correlationId = (req as any).correlationId || `investor_delete_${uuidv4()}`;

    // Perform audited deletion
    const result = await investorRepo.deleteInvestor(client, {
      investorDbId,
      loanId,
      actorId,
      correlationId
    });

    res.status(200).json({
      success: true,
      correlationId,
      result: {
        loanId,
        investorDbId,
        investorId: result.investorId,
        name: result.name
      },
      message: `Investor ${result.name} removed successfully`
    });

  } catch (error) {
    console.error('[InvestorRoutes] Error deleting investor:', error);
    
    if (error instanceof Error && error.message === 'INVESTOR_NOT_FOUND') {
      return res.status(404).json({
        error: 'Investor not found',
        code: 'INVESTOR_NOT_FOUND'
      });
    }

    res.status(500).json({
      error: 'Failed to remove investor',
      code: 'INVESTOR_DELETE_FAILED'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/loans/:loanId/investors/:investorDbId/history
 * Get investor change history for audit purposes
 */
router.get('/loans/:loanId/investors/:investorDbId/history', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const loanId = req.params.loanId;
    const investorDbId = req.params.investorDbId;

    const history = await client.query(
      `SELECT hist_id, old_row, new_row, operation, changed_at, changed_by, correlation_id
       FROM investor_history 
       WHERE investor_db_id = $1 AND loan_id = $2 
       ORDER BY changed_at DESC, hist_id DESC`,
      [investorDbId, loanId]
    );

    res.json({
      loanId,
      investorDbId,
      history: history.rows.map((row: any) => ({
        id: row.hist_id,
        operation: row.operation,
        oldValues: row.old_row,
        newValues: row.new_row,
        changedAt: row.changed_at,
        changedBy: row.changed_by,
        correlationId: row.correlation_id
      }))
    });

  } catch (error) {
    console.error('[InvestorRoutes] Error fetching investor history:', error);
    res.status(500).json({
      error: 'Failed to fetch investor history',
      code: 'INVESTOR_HISTORY_FAILED'
    });
  } finally {
    client.release();
  }
});

export default router;