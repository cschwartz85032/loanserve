/**
 * Beneficiary Routes - Audited beneficiary management endpoints
 * All operations include proper audit trails and correlation IDs
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/database';
import { pool } from '../db';
import { BeneficiaryRepository } from '../repositories/beneficiary-repo';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const beneficiaryRepo = new BeneficiaryRepository();

// Validation schema for beneficiary updates
const updateBeneficiarySchema = z.object({
  beneficiaryName: z.string().optional(),
  beneficiaryCompanyName: z.string().optional(),
  beneficiaryPhone: z.string().optional(),
  beneficiaryEmail: z.string().email().optional(),
  beneficiaryStreetAddress: z.string().optional(),
  beneficiaryCity: z.string().optional(),
  beneficiaryState: z.string().optional(),
  beneficiaryZipCode: z.string().optional()
});

/**
 * PATCH /api/loans/:loanId/beneficiary
 * Update beneficiary information with full audit trail
 */
router.patch('/loans/:loanId/beneficiary', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const loanId = req.params.loanId;
    const actorId = (req as any).user?.id?.toString() || 'system';
    const correlationId = (req as any).correlationId || `beneficiary_update_${uuidv4()}`;

    // Validate request body
    const validation = updateBeneficiarySchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid beneficiary data',
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
    const result = await beneficiaryRepo.updateBeneficiaryInfo(client, {
      loanId,
      actorId,
      correlationId,
      updates: cleanUpdates,
      req // Pass request for audit context
    });

    res.status(200).json({
      success: true,
      correlationId,
      result: {
        loanId: result.loanId,
        changedFields: result.changedFields,
        changeCount: result.changedFields.length
      },
      message: result.changedFields.length > 0 
        ? `Updated ${result.changedFields.length} beneficiary field(s)`
        : 'No changes detected'
    });

  } catch (error) {
    console.error('[BeneficiaryRoutes] Error updating beneficiary:', error);
    res.status(500).json({
      error: 'Failed to update beneficiary information',
      code: 'BENEFICIARY_UPDATE_FAILED'
    });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/loans/:loanId/beneficiary/name
 * Update beneficiary name specifically (example from requirements)
 */
router.patch('/loans/:loanId/beneficiary/name', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const loanId = req.params.loanId;
    const { newName } = req.body;
    const actorId = (req as any).user?.id?.toString() || 'system';
    const correlationId = (req as any).correlationId || `beneficiary_name_${uuidv4()}`;

    if (!newName || typeof newName !== 'string') {
      return res.status(400).json({
        error: 'Valid newName is required'
      });
    }

    // Perform audited update
    const result = await beneficiaryRepo.updateBeneficiaryInfo(client, {
      loanId,
      actorId,
      correlationId,
      updates: { beneficiaryName: newName },
      req // Pass request for audit context
    });

    res.status(200).json({
      success: true,
      correlationId,
      result: {
        loanId: result.loanId,
        nameUpdated: result.changedFields.includes('beneficiaryName'),
        oldName: result.oldValues.beneficiaryName,
        newName: result.newValues.beneficiaryName
      }
    });

  } catch (error) {
    console.error('[BeneficiaryRoutes] Error updating beneficiary name:', error);
    res.status(500).json({
      error: 'Failed to update beneficiary name',
      code: 'BENEFICIARY_NAME_UPDATE_FAILED'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/loans/:loanId/beneficiary/history
 * Get beneficiary change history for audit purposes
 */
router.get('/loans/:loanId/beneficiary/history', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const loanId = req.params.loanId;

    const history = await client.query(
      `SELECT hist_id, old_row, new_row, operation, changed_at, changed_by, correlation_id
       FROM beneficiary_history 
       WHERE loan_id = $1 
       ORDER BY changed_at DESC, hist_id DESC`,
      [loanId]
    );

    res.json({
      loanId,
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
    console.error('[BeneficiaryRoutes] Error fetching beneficiary history:', error);
    res.status(500).json({
      error: 'Failed to fetch beneficiary history',
      code: 'BENEFICIARY_HISTORY_FAILED'
    });
  } finally {
    client.release();
  }
});

export default router;