/**
 * Beneficiary Repository - Audited operations for beneficiary management
 * All operations include proper audit trails and correlation IDs
 */

import { PoolClient } from '@neondatabase/serverless';
import { auditAndRun, setRequestContext, createAuditEvent } from '../utils/audit-helper';
import { outboxService } from '../messaging/outbox-service';

export interface BeneficiaryUpdateParams {
  loanId: string;
  actorId: string;
  correlationId: string;
  updates: {
    beneficiaryName?: string;
    beneficiaryCompanyName?: string;
    beneficiaryPhone?: string;
    beneficiaryEmail?: string;
    beneficiaryStreetAddress?: string;
    beneficiaryCity?: string;
    beneficiaryState?: string;
    beneficiaryZipCode?: string;
  };
  req?: any; // Express request object for audit context
}

export interface BeneficiaryUpdateResult {
  loanId: string;
  oldValues: Record<string, any>;
  newValues: Record<string, any>;
  changedFields: string[];
}

export class BeneficiaryRepository {
  
  /**
   * Update beneficiary information with full audit trail
   * @param client Database client
   * @param params Update parameters including correlation ID
   * @returns Update result with old/new values
   */
  async updateBeneficiaryInfo(
    client: PoolClient,
    params: BeneficiaryUpdateParams
  ): Promise<BeneficiaryUpdateResult> {
    const { loanId, actorId, correlationId, updates, req } = params;

    // Set request context for triggers
    await setRequestContext(client, actorId, correlationId);

    return auditAndRun(client,
      async () => {
        // Get current values for audit comparison
        const prev = await client.query(
          `SELECT beneficiary_name, beneficiary_company_name, beneficiary_phone, 
                  beneficiary_email, beneficiary_street_address, beneficiary_city,
                  beneficiary_state, beneficiary_zip_code 
           FROM loans WHERE id = $1 FOR UPDATE`,
          [loanId]
        );
        
        if (prev.rowCount === 0) {
          throw new Error('LOAN_NOT_FOUND');
        }

        const oldValues = prev.rows[0];
        
        // Build update query dynamically based on provided fields
        const updateFields: string[] = [];
        const updateValues: any[] = [];
        let paramIndex = 2; // Start at 2 since $1 is loanId

        const fieldMapping = {
          beneficiaryName: 'beneficiary_name',
          beneficiaryCompanyName: 'beneficiary_company_name',
          beneficiaryPhone: 'beneficiary_phone',
          beneficiaryEmail: 'beneficiary_email',
          beneficiaryStreetAddress: 'beneficiary_street_address',
          beneficiaryCity: 'beneficiary_city',
          beneficiaryState: 'beneficiary_state',
          beneficiaryZipCode: 'beneficiary_zip_code'
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
          // No changes detected
          return {
            loanId,
            oldValues: {},
            newValues: {},
            changedFields: []
          };
        }

        // Add updated_at field
        updateFields.push(`updated_at = now()`);

        // Execute update
        await client.query(
          `UPDATE loans SET ${updateFields.join(', ')} WHERE id = $1`,
          [loanId, ...updateValues]
        );

        return {
          loanId,
          oldValues: Object.fromEntries(
            changedFields.map(field => [field, oldValues[fieldMapping[field as keyof typeof fieldMapping]]])
          ),
          newValues,
          changedFields
        };
      },
      async (result) => {
        if (result.changedFields.length > 0) {
          // Create audit event for each changed field
          for (const field of result.changedFields) {
            await createAuditEvent(client, {
              actorId,
              eventType: 'CRM.BENEFICIARY.UPDATED',
              resourceType: 'beneficiary',
              resourceId: loanId,
              loanId,
              payloadJson: { 
                field, 
                oldValue: result.oldValues[field], 
                newValue: result.newValues[field] 
              },
              correlationId,
              description: `Beneficiary ${field} updated`,
              req // Pass request context for IP and user agent
            });
          }

          // Emit domain event
          await outboxService.createMessage({
            aggregateType: 'loan',
            aggregateId: loanId,
            eventType: 'beneficiary.updated.v1',
            payload: {
              loanId,
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
}