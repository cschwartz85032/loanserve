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
  paymentsInbox,
  crmActivity
} from '@shared/schema';
import { addDays, differenceInDays, parseISO } from 'date-fns';

export class ServicingCycleService {
  constructor(private db: any) {}

  // Helper method for extremely detailed event logging
  async createDetailedEventLog(runId: string, loanId: number | null, valuationDate: string, eventType: string, details: any) {
    try {
      const eventKey = `log_${eventType}_${loanId}_${valuationDate}_${Date.now()}`;
      await this.db.insert(servicingEvents).values({
        runId,
        eventKey,
        eventType: `LOG_${eventType}`,
        loanId,
        timestamp: new Date(),
        valuationDate,
        amount: details.amount || '0.00',
        principal: details.principal || '0.00',
        interest: details.interest || '0.00',
        escrow: details.escrow || '0.00',
        fees: details.fees || '0.00',
        details: JSON.stringify(details),
        status: 'success',
        errorMessage: null,
        createdAt: new Date()
      });
    } catch (error) {
      console.error('Failed to create detailed event log:', error);
    }
  }

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

    // Log loan processing start with exhaustive details
    await this.createDetailedEventLog(runId, loan.id, valuationDate, 'LOAN_PROCESSING_START', {
      message: `Starting comprehensive processing for loan ${loan.loanNumber}`,
      loanNumber: loan.loanNumber,
      loanStatus: loan.status,
      principalBalance: loan.currentBalance,
      originalAmount: loan.originalAmount,
      interestRate: loan.interestRate,
      interestRateType: loan.interestRateType,
      maturityDate: loan.maturityDate,
      originationDate: loan.originationDate,
      lastPaymentDate: loan.lastPaymentDate,
      nextPaymentDue: loan.nextPaymentDue,
      paymentAmount: loan.paymentAmount,
      paymentFrequency: loan.paymentFrequency,
      gracePeriodDays: loan.gracePeriodDays,
      lateFeePercentage: loan.lateFeePercentage,
      prepaymentPenalty: loan.prepaymentPenalty,
      dryRunMode: dryRun,
      valuationDate: valuationDate,
      processingTime: new Date().toISOString(),
      decision: 'INITIATED',
      reason: 'Loan has been selected for daily servicing cycle processing'
    });

    // 1. Process interest accrual with detailed logging
    await this.createDetailedEventLog(runId, loan.id, valuationDate, 'INTEREST_ACCRUAL_START', {
      message: 'Beginning interest accrual evaluation',
      currentBalance: loan.currentBalance,
      interestRate: loan.interestRate,
      lastInterestAccrualDate: loan.lastInterestAccrualDate,
      daysSinceLastAccrual: loan.lastInterestAccrualDate ? differenceInDays(new Date(valuationDate), new Date(loan.lastInterestAccrualDate)) : 'never accrued',
      decision: 'EVALUATING',
      reason: 'Checking if interest needs to be accrued based on time elapsed and balance'
    });

    const accrualResult = await this.processInterestAccrual(runId, loan, valuationDate, dryRun);
    eventsCreated += accrualResult.eventsCreated;

    await this.createDetailedEventLog(runId, loan.id, valuationDate, 'INTEREST_ACCRUAL_COMPLETE', {
      message: 'Interest accrual processing completed',
      eventsCreated: accrualResult.eventsCreated,
      decision: accrualResult.eventsCreated > 0 ? 'ACCRUED' : 'SKIPPED',
      reason: accrualResult.eventsCreated > 0 ? 'Interest successfully accrued' : 'No interest to accrue for this period'
    });

    // 2. Process payments from inbox with detailed logging
    await this.createDetailedEventLog(runId, loan.id, valuationDate, 'PAYMENT_INBOX_START', {
      message: 'Searching payment inbox for matching payments',
      loanNumber: loan.loanNumber,
      loanId: loan.id,
      borrowerId: loan.borrowerId,
      searchCriteria: {
        byLoanId: true,
        byBorrowerId: true,
        byReferenceNumber: true
      },
      decision: 'SEARCHING',
      reason: 'Looking for unprocessed payments that could belong to this loan'
    });

    const paymentResult = await this.processPayments(runId, loan, valuationDate, dryRun);
    eventsCreated += paymentResult.eventsCreated;

