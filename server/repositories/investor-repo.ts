/**
 * Investor Repository - Audited operations for investor management
 * All operations include proper audit trails and correlation IDs
 */

import { PoolClient } from '@neondatabase/serverless';
import { auditAndRun, setRequestContext, createAuditEvent } from '../utils/audit-helper';
import { outboxService } from '../messaging/outbox-service';

export interface AddInvestorParams {
  loanId: string;
  investorId: string;
  entityType: 'individual' | 'entity';
  name: string;
  ownershipPercentage: number;
  actorId: string;
  correlationId: string;
  additionalInfo?: {
    contactName?: string;
    email?: string;
    phone?: string;
    streetAddress?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    bankName?: string;
    accountNumber?: string;
    routingNumber?: string;
    accountType?: string;
  };
}

export interface UpdateInvestorParams {
  investorDbId: string; // Database ID of investor record
  loanId: string;
  actorId: string;
  correlationId: string;
  updates: {
    name?: string;
    ownershipPercentage?: number;
    email?: string;
    phone?: string;
    streetAddress?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    bankName?: string;
    accountNumber?: string;
    routingNumber?: string;
    accountType?: string;
    isActive?: boolean;
    notes?: string;
  };
}

export interface DeleteInvestorParams {
  investorDbId: string;
  loanId: string;
  actorId: string;
  correlationId: string;
}

export class InvestorRepository {

  /**
   * Add new investor to loan with full audit trail
   */
  async addInvestor(
    client: PoolClient,
    params: AddInvestorParams
  ): Promise<{ investorId: string; dbId: number }> {
    const { loanId, investorId, entityType, name, ownershipPercentage, actorId, correlationId, additionalInfo } = params;

    await setRequestContext(client, actorId, correlationId);

    return auditAndRun(client,
      async () => {
        // Check if investor already exists for this loan
        const existing = await client.query(
          'SELECT id FROM investors WHERE investor_id = $1 AND loan_id = $2',
          [investorId, loanId]
        );

        if (existing.rowCount && existing.rowCount > 0) {
          throw new Error('INVESTOR_ALREADY_EXISTS');
        }

        // Insert new investor
        const result = await client.query(
          `INSERT INTO investors (
            investor_id, loan_id, entity_type, name, ownership_percentage,
            contact_name, email, phone, street_address, city, state, zip_code,
            bank_name, account_number, routing_number, account_type, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now(), now())
          RETURNING id`,
          [
            investorId, loanId, entityType, name, ownershipPercentage,
            additionalInfo?.contactName || null,
            additionalInfo?.email || null,
            additionalInfo?.phone || null,
            additionalInfo?.streetAddress || null,
            additionalInfo?.city || null,
            additionalInfo?.state || null,
            additionalInfo?.zipCode || null,
            additionalInfo?.bankName || null,
            additionalInfo?.accountNumber || null,
            additionalInfo?.routingNumber || null,
            additionalInfo?.accountType || null
          ]
        );

        return { 
          investorId, 
          dbId: result.rows[0].id,
          ownershipPercentage,
          name,
          entityType
        };
      },
      async (result) => {
        // Create audit event
        await createAuditEvent(client, {
          actorId,
          eventType: 'CRM.INVESTOR.ADDED',
          resourceType: 'investor_loan',
          resourceId: `${loanId}:${investorId}`,
          loanId,
          payloadJson: { 
            investorId: result.investorId,
            name: result.name,
            entityType: result.entityType,
            ownershipPercentage: result.ownershipPercentage
          },
          correlationId,
          description: `Investor ${result.name} added to loan`
        });

        // Emit domain event
        await outboxService.createMessage({
          aggregateType: 'loan',
          aggregateId: loanId,
          eventType: 'investor.added.v1',
          payload: {
            loanId,
            investorId: result.investorId,
            name: result.name,
            entityType: result.entityType,
            ownershipPercentage: result.ownershipPercentage,
            addedBy: actorId
          },
          correlationId
        });
      }
    );
  }

