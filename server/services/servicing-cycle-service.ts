import { eq, and, gte, lte, sql, inArray } from 'drizzle-orm';
import { 
  servicingRuns, 
  servicingEvents, 
  servicingExceptions,
  interestAccruals,
  investorDistributions,
  loans,
  investors,
  loanLedger,
  escrowAccounts,
  escrowDisbursements,
  loanFees,
  paymentsInbox
} from '@shared/schema';
import { addDays, differenceInDays, parseISO } from 'date-fns';

export class ServicingCycleService {
  constructor(private db: any) {}

  async runCycle(runId: string, valuationDate: string, loanIds?: string[], dryRun: boolean = true) {
    try {
      // Update run status to running
      await this.db.update(servicingRuns)
        .set({ status: 'running', startTime: new Date() })
        .where(eq(servicingRuns.runId, runId));

      // Get loans to process
      let loansToProcess: any[] = [];
      if (loanIds && loanIds.length > 0) {
        loansToProcess = await this.db.query.loans.findMany({
          where: inArray(loans.id, loanIds.map(id => parseInt(id)))
        });
      } else {
        loansToProcess = await this.db.query.loans.findMany({
          where: eq(loans.status, 'active')
        });
      }

      let loansProcessed = 0;
      let eventsCreated = 0;
      let exceptionsCreated = 0;
      let totalDisbursedBeneficiary = 0;
      let totalDisbursedInvestors = 0;

      // Process each loan
      for (const loan of loansToProcess) {
        try {
          const result = await this.processLoan(runId, loan, valuationDate, dryRun);
          eventsCreated += result.eventsCreated;
          exceptionsCreated += result.exceptionsCreated;
          totalDisbursedBeneficiary += result.disbursedBeneficiary;
          totalDisbursedInvestors += result.disbursedInvestors;
          loansProcessed++;

          // Update progress
          if (loansProcessed % 10 === 0) {
            await this.db.update(servicingRuns)
              .set({
                loansProcessed,
                eventsCreated,
                exceptionsCreated,
                totalDisbursedBeneficiary: totalDisbursedBeneficiary.toFixed(2),
                totalDisbursedInvestors: totalDisbursedInvestors.toFixed(2)
              })
              .where(eq(servicingRuns.runId, runId));
          }
        } catch (error: any) {
          console.error(`Error processing loan ${loan.id}:`, error);
          await this.createException(runId, loan.id, 'high', 'processing_error', 
            `Failed to process loan: ${error.message}`, 
            'Review error logs and retry processing');
          exceptionsCreated++;
        }
      }

      // Calculate reconciliation status
      const reconciliationStatus = this.calculateReconciliationStatus(
        totalDisbursedBeneficiary,
        totalDisbursedInvestors
      );

      // Update run as completed
      await this.db.update(servicingRuns)
        .set({
          status: 'completed',
          endTime: new Date(),
          loansProcessed,
          eventsCreated,
          exceptionsCreated,
          totalDisbursedBeneficiary: totalDisbursedBeneficiary.toFixed(2),
          totalDisbursedInvestors: totalDisbursedInvestors.toFixed(2),
          reconciliationStatus
        })
        .where(eq(servicingRuns.runId, runId));

    } catch (error: any) {
      console.error('Servicing cycle failed:', error);
      await this.db.update(servicingRuns)
        .set({
          status: 'failed',
          endTime: new Date(),
          errors: [error.message]
        })
        .where(eq(servicingRuns.runId, runId));
      throw error;
    }
  }