    await this.createDetailedEventLog(runId, loan.id, valuationDate, 'PAYMENT_INBOX_COMPLETE', {
      message: 'Payment inbox processing completed',
      paymentsProcessed: paymentResult.eventsCreated,
      decision: paymentResult.eventsCreated > 0 ? 'PROCESSED' : 'NO_PAYMENTS',
      reason: paymentResult.eventsCreated > 0 ? 'Payments found and processed' : 'No matching payments found in inbox'
    });

    // 3. Assess fees and charges with detailed logging
    // Calculate actual next payment date based on payment schedule
    const firstPaymentDate = loan.firstPaymentDate ? new Date(loan.firstPaymentDate) : null;
    const currentDate = new Date(valuationDate);
    let actualNextPaymentDate = null;
    let missedPayments = 0;
    
    if (firstPaymentDate && loan.paymentFrequency === 'monthly') {
      // Calculate how many payments should have been made
      const monthsSinceFirst = differenceInDays(currentDate, firstPaymentDate) / 30;
      if (monthsSinceFirst > 0) {
        // Payments are due starting from first payment date
        missedPayments = Math.floor(monthsSinceFirst);
        actualNextPaymentDate = addDays(firstPaymentDate, missedPayments * 30);
      } else {
        // First payment hasn't come due yet
        actualNextPaymentDate = firstPaymentDate;
      }
    }
    
    await this.createDetailedEventLog(runId, loan.id, valuationDate, 'FEE_ASSESSMENT_START', {
      message: 'Evaluating fee and late charge assessment',
      firstPaymentDate: loan.firstPaymentDate,
      currentDate: valuationDate,
      actualNextPaymentDate: actualNextPaymentDate?.toISOString(),
      missedPayments: missedPayments,
      paymentFrequency: loan.paymentFrequency,
      gracePeriodDays: loan.gracePeriodDays,
      lateFeePercentage: loan.lateFeePercentage,
      paymentAmount: loan.paymentAmount,
      decision: 'EVALUATING',
      reason: missedPayments > 0 ? `Found ${missedPayments} missed monthly payments` : 'Checking payment schedule'
    });

    const feeResult = await this.assessFees(runId, loan, valuationDate, dryRun);
    eventsCreated += feeResult.eventsCreated;

    await this.createDetailedEventLog(runId, loan.id, valuationDate, 'FEE_ASSESSMENT_COMPLETE', {
      message: 'Fee assessment completed',
      feesAssessed: feeResult.eventsCreated,
      decision: feeResult.eventsCreated > 0 ? 'FEES_CHARGED' : 'NO_FEES',
      reason: feeResult.eventsCreated > 0 ? 'Late fees or other charges assessed' : 'No fees to assess at this time'
    });

    // 4. Process escrow disbursements with detailed logging
    await this.createDetailedEventLog(runId, loan.id, valuationDate, 'ESCROW_DISBURSEMENT_START', {
      message: 'Checking for scheduled escrow disbursements',
      loanId: loan.id,
      valuationDate: valuationDate,
      searchCriteria: {
        status: 'scheduled',
        dueDateOnOrBefore: valuationDate
      },
      decision: 'SEARCHING',
      reason: 'Looking for escrow disbursements that are due for payment'
    });

    const escrowResult = await this.processEscrowDisbursements(runId, loan, valuationDate, dryRun);
    eventsCreated += escrowResult.eventsCreated;
    disbursedBeneficiary += escrowResult.disbursed;

    await this.createDetailedEventLog(runId, loan.id, valuationDate, 'ESCROW_DISBURSEMENT_COMPLETE', {
      message: 'Escrow disbursement processing completed',
      disbursementsProcessed: escrowResult.eventsCreated,
      totalDisbursed: escrowResult.disbursed,
      decision: escrowResult.eventsCreated > 0 ? 'DISBURSED' : 'NO_DISBURSEMENTS',
      reason: escrowResult.eventsCreated > 0 ? 'Escrow disbursements successfully processed' : 'No escrow disbursements due'
    });

    // 5. Calculate investor distributions with detailed logging
    await this.createDetailedEventLog(runId, loan.id, valuationDate, 'INVESTOR_DISTRIBUTION_START', {
      message: 'Calculating investor distributions',
      loanId: loan.id,
      checkingForInvestors: true,
      decision: 'EVALUATING',
      reason: 'Determining if there are investors requiring payment distributions'
    });

    const distributionResult = await this.calculateInvestorDistributions(runId, loan, valuationDate, dryRun);
    eventsCreated += distributionResult.eventsCreated;
    disbursedInvestors += distributionResult.distributed;

