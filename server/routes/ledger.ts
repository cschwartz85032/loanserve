import { Request, Response } from 'express';
import { db } from '../db';
import { loanLedger, loans } from '@shared/schema';
import { eq, desc, and, or } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { parse } from 'json2csv';
import PDFDocument from 'pdfkit';
import sgMail from '@sendgrid/mail';

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Get ledger entries for a loan
export async function getLoanLedger(req: Request, res: Response) {
  try {
    const { loanId } = req.params;
    
    const entries = await db
      .select()
      .from(loanLedger)
      .where(eq(loanLedger.loanId, parseInt(loanId)))
      .orderBy(loanLedger.transactionDate, loanLedger.id);
    
    res.json(entries);
  } catch (error) {
    console.error('Error fetching loan ledger:', error);
    res.status(500).json({ error: 'Failed to fetch ledger entries' });
  }
}

// Add a new ledger transaction
export async function addLedgerTransaction(req: Request, res: Response) {
  try {
    const { loanId } = req.params;
    const transaction = req.body;
    const userId = (req.user as any)?.id;
    
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
    
    const [updated] = await db
      .update(loanLedger)
      .set({
        status: 'posted',
        approvedBy: userId,
        approvalDate: new Date(),
        approvalNotes,
        updatedAt: new Date(),
      })
      .where(and(
        eq(loanLedger.id, parseInt(transactionId)),
        eq(loanLedger.status, 'pending_approval')
      ))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: 'Transaction not found or already approved' });
    }
    
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
      .orderBy(loanLedger.transactionDate, loanLedger.id);
    
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
      .orderBy(loanLedger.transactionDate, loanLedger.id);
    
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
      const date = new Date(entry.transactionDate).toLocaleDateString();
      const debit = entry.debitAmount || '-';
      const credit = entry.creditAmount || '-';
      const balance = entry.runningBalance;
      
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
      .orderBy(loanLedger.transactionDate, loanLedger.id);
    
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
}