  async processLoan(runId: string, loan: any, valuationDate: string, dryRun: boolean) {
    let eventsCreated = 0;
    let exceptionsCreated = 0;
    let disbursedBeneficiary = 0;
    let disbursedInvestors = 0;

    // 1. Process interest accrual
    const accrualResult = await this.processInterestAccrual(runId, loan, valuationDate, dryRun);
    eventsCreated += accrualResult.eventsCreated;

    // 2. Process payments from inbox
    const paymentResult = await this.processPayments(runId, loan, valuationDate, dryRun);
    eventsCreated += paymentResult.eventsCreated;

    // 3. Assess fees and charges
    const feeResult = await this.assessFees(runId, loan, valuationDate, dryRun);
    eventsCreated += feeResult.eventsCreated;

    // 4. Process escrow disbursements
    const escrowResult = await this.processEscrowDisbursements(runId, loan, valuationDate, dryRun);
    eventsCreated += escrowResult.eventsCreated;
    disbursedBeneficiary += escrowResult.disbursed;

    // 5. Calculate investor distributions
    const distributionResult = await this.calculateInvestorDistributions(runId, loan, valuationDate, dryRun);
    eventsCreated += distributionResult.eventsCreated;
    disbursedInvestors += distributionResult.distributed;

    // 6. Check for exceptions
    const exceptionResult = await this.checkForExceptions(runId, loan, valuationDate);
    exceptionsCreated += exceptionResult.exceptionsCreated;

    return {
      eventsCreated,
      exceptionsCreated,
      disbursedBeneficiary,
      disbursedInvestors
    };
  }

  async processInterestAccrual(runId: string, loan: any, valuationDate: string, dryRun: boolean) {
    let eventsCreated = 0;

    try {
      // Calculate interest for the period
      const lastAccrual = await this.db.query.interestAccruals.findFirst({
        where: eq(interestAccruals.loanId, loan.id),
        orderBy: (interestAccruals: any, { desc }: any) => [desc(interestAccruals.accrualDate)]
      });

      const fromDate = lastAccrual ? addDays(parseISO(lastAccrual.accrualDate), 1) : parseISO(loan.originationDate);
      const toDate = parseISO(valuationDate);
      const dayCount = differenceInDays(toDate, fromDate);

      if (dayCount <= 0) {
        return { eventsCreated: 0 };
      }

      const principalBalance = parseFloat(loan.currentBalance || loan.originalAmount);
      const interestRate = parseFloat(loan.interestRate) / 100;
      const dailyRate = interestRate / 365;
      const accruedAmount = principalBalance * dailyRate * dayCount;

      // Create interest accrual event
      const eventKey = `interest_accrual_${loan.id}_${valuationDate}`;
      await this.createEvent(runId, eventKey, 'interest_accrual', loan.id, valuationDate, {
        amount: accruedAmount.toFixed(2),
        interest: accruedAmount.toFixed(2),
        details: {
          fromDate: fromDate.toISOString().split('T')[0],
          toDate: toDate.toISOString().split('T')[0],
          dayCount,
          principalBalance: principalBalance.toFixed(2),
          interestRate: (interestRate * 100).toFixed(2),
          dailyRate: dailyRate.toFixed(10)
        }
      });

      if (!dryRun) {
        // Record interest accrual
        await this.db.insert(interestAccruals).values({
          loanId: loan.id,
          accrualDate: valuationDate,
          fromDate: fromDate.toISOString().split('T')[0],
          toDate: toDate.toISOString().split('T')[0],
          dayCount,
          dayCountConvention: 'ACT/365',
          interestRate: (interestRate * 100).toFixed(4),
          principalBalance: principalBalance.toFixed(2),
          dailyRate: dailyRate.toFixed(10),
          accruedAmount: accruedAmount.toFixed(2),
          runId
        });
      }

      eventsCreated++;
    } catch (error: any) {
      console.error(`Error processing interest accrual for loan ${loan.id}:`, error);
    }

    return { eventsCreated };
  }