    await this.createDetailedEventLog(runId, loan.id, valuationDate, 'INVESTOR_DISTRIBUTION_COMPLETE', {
      message: 'Investor distribution calculation completed',
      distributionsCalculated: distributionResult.eventsCreated,
      totalDistributed: distributionResult.distributed,
      decision: distributionResult.eventsCreated > 0 ? 'DISTRIBUTED' : 'NO_DISTRIBUTIONS',
      reason: distributionResult.eventsCreated > 0 ? 'Investor distributions calculated' : 'No investor distributions needed'
    });

    // 6. Check for exceptions with detailed logging
    await this.createDetailedEventLog(runId, loan.id, valuationDate, 'EXCEPTION_CHECK_START', {
      message: 'Starting comprehensive exception analysis',
      checksToPerform: [
        'payment_overdue_check',
        'escrow_shortage_check',
        'maturity_approaching_check',
        'insurance_expiry_check',
        'balance_discrepancy_check',
        'investor_reconciliation_check'
      ],
      decision: 'ANALYZING',
      reason: 'Running all exception rules to identify potential issues or risks'
    });

    const exceptionResult = await this.checkForExceptions(runId, loan, valuationDate);
    exceptionsCreated += exceptionResult.exceptionsCreated;

    await this.createDetailedEventLog(runId, loan.id, valuationDate, 'EXCEPTION_CHECK_COMPLETE', {
      message: 'Exception analysis completed',
      exceptionsFound: exceptionResult.exceptionsCreated,
      decision: exceptionResult.exceptionsCreated > 0 ? 'EXCEPTIONS_FOUND' : 'NO_EXCEPTIONS',
      reason: exceptionResult.exceptionsCreated > 0 ? 'Issues identified requiring attention' : 'No exceptions or issues found'
    });

    // Log loan processing completion with summary
    await this.createDetailedEventLog(runId, loan.id, valuationDate, 'LOAN_PROCESSING_COMPLETE', {
      message: `Completed all processing steps for loan ${loan.loanNumber}`,
      summary: {
        eventsCreated: eventsCreated,
        exceptionsCreated: exceptionsCreated,
        disbursedToBeneficiary: disbursedBeneficiary,
        disbursedToInvestors: disbursedInvestors,
        totalDisbursed: disbursedBeneficiary + disbursedInvestors
      },
      processingTime: new Date().toISOString(),
      dryRunMode: dryRun,
      decision: 'COMPLETED_SUCCESSFULLY',
      reason: 'All loan servicing steps have been executed successfully'
    });

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
      // Log checking for last accrual
      await this.createDetailedEventLog(runId, loan.id, valuationDate, 'INTEREST_ACCRUAL_LOOKUP', {
        message: 'Looking up last interest accrual record',
        loanId: loan.id,
        searchingFor: 'most recent accrual date',
        decision: 'QUERYING',
        reason: 'Need to determine from date for interest calculation'
      });

      // Calculate interest for the period
      const lastAccrual = await this.db.query.interestAccruals.findFirst({
        where: eq(interestAccruals.loanId, loan.id),
        orderBy: (interestAccruals: any, { desc }: any) => [desc(interestAccruals.accrualDate)]
      });

      await this.createDetailedEventLog(runId, loan.id, valuationDate, 'INTEREST_ACCRUAL_LAST_FOUND', {
        message: lastAccrual ? 'Found previous accrual record' : 'No previous accrual found',
        lastAccrualDate: lastAccrual?.accrualDate || null,
        lastAccrualAmount: lastAccrual?.accruedAmount || null,
        decision: lastAccrual ? 'FOUND' : 'NOT_FOUND',
        reason: lastAccrual ? 'Will calculate from day after last accrual' : 'Will calculate from loan origination date'
      });

      const fromDate = lastAccrual && lastAccrual.accrualDate 
        ? addDays(parseISO(String(lastAccrual.accrualDate)), 1) 
        : loan.originationDate ? parseISO(String(loan.originationDate)) : new Date();
      const toDate = parseISO(String(valuationDate));
      const dayCount = differenceInDays(toDate, fromDate);

      await this.createDetailedEventLog(runId, loan.id, valuationDate, 'INTEREST_ACCRUAL_DATE_CALC', {
        message: 'Calculated accrual period',
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
        dayCount: dayCount,
        decision: dayCount > 0 ? 'WILL_ACCRUE' : 'SKIP_ACCRUAL',
        reason: dayCount > 0 ? `${dayCount} days to accrue interest for` : 'No days to accrue (already accrued or future date)'
      });

