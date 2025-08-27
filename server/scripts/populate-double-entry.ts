#!/usr/bin/env -S npx tsx
/**
 * Script to populate sample double-entry accounting data for demonstration
 * This shows how proper double-entry bookkeeping should work
 */

import { db } from '../db';
import { generalLedgerEvents, generalLedgerEntries, loanLedger } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

async function populateDoubleEntryData() {
  console.log('Populating double-entry accounting data...');
  
  try {
    // Get loan 25 (TEST-42) existing transactions
    const existingTransactions = await db
      .select()
      .from(loanLedger)
      .where(eq(loanLedger.loanId, 25))
      .orderBy(desc(loanLedger.transactionDate));
    
    console.log(`Found ${existingTransactions.length} existing transactions`);
    
    // Create double-entry records for each payment
    for (const txn of existingTransactions) {
      if (txn.transactionType === 'payment' && txn.debitAmount) {
        const amount = parseFloat(txn.debitAmount);
        
        console.log(`Creating double-entry for payment of $${amount}`);
        
        // Create event header
        // Ensure date is properly formatted
        const txnDate = typeof txn.transactionDate === 'string' 
          ? new Date(txn.transactionDate) 
          : txn.transactionDate;
        
        // Skip if date is invalid
        if (isNaN(txnDate.getTime())) {
          console.log(`Skipping transaction with invalid date: ${txn.transactionDate}`);
          continue;
        }
        
        const [event] = await db.insert(generalLedgerEvents).values({
          loanId: 25,
          eventType: 'payment',
          eventDate: txnDate,
          effectiveDate: txnDate,
          description: txn.description || `Payment received`,
          correlationId: txn.transactionId,
          metadata: {
            originalLedgerId: txn.id,
            notes: txn.notes
          }
        }).returning();
        
        // Create double-entry line items
        // For a payment:
        // DEBIT: Cash account (asset increases)
        // CREDIT: Loan Principal (asset/receivable decreases)
        
        // Cash entry (DEBIT)
        await db.insert(generalLedgerEntries).values({
          eventId: event.eventId,
          accountCode: 'CASH.PAYMENTS',
          accountName: 'Cash - Customer Payments',
          debitMinor: BigInt(Math.round(amount * 100)),
          creditMinor: BigInt(0),
          currency: 'USD',
          memo: 'Payment received from borrower'
        });
        
        // Determine if payment goes to principal or interest
        // For demo, let's assume 80% principal, 20% interest for amounts over $500
        const isLargePayment = amount >= 500;
        const principalAmount = isLargePayment ? amount * 0.8 : amount;
        const interestAmount = isLargePayment ? amount * 0.2 : 0;
        
        // Loan Principal entry (CREDIT)
        if (principalAmount > 0) {
          await db.insert(generalLedgerEntries).values({
            eventId: event.eventId,
            accountCode: 'LOAN.PRINCIPAL',
            accountName: 'Loan Principal Receivable',
            debitMinor: BigInt(0),
            creditMinor: BigInt(Math.round(principalAmount * 100)),
            currency: 'USD',
            memo: 'Principal payment applied'
          });
        }
        
        // Interest Income entry (CREDIT) if applicable
        if (interestAmount > 0) {
          await db.insert(generalLedgerEntries).values({
            eventId: event.eventId,
            accountCode: 'REVENUE.INTEREST',
            accountName: 'Interest Income',
            debitMinor: BigInt(0),
            creditMinor: BigInt(Math.round(interestAmount * 100)),
            currency: 'USD',
            memo: 'Interest payment received'
          });
        }
        
        console.log(`✓ Created double-entry for payment ${txn.transactionId}`);
      }
    }
    
    // Add a sample accrual entry to show more complex accounting
    console.log('Adding sample interest accrual...');
    
    const accrualDate = new Date();
    accrualDate.setDate(1); // First of month
    
    const [accrualEvent] = await db.insert(generalLedgerEvents).values({
      loanId: 25,
      eventType: 'accrual',
      eventDate: accrualDate,
      effectiveDate: accrualDate,
      description: 'Monthly interest accrual',
      correlationId: `ACCRUAL-${Date.now()}`,
      metadata: {
        accrualPeriod: accrualDate.toISOString().slice(0, 7),
        interestRate: 4.5
      }
    }).returning();
    
    // Interest accrual entries
    // DEBIT: Interest Receivable
    // CREDIT: Interest Income (accrued)
    
    const monthlyInterest = (345000 * 0.045) / 12; // Principal * Rate / 12
    
    await db.insert(generalLedgerEntries).values({
      eventId: accrualEvent.eventId,
      accountCode: 'ASSET.INTEREST_RECEIVABLE',
      accountName: 'Interest Receivable',
      debitMinor: BigInt(Math.round(monthlyInterest * 100)),
      creditMinor: BigInt(0),
      currency: 'USD',
      memo: 'Monthly interest accrual'
    });
    
    await db.insert(generalLedgerEntries).values({
      eventId: accrualEvent.eventId,
      accountCode: 'REVENUE.INTEREST_ACCRUED',
      accountName: 'Interest Income (Accrued)',
      debitMinor: BigInt(0),
      creditMinor: BigInt(Math.round(monthlyInterest * 100)),
      currency: 'USD',
      memo: 'Monthly interest earned'
    });
    
    console.log(`✓ Created interest accrual for $${monthlyInterest.toFixed(2)}`);
    
    console.log('\n✓ Double-entry accounting data populated successfully!');
    console.log('The Accounting tab should now show proper double-entry bookkeeping.');
    
  } catch (error) {
    console.error('Error populating double-entry data:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  populateDoubleEntryData()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { populateDoubleEntryData };