  async processPayments(runId: string, loan: any, valuationDate: string, dryRun: boolean) {
    let eventsCreated = 0;

    try {
      // Check for matched payments in inbox
      const payments = await this.db.query.paymentsInbox.findMany({
        where: and(
          eq(paymentsInbox.loanId, loan.id),
          eq(paymentsInbox.status, 'matched'),
          lte(paymentsInbox.valueDate, valuationDate)
        )
      });

      for (const payment of payments) {
        const eventKey = `post_payment_${payment.id}_${valuationDate}`;
        await this.createEvent(runId, eventKey, 'post_payment', loan.id, valuationDate, {
          amount: payment.amount,
          details: {
            paymentId: payment.id,
            referenceNumber: payment.referenceNumber,
            valueDate: payment.valueDate
          }
        });

        if (!dryRun) {
          // Mark payment as processed
          await this.db.update(paymentsInbox)
            .set({
              status: 'processed',
              processedAt: new Date(),
              processedByRunId: runId
            })
            .where(eq(paymentsInbox.id, payment.id));

          // Create ledger entry
          await this.db.insert(loanLedger).values({
            loanId: loan.id,
            transactionDate: valuationDate,
            effectiveDate: payment.valueDate,
            transactionType: 'payment',
            transactionSubtype: 'borrower_payment',
            description: `Payment received - Ref: ${payment.referenceNumber}`,
            amount: payment.amount,
            principalAmount: '0.00', // Will be calculated based on waterfall
            interestAmount: '0.00',
            escrowAmount: '0.00',
            feesAmount: '0.00',
            reference: payment.referenceNumber
          });
        }

        eventsCreated++;
      }
    } catch (error: any) {
      console.error(`Error processing payments for loan ${loan.id}:`, error);
    }

    return { eventsCreated };
  }

  async assessFees(runId: string, loan: any, valuationDate: string, dryRun: boolean) {
    let eventsCreated = 0;

    try {
      // Check for due fees
      const dueFees = await this.db.query.loanFees.findMany({
        where: and(
          eq(loanFees.loanId, loan.id),
          eq(loanFees.status, 'unpaid'),
          lte(loanFees.dueDate, valuationDate)
        )
      });

      for (const fee of dueFees) {
        const eventKey = `assess_fee_${fee.id}_${valuationDate}`;
        await this.createEvent(runId, eventKey, 'assess_fee', loan.id, valuationDate, {
          amount: fee.amount,
          fees: fee.amount,
          details: {
            feeId: fee.id,
            feeName: fee.feeName,
            dueDate: fee.dueDate
          }
        });

        eventsCreated++;
      }

      // Check for late fees
      const paymentDate = parseISO(valuationDate);
      const dueDate = parseISO(loan.paymentDueDay || '15');
      const daysLate = differenceInDays(paymentDate, dueDate);

      if (daysLate > loan.gracePeriodDays && parseFloat(loan.currentBalance) > 0) {
        const lateFeeAmount = parseFloat(loan.lateFeeAmount || '50.00');
        const eventKey = `late_fee_${loan.id}_${valuationDate}`;
        
        await this.createEvent(runId, eventKey, 'late_fee', loan.id, valuationDate, {
          amount: lateFeeAmount.toFixed(2),
          fees: lateFeeAmount.toFixed(2),
          details: {
            daysLate,
            gracePeriodDays: loan.gracePeriodDays
          }
        });

        if (!dryRun) {
          // Create late fee in loan fees
          await this.db.insert(loanFees).values({
            loanId: loan.id,
            templateId: null,
            feeName: 'Late Fee',
            feeType: 'late_fee',
            amount: lateFeeAmount.toFixed(2),
            frequency: 'one_time',
            status: 'unpaid',
            dueDate: valuationDate,
            assessedDate: valuationDate
          });
        }

        eventsCreated++;
      }
    } catch (error: any) {
      console.error(`Error assessing fees for loan ${loan.id}:`, error);
    }

    return { eventsCreated };
  }