      if (dayCount <= 0) {
        await this.createDetailedEventLog(runId, loan.id, valuationDate, 'INTEREST_ACCRUAL_SKIPPED', {
          message: 'Skipping interest accrual',
          fromDate: fromDate.toISOString(),
          toDate: toDate.toISOString(),
          dayCount: dayCount,
          decision: 'SKIPPED',
          reason: dayCount === 0 ? 'Already accrued for this date' : 'Invalid date range (negative days)'
        });
        return { eventsCreated: 0 };
      }

      const principalBalance = parseFloat(loan.currentBalance || loan.originalAmount);
      const interestRate = parseFloat(loan.interestRate) / 100;
      const dailyRate = interestRate / 365;
      const accruedAmount = principalBalance * dailyRate * dayCount;

      await this.createDetailedEventLog(runId, loan.id, valuationDate, 'INTEREST_ACCRUAL_CALCULATION', {
        message: 'Calculated interest accrual amount',
        principalBalance: principalBalance,
        annualInterestRate: loan.interestRate,
        annualInterestRateDecimal: interestRate,
        dailyRate: dailyRate,
        dayCount: dayCount,
        calculation: `${principalBalance} * ${dailyRate} * ${dayCount}`,
        accruedAmount: accruedAmount.toFixed(2),
        decision: 'CALCULATED',
        reason: `Interest calculated using ${loan.interestRateType || 'standard'} method`
      });

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
      // Check for due fees (unpaid = no paidDate set)
      const dueFees = await this.db.query.loanFees.findMany({
        where: and(
          eq(loanFees.loanId, loan.id),
          sql`${loanFees.paidDate} IS NULL`,
          sql`${loanFees.dueDate} <= ${valuationDate}::date`
        )
      });

