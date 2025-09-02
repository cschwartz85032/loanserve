import { pool } from "../../server/db";
import { putBytes } from "../utils/storage";
import { renderStatementPdf } from "../servicing/statementPdf";
import dayjs from "dayjs";
import crypto from "crypto";

type ReceiptInput = {
  tenantId: string;
  paymentId: string;
  loanId: number;
  allocation: any;
};

export async function createReceiptPdf({ tenantId, paymentId, loanId, allocation }: ReceiptInput) {
  const client = await pool.connect();
  
  try {
    // Get payment and loan details
    const payment = await client.query(`
      SELECT p.*, l.loan_number, l.original_amount 
      FROM pay_payments p 
      LEFT JOIN loans l ON p.loan_id = l.id 
      WHERE p.id = $1
    `, [paymentId]);

    if (!payment.rowCount) throw new Error('Payment not found');
    const pay = payment.rows[0];

    // Get borrower info
    const borrower = await client.query(`
      SELECT first_name, last_name, email 
      FROM borrowers 
      WHERE loan_id = $1 
      ORDER BY is_primary DESC 
      LIMIT 1
    `, [loanId]);

    const borrowerInfo = borrower.rows[0] || { first_name: 'Unknown', last_name: 'Borrower', email: null };

    // Generate receipt content
    const receiptData = {
      header: process.env.RCPT_PDF_HEADER || "LoanServe • Payment Receipt",
      watermark: process.env.RCPT_PDF_WATERMARK || "LoanServe",
      date: dayjs(pay.ts).format('MMMM DD, YYYY'),
      receiptNumber: `RCP-${paymentId.slice(-8).toUpperCase()}`,
      borrower: {
        name: `${borrowerInfo.first_name} ${borrowerInfo.last_name}`,
        email: borrowerInfo.email
      },
      loan: {
        number: pay.loan_number,
        originalAmount: pay.original_amount
      },
      payment: {
        amount: pay.amount,
        date: dayjs(pay.ts).format('MM/DD/YYYY'),
        reference: pay.reference || 'N/A',
        channel: pay.channel
      },
      allocation: {
        principal: allocation.alloc_principal || 0,
        interest: allocation.alloc_interest || 0,
        escrow: allocation.alloc_escrow || 0,
        fees: allocation.alloc_fees || 0,
        total: pay.amount
      }
    };

    // Generate PDF using the same engine as statements
    const pdfBuffer = await renderReceiptPdf(receiptData);
    
    // Calculate hash
    const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    
    // Store in S3
    const s3Key = `${process.env.RCPT_S3_PREFIX || 'receipts'}/${tenantId}/${loanId}/${paymentId}.pdf`;
    const s3Uri = await putBytes(s3Key, pdfBuffer, 'application/pdf');

    // Save receipt record
    const receipt = await client.query(`
      INSERT INTO pay_receipts (tenant_id, loan_id, payment_id, file_uri, file_sha256, summary)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [tenantId, loanId, paymentId, s3Uri, hash, JSON.stringify(receiptData)]);

    // Update payment with receipt ID
    await client.query(`
      UPDATE pay_payments SET receipt_id = $1 WHERE id = $2
    `, [receipt.rows[0].id, paymentId]);

    return {
      receiptId: receipt.rows[0].id,
      fileUri: s3Uri,
      hash
    };

  } finally {
    client.release();
  }
}

async function renderReceiptPdf(data: any): Promise<Buffer> {
  // Simple receipt PDF generation using similar structure to statement PDF
  // This would use the same PDF generation utilities as statements
  const PDFDocument = await import('pdfkit');
  const doc = new PDFDocument.default();
  
  const chunks: Buffer[] = [];
  doc.on('data', chunk => chunks.push(chunk));
  
  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    
    // Header
    doc.fontSize(20).text(data.header, 50, 50);
    doc.fontSize(12).text(`Receipt #${data.receiptNumber}`, 50, 80);
    doc.text(`Date: ${data.date}`, 50, 100);
    
    // Borrower info
    doc.fontSize(14).text('Payment From:', 50, 140);
    doc.fontSize(12).text(data.borrower.name, 50, 160);
    if (data.borrower.email) {
      doc.text(data.borrower.email, 50, 180);
    }
    
    // Loan info
    doc.fontSize(14).text('Loan Information:', 50, 220);
    doc.fontSize(12).text(`Loan Number: ${data.loan.number}`, 50, 240);
    
    // Payment details
    doc.fontSize(14).text('Payment Details:', 50, 280);
    doc.fontSize(12)
      .text(`Amount: $${Number(data.payment.amount).toFixed(2)}`, 50, 300)
      .text(`Date: ${data.payment.date}`, 50, 320)
      .text(`Reference: ${data.payment.reference}`, 50, 340)
      .text(`Method: ${data.payment.channel}`, 50, 360);
    
    // Allocation breakdown
    doc.fontSize(14).text('Payment Allocation:', 50, 400);
    doc.fontSize(12)
      .text(`Principal: $${Number(data.allocation.principal).toFixed(2)}`, 50, 420)
      .text(`Interest: $${Number(data.allocation.interest).toFixed(2)}`, 50, 440)
      .text(`Escrow: $${Number(data.allocation.escrow).toFixed(2)}`, 50, 460)
      .text(`Fees: $${Number(data.allocation.fees).toFixed(2)}`, 50, 480)
      .text(`Total: $${Number(data.allocation.total).toFixed(2)}`, 50, 500);
    
    // Watermark
    doc.fontSize(60).fillColor('#E0E0E0').text(data.watermark, 200, 400, { rotate: 45 });
    
    doc.end();
  });
}