  async processEscrowDisbursements(runId: string, loan: any, valuationDate: string, dryRun: boolean) {
    let eventsCreated = 0;
    let disbursed = 0;

    try {
      // Get escrow disbursements due
      const disbursements = await this.db.query.escrowDisbursements.findMany({
        where: and(
          eq(escrowDisbursements.loanId, loan.id),
          eq(escrowDisbursements.status, 'scheduled'),
          lte(escrowDisbursements.dueDate, valuationDate)
        )
      });

      for (const disbursement of disbursements) {
        const eventKey = `escrow_disbursement_${disbursement.id}_${valuationDate}`;
        const amount = parseFloat(disbursement.amount);
        
        await this.createEvent(runId, eventKey, 'escrow_disbursement', loan.id, valuationDate, {
          amount: amount.toFixed(2),
          escrow: amount.toFixed(2),
          details: {
            disbursementId: disbursement.id,
            payee: disbursement.payee,
            category: disbursement.category,
            dueDate: disbursement.dueDate
          }
        });

        if (!dryRun) {
          // Update disbursement status
          await this.db.update(escrowDisbursements)
            .set({
              status: 'paid',
              paidDate: valuationDate
            })
            .where(eq(escrowDisbursements.id, disbursement.id));
        }

        disbursed += amount;
        eventsCreated++;
      }
    } catch (error: any) {
      console.error(`Error processing escrow disbursements for loan ${loan.id}:`, error);
    }

    return { eventsCreated, disbursed };
  }

  async calculateInvestorDistributions(runId: string, loan: any, valuationDate: string, dryRun: boolean) {
    let eventsCreated = 0;
    let distributed = 0;

    try {
      // Get loan investors
      const loanInvestorsList = await this.db.query.investors.findMany({
        where: eq(investors.loanId, loan.id)
      });

      if (loanInvestorsList.length === 0) {
        return { eventsCreated: 0, distributed: 0 };
      }

      // Calculate distributions based on recent payments
      const recentPayments = await this.db.query.loanLedger.findMany({
        where: and(
          eq(loanLedger.loanId, loan.id),
          eq(loanLedger.transactionType, 'payment'),
          gte(loanLedger.transactionDate, valuationDate)
        )
      });

      for (const payment of recentPayments) {
        const totalAmount = parseFloat(payment.amount);
        
        for (const investor of loanInvestorsList) {
          const ownershipPercentage = parseFloat(investor.ownershipPercentage) / 100;
          const distributionAmount = totalAmount * ownershipPercentage;

          const eventKey = `investor_distribution_${investor.investorId}_${payment.id}_${valuationDate}`;
          await this.createEvent(runId, eventKey, 'distribute_investors', loan.id, valuationDate, {
            amount: distributionAmount.toFixed(2),
            details: {
              investorId: investor.investorId,
              investorName: investor.name,
              ownershipPercentage: (ownershipPercentage * 100).toFixed(2),
              paymentId: payment.id
            }
          });

          if (!dryRun) {
            // Create investor distribution record
            await this.db.insert(investorDistributions).values({
              runId,
              loanId: loan.id,
              investorId: investor.id,
              distributionDate: valuationDate,
              ownershipPercentage: (ownershipPercentage * 100).toFixed(6),
              grossAmount: distributionAmount.toFixed(2),
              principalAmount: (parseFloat(payment.principalAmount || '0') * ownershipPercentage).toFixed(2),
              interestAmount: (parseFloat(payment.interestAmount || '0') * ownershipPercentage).toFixed(2),
              feesAmount: (parseFloat(payment.feesAmount || '0') * ownershipPercentage).toFixed(2),
              netAmount: distributionAmount.toFixed(2),
              status: 'pending'
            });
          }

          distributed += distributionAmount;
          eventsCreated++;
        }
      }
    } catch (error: any) {
      console.error(`Error calculating investor distributions for loan ${loan.id}:`, error);
    }

    return { eventsCreated, distributed };
  }

