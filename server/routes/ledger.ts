import { Request, Response } from 'express';
import { db } from '../db';
import { loanLedger, loans, generalLedgerEvents, generalLedgerEntries } from '@shared/schema';
import { eq, desc, and, or } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { parse } from 'json2csv';
import PDFDocument from 'pdfkit';
import sgMail from '@sendgrid/mail';

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Get ledger entries for a loan - Now using double-entry accounting
export async function getLoanLedger(req: Request, res: Response) {
  try {
    const { loanId } = req.params;
    console.log('[Ledger] Fetching double-entry ledger for loan:', loanId);
    
    // First check if we have double-entry data, otherwise fall back to old ledger
    const events = await db
      .select({
        eventId: generalLedgerEvents.eventId,
        eventDate: generalLedgerEvents.eventDate,
        eventType: generalLedgerEvents.eventType,
        description: generalLedgerEvents.description,
        correlationId: generalLedgerEvents.correlationId,
        metadata: generalLedgerEvents.metadata,
        createdAt: generalLedgerEvents.createdAt
      })
      .from(generalLedgerEvents)
      .where(eq(generalLedgerEvents.loanId, parseInt(loanId)))
      .orderBy(desc(generalLedgerEvents.eventDate), desc(generalLedgerEvents.createdAt));
    
    if (events.length > 0) {
      // We have double-entry data - fetch all entries for these events
      const eventIds = events.map(e => e.eventId);
      const entriesData = await db
        .select()
        .from(generalLedgerEntries)
        .where(sql`${generalLedgerEntries.eventId} = ANY(${eventIds})`)
        .orderBy(generalLedgerEntries.accountCode);
      
      // Group entries by event and format for display
      const entriesByEvent = entriesData.reduce((acc: any, entry: any) => {
        if (!acc[entry.eventId]) {
          acc[entry.eventId] = [];
        }
        acc[entry.eventId].push(entry);
        return acc;
      }, {});
      
      // Format for frontend display - convert each event into ledger rows
      const formattedEntries: any[] = [];
      let runningBalance = 0;
      
      // Process events in reverse to calculate running balance correctly
      const reversedEvents = [...events].reverse();
      
      for (const event of reversedEvents) {
        const eventEntries = entriesByEvent[event.eventId] || [];
        
        // Calculate net effect on loan balance
        let netDebit = 0;
        let netCredit = 0;
        
        for (const entry of eventEntries) {
          const debitAmount = Number(entry.debitMinor) / 100;
          const creditAmount = Number(entry.creditMinor) / 100;
          
          // For loan accounting perspective:
          // Credits increase loan balance (disbursements, accruals)
          // Debits decrease loan balance (payments, write-offs)
          if (entry.accountCode.startsWith('LOAN')) {
            netDebit += debitAmount;
            netCredit += creditAmount;
          }
        }
        
        // Update running balance
        runningBalance += netCredit - netDebit;
        
        // Create ledger display entries for each line item
        for (const entry of eventEntries) {
          const debitAmount = Number(entry.debitMinor) / 100;
          const creditAmount = Number(entry.creditMinor) / 100;
          
          formattedEntries.push({
            id: entry.entryId,
            transactionDate: event.eventDate,
            transactionId: event.correlationId || `EVT-${event.eventId.slice(0, 8)}`,
            description: `${event.description} - ${entry.accountName}`,
            transactionType: event.eventType,
            category: entry.accountCode,
            debitAmount: debitAmount > 0 ? debitAmount.toFixed(2) : null,
            creditAmount: creditAmount > 0 ? creditAmount.toFixed(2) : null,
            runningBalance: runningBalance.toFixed(2),
            principalBalance: runningBalance.toFixed(2), // Simplified for now
            interestBalance: '0.00', // Would need separate tracking
            status: 'posted',
            createdAt: event.createdAt,
            accountCode: entry.accountCode,
            accountName: entry.accountName,
            memo: entry.memo
          });
        }
      }
      
      // Reverse back to show most recent first
      formattedEntries.reverse();
      
      console.log('[Ledger] Found double-entry events:', events.length, 'with entries:', formattedEntries.length);
      res.json(formattedEntries);
    } else {
      // Fallback to old single-entry ledger if no double-entry data
      console.log('[Ledger] No double-entry data found, falling back to single-entry ledger');
      const entries = await db
        .select()
        .from(loanLedger)
        .where(eq(loanLedger.loanId, parseInt(loanId)))
        .orderBy(desc(loanLedger.transactionDate), desc(loanLedger.id));
      
      console.log('[Ledger] Found single-entry entries:', entries.length);
      res.json(entries);
    }
  } catch (error) {
    console.error('Error fetching loan ledger:', error);
    res.status(500).json({ error: 'Failed to fetch ledger entries' });
  }
}