  /**
   * Update existing investor with full audit trail
   */
  async updateInvestor(
    client: PoolClient,
    params: UpdateInvestorParams
  ): Promise<{ oldValues: Record<string, any>; newValues: Record<string, any>; changedFields: string[] }> {
    const { investorDbId, loanId, actorId, correlationId, updates } = params;

    await setRequestContext(client, actorId, correlationId);

    return auditAndRun(client,
      async () => {
        // Get current values
        const prev = await client.query(
          `SELECT investor_id, name, ownership_percentage, email, phone, 
                  street_address, city, state, zip_code, bank_name, 
                  account_number, routing_number, account_type, is_active, notes
           FROM investors WHERE id = $1 AND loan_id = $2 FOR UPDATE`,
          [investorDbId, loanId]
        );

        if (prev.rowCount === 0) {
          throw new Error('INVESTOR_NOT_FOUND');
        }

        const oldValues = prev.rows[0];
        
        // Build update query
        const updateFields: string[] = [];
        const updateValues: any[] = [];
        let paramIndex = 3; // $1 is investorDbId, $2 is loanId

        const fieldMapping = {
          name: 'name',
          ownershipPercentage: 'ownership_percentage',
          email: 'email',
          phone: 'phone',
          streetAddress: 'street_address',
          city: 'city',
          state: 'state',
          zipCode: 'zip_code',
          bankName: 'bank_name',
          accountNumber: 'account_number',
          routingNumber: 'routing_number',
          accountType: 'account_type',
          isActive: 'is_active',
          notes: 'notes'
        };

        const changedFields: string[] = [];
        const newValues: Record<string, any> = {};

        for (const [key, value] of Object.entries(updates)) {
          if (value !== undefined && fieldMapping[key as keyof typeof fieldMapping]) {
            const dbField = fieldMapping[key as keyof typeof fieldMapping];
            const oldValue = oldValues[dbField];
            
            if (oldValue !== value) {
              updateFields.push(`${dbField} = $${paramIndex}`);
              updateValues.push(value);
              changedFields.push(key);
              newValues[key] = value;
              paramIndex++;
            }
          }
        }

        if (updateFields.length === 0) {
          return {
            oldValues: {},
            newValues: {},
            changedFields: []
          };
        }

        updateFields.push(`updated_at = now()`);

        await client.query(
          `UPDATE investors SET ${updateFields.join(', ')} WHERE id = $1 AND loan_id = $2`,
          [investorDbId, loanId, ...updateValues]
        );

        return {
          oldValues: Object.fromEntries(
            changedFields.map(field => [field, oldValues[fieldMapping[field as keyof typeof fieldMapping]]])
          ),
          newValues,
          changedFields,
          investorId: oldValues.investor_id
        };
      },
      async (result) => {
        if (result.changedFields.length > 0) {
          // Create audit event
          await createAuditEvent(client, {
            actorId,
            eventType: 'CRM.INVESTOR.UPDATED',
            resourceType: 'investor_loan',
            resourceId: `${loanId}:${result.investorId}`,
            loanId,
            payloadJson: {
              investorId: result.investorId,
              changedFields: result.changedFields,
              oldValues: result.oldValues,
              newValues: result.newValues
            },
            correlationId,
            description: `Investor ${result.investorId} updated`
          });

          // Emit domain event
          await outboxService.createMessage({
            aggregateType: 'loan',
            aggregateId: loanId,
            eventType: 'investor.updated.v1',
            payload: {
              loanId,
              investorId: result.investorId,
              changedFields: result.changedFields,
              oldValues: result.oldValues,
              newValues: result.newValues,
              updatedBy: actorId
            },
            correlationId
          });
        }
      }
    );
  }

  /**
   * Remove investor from loan with full audit trail
   */
  async deleteInvestor(
    client: PoolClient,
    params: DeleteInvestorParams
  ): Promise<{ investorId: string; name: string }> {
    const { investorDbId, loanId, actorId, correlationId } = params;

    await setRequestContext(client, actorId, correlationId);

    return auditAndRun(client,
      async () => {
        // Get investor info before deletion
        const investor = await client.query(
          'SELECT investor_id, name FROM investors WHERE id = $1 AND loan_id = $2',
          [investorDbId, loanId]
        );

        if (investor.rowCount === 0) {
          throw new Error('INVESTOR_NOT_FOUND');
        }

        const { investor_id, name } = investor.rows[0];

        // Soft delete (set inactive) rather than hard delete for audit trail
        await client.query(
          'UPDATE investors SET is_active = false, updated_at = now() WHERE id = $1 AND loan_id = $2',
          [investorDbId, loanId]
        );

        return { investorId: investor_id, name };
      },
      async (result) => {
        // Create audit event
        await createAuditEvent(client, {
          actorId,
          eventType: 'CRM.INVESTOR.REMOVED',
          resourceType: 'investor_loan',
          resourceId: `${loanId}:${result.investorId}`,
          loanId,
          payloadJson: {
            investorId: result.investorId,
            name: result.name
          },
          correlationId,
          description: `Investor ${result.name} removed from loan`
        });

        // Emit domain event
        await outboxService.createMessage({
          aggregateType: 'loan',
          aggregateId: loanId,
          eventType: 'investor.removed.v1',
          payload: {
            loanId,
            investorId: result.investorId,
            name: result.name,
            removedBy: actorId
          },
          correlationId
        });
      }
    );
  }
}