  async checkForExceptions(runId: string, loan: any, valuationDate: string) {
    let exceptionsCreated = 0;

    try {
      // Check for insufficient escrow
      const escrowAccount = await this.db.query.escrowAccounts.findFirst({
        where: eq(escrowAccounts.loanId, loan.id)
      });

      if (escrowAccount && parseFloat(escrowAccount.currentBalance) < 0) {
        await this.createException(
          runId,
          loan.id,
          'high',
          'insufficient_escrow',
          `Escrow account has negative balance: $${escrowAccount.currentBalance}`,
          'Review escrow account and consider escrow advance'
        );
        exceptionsCreated++;
      }

      // Check for missing payments
      const expectedPaymentDate = loan.paymentDueDay;
      const lastPayment = await this.db.query.loanLedger.findFirst({
        where: and(
          eq(loanLedger.loanId, loan.id),
          eq(loanLedger.transactionType, 'payment')
        ),
        orderBy: (loanLedger: any, { desc }: any) => [desc(loanLedger.transactionDate)]
      });

      if (lastPayment) {
        const daysSinceLastPayment = differenceInDays(parseISO(valuationDate), parseISO(lastPayment.transactionDate));
        if (daysSinceLastPayment > 60) {
          await this.createException(
            runId,
            loan.id,
            'critical',
            'missing_payment',
            `No payment received for ${daysSinceLastPayment} days`,
            'Contact borrower immediately'
          );
          exceptionsCreated++;
        }
      }

      // Check for data anomalies
      if (!loan.interestRate || parseFloat(loan.interestRate) === 0) {
        await this.createException(
          runId,
          loan.id,
          'medium',
          'data_anomaly',
          'Loan has no interest rate defined',
          'Update loan terms with correct interest rate'
        );
        exceptionsCreated++;
      }
    } catch (error: any) {
      console.error(`Error checking exceptions for loan ${loan.id}:`, error);
    }

    return { exceptionsCreated };
  }

  async createEvent(runId: string, eventKey: string, eventType: string, loanId: number, valuationDate: string, data: any) {
    try {
      await this.db.insert(servicingEvents).values({
        runId,
        eventKey,
        eventType,
        loanId,
        valuationDate,
        amount: data.amount,
        principal: data.principal,
        interest: data.interest,
        escrow: data.escrow,
        fees: data.fees,
        details: data.details || {},
        status: 'success'
      });
    } catch (error: any) {
      // Handle unique constraint violation (event already exists)
      if (error.code === '23505') {
        console.log(`Event ${eventKey} already exists, skipping`);
      } else {
        console.error(`Error creating event ${eventKey}:`, error);
        throw error;
      }
    }
  }

  async createException(
    runId: string,
    loanId: number,
    severity: 'low' | 'medium' | 'high' | 'critical',
    type: string,
    message: string,
    suggestedAction: string
  ) {
    try {
      await this.db.insert(servicingExceptions).values({
        runId,
        loanId,
        severity,
        type,
        message,
        suggestedAction,
        dueDate: addDays(new Date(), severity === 'critical' ? 1 : severity === 'high' ? 3 : 7)
          .toISOString().split('T')[0],
        status: 'open'
      });
    } catch (error: any) {
      console.error(`Error creating exception for loan ${loanId}:`, error);
    }
  }

  calculateReconciliationStatus(disbursedBeneficiary: number, disbursedInvestors: number): 'pending' | 'balanced' | 'imbalanced' {
    const difference = Math.abs(disbursedBeneficiary - disbursedInvestors);
    if (difference < 0.01) {
      return 'balanced';
    } else if (difference < 10) {
      return 'pending';
    } else {
      return 'imbalanced';
    }
  }

  async reprocessLoan(runId: string, loanId: number, valuationDate: string) {
    const loan = await this.db.query.loans.findFirst({
      where: eq(loans.id, loanId)
    });

    if (!loan) {
      throw new Error(`Loan ${loanId} not found`);
    }

    // Delete existing events for this loan and date
    await this.db.delete(servicingEvents)
      .where(and(
        eq(servicingEvents.loanId, loanId),
        eq(servicingEvents.valuationDate, valuationDate)
      ));

    // Reprocess the loan
    return await this.processLoan(runId, loan, valuationDate, false);
  }
}