// Helper function to create double-entry accounting records
async function createDoubleEntryTransaction({
  loanId,
  eventType,
  eventDate,
  description,
  entries,
  correlationId,
  metadata
}: {
  loanId: number;
  eventType: string;
  eventDate: Date;
  description: string;
  entries: Array<{ accountCode: string; accountName: string; debit: number; credit: number; memo?: string }>;
  correlationId?: string;
  metadata?: any;
}) {
  // Create the event header
  const [event] = await db.insert(generalLedgerEvents).values({
    loanId,
    eventType,
    eventDate,
    effectiveDate: eventDate,
    description,
    correlationId: correlationId || `TXN-${Date.now()}`,
    metadata
  }).returning();
  
  // Create the double-entry line items
  // Verify debits equal credits
  let totalDebits = 0;
  let totalCredits = 0;
  
  for (const entry of entries) {
    totalDebits += entry.debit;
    totalCredits += entry.credit;
  }
  
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error(`Double-entry imbalance: Debits ${totalDebits} != Credits ${totalCredits}`);
  }
  
  // Insert all entries
  const ledgerEntries = [];
  for (const entry of entries) {
    const [ledgerEntry] = await db.insert(generalLedgerEntries).values({
      eventId: event.eventId,
      accountCode: entry.accountCode,
      accountName: entry.accountName,
      debitMinor: BigInt(Math.round(entry.debit * 100)),
      creditMinor: BigInt(Math.round(entry.credit * 100)),
      currency: 'USD',
      memo: entry.memo
    }).returning();
    ledgerEntries.push(ledgerEntry);
  }
  
  return { event, entries: ledgerEntries };
}

// Add a new ledger transaction
export async function addLedgerTransaction(req: Request, res: Response) {
  try {
    const { loanId } = req.params;
    const transaction = req.body;
    const userId = (req.user as any)?.id;
    
    console.log('Adding ledger transaction:', { loanId, transaction, userId });
    
    // Generate transaction ID
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Get the last balance
    const lastEntry = await db
      .select()
      .from(loanLedger)
      .where(eq(loanLedger.loanId, parseInt(loanId)))
      .orderBy(desc(loanLedger.transactionDate), desc(loanLedger.id))
      .limit(1);
    
    const lastBalance = lastEntry[0]?.runningBalance || '0';
    const lastPrincipalBalance = lastEntry[0]?.principalBalance || '0';
    const lastInterestBalance = lastEntry[0]?.interestBalance || '0';
    
    // Calculate new balances
    const debit = parseFloat(transaction.debitAmount || '0');
    const credit = parseFloat(transaction.creditAmount || '0');
    const newBalance = parseFloat(lastBalance) + credit - debit;
    
    // Calculate principal and interest balances based on transaction type
    let newPrincipalBalance = parseFloat(lastPrincipalBalance);
    let newInterestBalance = parseFloat(lastInterestBalance);
    
    if (transaction.transactionType === 'principal') {
      if (credit > 0) {
        newPrincipalBalance += credit; // Loan disbursement
      } else if (debit > 0) {
        newPrincipalBalance -= debit; // Principal payment
      }
    } else if (transaction.transactionType === 'interest') {
      if (credit > 0) {
        newInterestBalance += credit; // Interest accrual
      } else if (debit > 0) {
        newInterestBalance -= debit; // Interest payment
      }
    }
    
    // Check if approval is required (for reversals or large amounts)
    const approvalRequired = transaction.transactionType === 'reversal' || 
                            debit > 10000 || 
                            credit > 10000;
    
    // Create double-entry accounting records if payment type
    if (transaction.transactionType === 'payment' && (debit > 0 || credit > 0)) {
      try {
        const paymentAmount = debit > 0 ? debit : credit;
        
        // For a payment, we typically:
        // DEBIT: Cash account (asset increases)
        // CREDIT: Loan Receivable (asset decreases)
        await createDoubleEntryTransaction({
          loanId: parseInt(loanId),
          eventType: 'payment',
          eventDate: new Date(transaction.transactionDate),
          description: transaction.description || `Payment received`,
          correlationId: transactionId,
          entries: [
            {
              accountCode: 'CASH.PAYMENTS',
              accountName: 'Cash - Customer Payments',
              debit: paymentAmount,
              credit: 0,
              memo: 'Payment received from borrower'
            },
            {
              accountCode: 'LOAN.PRINCIPAL',
              accountName: 'Loan Principal Receivable',
              debit: 0,
              credit: paymentAmount,
              memo: 'Principal reduction'
            }
          ],
          metadata: {
            paymentMethod: transaction.category,
            notes: transaction.notes
          }
        });
      } catch (error) {
        console.error('Failed to create double-entry records:', error);
        // Continue with single-entry for backward compatibility
      }
    }
    
    const [newEntry] = await db.insert(loanLedger).values({
      loanId: parseInt(loanId),
      transactionDate: new Date(transaction.transactionDate),
      transactionId,
      description: transaction.description,
      transactionType: transaction.transactionType,
      category: transaction.category,
      debitAmount: transaction.debitAmount ? transaction.debitAmount.toString() : null,
      creditAmount: transaction.creditAmount ? transaction.creditAmount.toString() : null,
      runningBalance: newBalance.toFixed(2),
      principalBalance: newPrincipalBalance.toFixed(2),
      interestBalance: newInterestBalance.toFixed(2),
      status: approvalRequired ? 'pending_approval' : 'posted',
      approvalRequired,
      createdBy: userId,
      notes: transaction.notes,
      reversalOf: transaction.reversalOf,
    }).returning();
    
    console.log('Transaction added successfully:', newEntry);
    res.json(newEntry);
  } catch (error) {
    console.error('Error adding ledger transaction:', error);
    res.status(500).json({ error: 'Failed to add transaction' });
  }
}