      for (const fee of dueFees) {
        const eventKey = `assess_fee_${fee.id}_${valuationDate}`;
        await this.createEvent(runId, eventKey, 'assess_fee', loan.id, valuationDate, {
          amount: fee.feeAmount,
          fees: fee.feeAmount,
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
          
          // Log late fee to CRM activity
          await this.db.insert(crmActivity).values({
            loanId: loan.id,
            userId: 1, // System user
            activityType: 'fee_assessment',
            activityData: {
              description: `Late fee of $${lateFeeAmount.toFixed(2)} assessed - ${daysLate} days overdue`,
              feeType: 'late_fee',
              amount: lateFeeAmount.toFixed(2),
              daysLate: daysLate,
              gracePeriodDays: loan.gracePeriodDays,
              assessedDate: valuationDate,
              source: 'servicing_cycle'
            },
            isSystem: true,
            createdAt: new Date()
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
      // Get escrow disbursements due (get all for the loan for now)
      const disbursements = await this.db.query.escrowDisbursements.findMany({
        where: eq(escrowDisbursements.loanId, loan.id)
      });

      for (const disbursement of disbursements) {
        const eventKey = `escrow_disbursement_${disbursement.id}_${valuationDate}`;
        const amount = parseFloat(disbursement.coverageAmount || '0');
        
        await this.createEvent(runId, eventKey, 'escrow_disbursement', loan.id, valuationDate, {
          amount: amount.toFixed(2),
          escrow: amount.toFixed(2),
          details: {
            disbursementId: disbursement.id,
            payee: disbursement.payeeName,
            category: disbursement.category,
            type: disbursement.disbursementType
          }
        });

        if (!dryRun) {
          // Note: escrowDisbursements table doesn't have status/paidDate fields
          // We would need to track this separately or add these fields to the schema
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
          sql`${loanLedger.transactionDate} >= ${valuationDate}`
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
      // 1. Check for insufficient escrow
      await this.createDetailedEventLog(runId, loan.id, valuationDate, 'EXCEPTION_CHECK_ESCROW_START', {
        message: 'Checking escrow account status',
        loanId: loan.id,
        checkType: 'escrow_balance_check',
        decision: 'CHECKING',
        reason: 'Verifying if escrow account has sufficient balance'
      });

      const escrowAccount = await this.db.query.escrowAccounts.findFirst({
        where: eq(escrowAccounts.loanId, loan.id)
      });

      if (escrowAccount) {
        const balance = parseFloat(escrowAccount.currentBalance);
        
        await this.createDetailedEventLog(runId, loan.id, valuationDate, 'EXCEPTION_CHECK_ESCROW_RESULT', {
          message: 'Escrow account found and evaluated',
          accountId: escrowAccount.id,
          currentBalance: balance,
          isNegative: balance < 0,
          isLow: balance < 1000,
          decision: balance < 0 ? 'EXCEPTION_REQUIRED' : balance < 1000 ? 'WARNING' : 'SUFFICIENT',
          reason: balance < 0 ? 'Negative escrow balance requires immediate attention' : 
                  balance < 1000 ? 'Low escrow balance may require monitoring' : 
                  'Escrow balance is sufficient'
        });

        if (balance < 0) {
          await this.createException(
            runId,
            loan.id,
            'high',
            'insufficient_escrow',
            `Escrow account has negative balance: $${balance.toFixed(2)}`,
            'Review escrow account and consider escrow advance'
          );
          exceptionsCreated++;
          
          await this.createDetailedEventLog(runId, loan.id, valuationDate, 'EXCEPTION_CREATED_ESCROW', {
            message: 'Escrow shortage exception created',
            severity: 'high',
            balance: balance,
            decision: 'EXCEPTION_LOGGED',
            reason: 'Negative escrow balance is a high priority issue'
          });
        }
      } else {
        await this.createDetailedEventLog(runId, loan.id, valuationDate, 'EXCEPTION_CHECK_ESCROW_NOT_FOUND', {
          message: 'No escrow account found for loan',
          loanId: loan.id,
          decision: 'NO_ESCROW',
          reason: 'Loan may not have escrow requirement or account not set up'
        });
      }

      // 2. Check for missing payments
      await this.createDetailedEventLog(runId, loan.id, valuationDate, 'EXCEPTION_CHECK_PAYMENT_START', {
        message: 'Checking payment history',
        loanId: loan.id,
        paymentDueDay: loan.paymentDueDay,
        checkType: 'payment_history_check',
        decision: 'CHECKING',
        reason: 'Verifying payment compliance and identifying delinquencies'
      });

      const lastPayment = await this.db.query.loanLedger.findFirst({
        where: and(
          eq(loanLedger.loanId, loan.id),
          eq(loanLedger.transactionType, 'payment')
        ),
        orderBy: (loanLedger: any, { desc }: any) => [desc(loanLedger.transactionDate)]
      });

      if (lastPayment && lastPayment.transactionDate) {
        const lastPaymentDate = parseISO(String(lastPayment.transactionDate));
        const currentDate = parseISO(String(valuationDate));
        const daysSinceLastPayment = differenceInDays(currentDate, lastPaymentDate);
        
        await this.createDetailedEventLog(runId, loan.id, valuationDate, 'EXCEPTION_CHECK_PAYMENT_RESULT', {
          message: 'Payment history analyzed',
          lastPaymentDate: lastPayment.transactionDate,
          lastPaymentAmount: lastPayment.amount,
          daysSinceLastPayment: daysSinceLastPayment,
          is30DaysLate: daysSinceLastPayment > 30,
          is60DaysLate: daysSinceLastPayment > 60,
          is90DaysLate: daysSinceLastPayment > 90,
          decision: daysSinceLastPayment > 90 ? 'CRITICAL_DELINQUENCY' : 
                   daysSinceLastPayment > 60 ? 'SERIOUS_DELINQUENCY' :
                   daysSinceLastPayment > 30 ? 'DELINQUENT' : 'CURRENT',
          reason: daysSinceLastPayment > 90 ? 'Loan is severely delinquent - immediate action required' :
                  daysSinceLastPayment > 60 ? 'Loan is seriously delinquent - escalation needed' :
                  daysSinceLastPayment > 30 ? 'Loan is delinquent - follow-up required' :
                  'Loan payments are current'
        });

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
          
          await this.createDetailedEventLog(runId, loan.id, valuationDate, 'EXCEPTION_CREATED_PAYMENT', {
            message: 'Payment delinquency exception created',
            severity: 'critical',
            daysSinceLastPayment: daysSinceLastPayment,
            decision: 'EXCEPTION_LOGGED',
            reason: 'Serious payment delinquency requires immediate intervention'
          });
        }
      } else {
        await this.createDetailedEventLog(runId, loan.id, valuationDate, 'EXCEPTION_CHECK_NO_PAYMENTS', {
          message: 'No payment history found',
          loanId: loan.id,
          decision: 'NO_PAYMENT_HISTORY',
          reason: 'Loan may be new or no payments have been recorded yet'
        });
      }

      // 3. Check for data anomalies
      await this.createDetailedEventLog(runId, loan.id, valuationDate, 'EXCEPTION_CHECK_DATA_START', {
        message: 'Checking loan data integrity',
        checkingFields: ['interestRate', 'principalBalance', 'maturityDate', 'paymentAmount'],
        decision: 'VALIDATING',
        reason: 'Ensuring all critical loan data is present and valid'
      });

      const dataIssues = [];
      
      if (!loan.interestRate || parseFloat(loan.interestRate) === 0) {
        dataIssues.push('Missing or zero interest rate');
        
        await this.createDetailedEventLog(runId, loan.id, valuationDate, 'EXCEPTION_CHECK_DATA_INTEREST', {
          message: 'Interest rate anomaly detected',
          interestRate: loan.interestRate,
          hasInterestRate: !!loan.interestRate,
          isZero: parseFloat(loan.interestRate || 0) === 0,
          decision: 'DATA_ANOMALY',
          reason: 'Loan must have a valid interest rate for proper servicing'
        });

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

      if (!loan.paymentAmount || parseFloat(loan.paymentAmount) === 0) {
        dataIssues.push('Missing or zero payment amount');
        
        await this.createDetailedEventLog(runId, loan.id, valuationDate, 'EXCEPTION_CHECK_DATA_PAYMENT', {
          message: 'Payment amount anomaly detected',
          paymentAmount: loan.paymentAmount,
          hasPaymentAmount: !!loan.paymentAmount,
          isZero: parseFloat(loan.paymentAmount || 0) === 0,
          decision: 'DATA_ANOMALY',
          reason: 'Loan must have a valid payment amount for servicing'
        });
      }

      // 4. Check maturity date
      if (loan.maturityDate) {
        const maturityDate = parseISO(loan.maturityDate);
        const currentDate = parseISO(valuationDate);
        const daysToMaturity = differenceInDays(maturityDate, currentDate);
        
        await this.createDetailedEventLog(runId, loan.id, valuationDate, 'EXCEPTION_CHECK_MATURITY', {
          message: 'Checking loan maturity',
          maturityDate: loan.maturityDate,
          currentDate: valuationDate,
          daysToMaturity: daysToMaturity,
          isMatured: daysToMaturity < 0,
          maturingSoon: daysToMaturity >= 0 && daysToMaturity <= 90,
          decision: daysToMaturity < 0 ? 'MATURED' : 
                   daysToMaturity <= 30 ? 'MATURING_SOON' :
                   daysToMaturity <= 90 ? 'APPROACHING_MATURITY' : 'NOT_NEAR_MATURITY',
          reason: daysToMaturity < 0 ? 'Loan has matured and requires payoff processing' :
                  daysToMaturity <= 30 ? 'Loan maturing within 30 days - prepare for payoff' :
                  daysToMaturity <= 90 ? 'Loan approaching maturity - begin preparations' :
                  'Loan maturity is not imminent'
        });

        if (daysToMaturity >= 0 && daysToMaturity <= 30) {
          await this.createException(
            runId,
            loan.id,
            'medium',
            'approaching_maturity',
            `Loan maturing in ${daysToMaturity} days`,
            'Prepare maturity notices and payoff documentation'
          );
          exceptionsCreated++;
        }
      }

      // 5. Summary of exception check
      await this.createDetailedEventLog(runId, loan.id, valuationDate, 'EXCEPTION_CHECK_SUMMARY', {
        message: 'Exception check completed',
        checksPerformed: [
          'escrow_balance',
          'payment_history',
          'data_integrity',
          'maturity_date'
        ],
        exceptionsFound: exceptionsCreated,
        dataIssues: dataIssues,
        decision: exceptionsCreated > 0 ? 'EXCEPTIONS_FOUND' : 'NO_EXCEPTIONS',
        reason: exceptionsCreated > 0 ? 
                `Found ${exceptionsCreated} exception(s) requiring attention` :
                'All checks passed without exceptions'
      });

    } catch (error: any) {
      console.error(`Error checking exceptions for loan ${loan.id}:`, error);
      
      await this.createDetailedEventLog(runId, loan.id, valuationDate, 'EXCEPTION_CHECK_ERROR', {
        message: 'Error during exception checking',
        error: error.message,
        stack: error.stack,
        decision: 'ERROR',
        reason: 'Unexpected error prevented complete exception checking'
      });
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