// Approve a pending transaction
export async function approveLedgerTransaction(req: Request, res: Response) {
  try {
    const { transactionId } = req.params;
    const { approvalNotes } = req.body;
    const userId = (req.user as any)?.id;
    
    // First get the transaction to check its current status
    const [transaction] = await db
      .select()
      .from(loanLedger)
      .where(eq(loanLedger.id, parseInt(transactionId)))
      .limit(1);
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    if (transaction.status !== 'pending_approval') {
      return res.status(400).json({ error: 'Transaction is not pending approval' });
    }
    
    // Update the transaction status to posted
    const [updated] = await db
      .update(loanLedger)
      .set({
        status: 'posted',
        approvedBy: userId,
        approvalDate: new Date(),
        approvalNotes,
        updatedAt: new Date(),
      })
      .where(eq(loanLedger.id, parseInt(transactionId)))
      .returning();
    
    res.json(updated);
  } catch (error) {
    console.error('Error approving transaction:', error);
    res.status(500).json({ error: 'Failed to approve transaction' });
  }
}

// Export ledger to CSV
export async function exportLedgerToCSV(req: Request, res: Response) {
  try {
    const { loanId } = req.params;
    
    const entries = await db
      .select()
      .from(loanLedger)
      .where(eq(loanLedger.loanId, parseInt(loanId)))
      .orderBy(desc(loanLedger.transactionDate), desc(loanLedger.id));
    
    // Format data for CSV export with proper date formatting and number formatting
    const formattedEntries = entries.map(entry => ({
      transactionDate: new Date(entry.transactionDate).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit' 
      }),
      transactionId: entry.transactionId,
      description: entry.description,
      transactionType: entry.transactionType,
      debitAmount: entry.debitAmount ? parseFloat(entry.debitAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
      creditAmount: entry.creditAmount ? parseFloat(entry.creditAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
      runningBalance: parseFloat(entry.runningBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      principalBalance: parseFloat(entry.principalBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      status: entry.status
    }));
    
    const fields = [
      'transactionDate',
      'transactionId',
      'description',
      'transactionType',
      'debitAmount',
      'creditAmount',
      'runningBalance',
      'principalBalance',
      'status'
    ];
    
    const csv = parse(formattedEntries, { fields });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="loan-${loanId}-ledger.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting ledger:', error);
    res.status(500).json({ error: 'Failed to export ledger' });
  }
}

// Export ledger to PDF
export async function exportLedgerToPDF(req: Request, res: Response) {
  try {
    const { loanId } = req.params;
    
    const entries = await db
      .select()
      .from(loanLedger)
      .where(eq(loanLedger.loanId, parseInt(loanId)))
      .orderBy(desc(loanLedger.transactionDate), desc(loanLedger.id));
    
    const loanData = await db
      .select()
      .from(loans)
      .where(eq(loans.id, parseInt(loanId)))
      .limit(1);
    
    const doc = new PDFDocument();
    const buffers: Buffer[] = [];
    
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="loan-${loanId}-ledger.pdf"`);
      res.send(pdfData);
    });
    
    // Add PDF content
    doc.fontSize(20).text('Loan Ledger Report', { align: 'center' });
    doc.fontSize(12).text(`Loan Number: ${loanData[0]?.loanNumber || 'N/A'}`, { align: 'center' });
    doc.moveDown();
    
    // Add table headers
    doc.fontSize(10);
    doc.text('Date | Transaction | Description | Debit | Credit | Balance', { underline: true });
    doc.moveDown();
    
    // Add entries
    entries.forEach(entry => {
      const date = new Date(entry.transactionDate).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit' 
      });
      const debit = entry.debitAmount ? parseFloat(entry.debitAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
      const credit = entry.creditAmount ? parseFloat(entry.creditAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
      const balance = parseFloat(entry.runningBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      doc.text(`${date} | ${entry.transactionId} | ${entry.description} | ${debit} | ${credit} | ${balance}`);
    });
    
    doc.end();
  } catch (error) {
    console.error('Error exporting ledger to PDF:', error);
    res.status(500).json({ error: 'Failed to export ledger' });
  }
}

// Email ledger to contact
export async function emailLedger(req: Request, res: Response) {
  try {
    const { loanId } = req.params;
    const { recipientEmail, recipientName, format } = req.body;
    
    if (!process.env.SENDGRID_API_KEY) {
      return res.status(400).json({ error: 'Email service not configured' });
    }
    
    const entries = await db
      .select()
      .from(loanLedger)
      .where(eq(loanLedger.loanId, parseInt(loanId)))
      .orderBy(desc(loanLedger.transactionDate), desc(loanLedger.id));
    
    const loanData = await db
      .select()
      .from(loans)
      .where(eq(loans.id, parseInt(loanId)))
      .limit(1);
    
    let attachment;
    let filename;
    
    if (format === 'csv') {
      const fields = [
        'transactionDate',
        'transactionId',
        'description',
        'transactionType',
        'debitAmount',
        'creditAmount',
        'runningBalance',
        'principalBalance',
        'status'
      ];
      
      const csv = parse(entries, { fields });
      attachment = Buffer.from(csv).toString('base64');
      filename = `loan-${loanId}-ledger.csv`;
    } else {
      // Default to PDF
      const doc = new PDFDocument();
      const buffers: Buffer[] = [];
      
      doc.on('data', buffers.push.bind(buffers));
      
      // Create PDF content
      doc.fontSize(20).text('Loan Ledger Report', { align: 'center' });
      doc.fontSize(12).text(`Loan Number: ${loanData[0]?.loanNumber || 'N/A'}`, { align: 'center' });
      doc.moveDown();
      
      entries.forEach(entry => {
        const date = new Date(entry.transactionDate).toLocaleDateString();
        doc.fontSize(10).text(`${date} - ${entry.description}: Debit: ${entry.debitAmount || '-'}, Credit: ${entry.creditAmount || '-'}, Balance: ${entry.runningBalance}`);
      });
      
      doc.end();
      
      await new Promise(resolve => doc.on('end', resolve));
      attachment = Buffer.concat(buffers).toString('base64');
      filename = `loan-${loanId}-ledger.pdf`;
    }
    
    const msg = {
      to: recipientEmail,
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@loanservepro.com',
      subject: `Loan Ledger Report - ${loanData[0]?.loanNumber || 'Loan #' + loanId}`,
      text: `Dear ${recipientName},\n\nPlease find attached the loan ledger report for loan ${loanData[0]?.loanNumber || '#' + loanId}.\n\nBest regards,\nLoanServe Pro`,
      html: `<p>Dear ${recipientName},</p><p>Please find attached the loan ledger report for loan ${loanData[0]?.loanNumber || '#' + loanId}.</p><p>Best regards,<br>LoanServe Pro</p>`,
      attachments: [
        {
          content: attachment,
          filename: filename,
          type: format === 'csv' ? 'text/csv' : 'application/pdf',
          disposition: 'attachment'
        }
      ]
    };
    
    await sgMail.send(msg);
    res.json({ success: true, message: 'Ledger report sent successfully' });
  } catch (error) {
    console.error('Error emailing ledger:', error);
    res.status(500).json({ error: 'Failed to email ledger report' });
  }
}

// Middleware to check authentication
function isAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}

// Register routes
export function registerLedgerRoutes(app: any) {
  app.get('/api/loans/:loanId/ledger', isAuthenticated, getLoanLedger);
  app.post('/api/loans/:loanId/ledger', isAuthenticated, addLedgerTransaction);
  app.post('/api/ledger/:transactionId/approve', isAuthenticated, approveLedgerTransaction);
  app.get('/api/loans/:loanId/ledger/export/csv', isAuthenticated, exportLedgerToCSV);
  app.get('/api/loans/:loanId/ledger/export/pdf', isAuthenticated, exportLedgerToPDF);
  app.post('/api/loans/:loanId/ledger/email', isAuthenticated, emailLedger);
  // Also register without /api prefix for the frontend calls
  app.get('/api/ledger/:transactionId/approve', isAuthenticated, (req: any, res: any) => {
    res.json({ message: 'Use POST method for approval' });
  });
}