import { pool } from "../../server/db";
// Mock S3 storage for testing
async function putBytes(key: string, buffer: Buffer, contentType: string): Promise<string> {
  const mockS3Uri = `s3://test-bucket/${key}`;
  console.log(`[MockS3] Stored ${buffer.length} bytes at ${mockS3Uri}`);
  return mockS3Uri;
}
import { createHash } from "crypto";
import dayjs from "dayjs";

export async function generateRemittanceStatement(tenantId: string, runId: string) {
  const client = await pool.connect();
  
  try {
    // Get remittance run details
    const run = await client.query(`
      SELECT r.*, i.name as investor_name, i.delivery_type
      FROM inv_remit_runs r
      JOIN inv_investors i ON r.investor_id = i.id
      WHERE r.id = $1 AND r.tenant_id = $2
    `, [runId, tenantId]);

    if (!run.rowCount) throw new Error('Remittance run not found');
    const runData = run.rows[0];

    // Get line items
    const items = await client.query(`
      SELECT i.*, l.loan_number
      FROM inv_remit_items i
      LEFT JOIN loans l ON i.loan_id = l.id
      WHERE i.run_id = $1
      ORDER BY i.loan_id
    `, [runId]);

    // Get payout details
    const payout = await client.query(`
      SELECT * FROM inv_remit_payouts WHERE run_id = $1
    `, [runId]);

    const payoutData = payout.rows[0];

    // Calculate totals
    const totals = items.rows.reduce((acc, item) => ({
      upb_beg: acc.upb_beg + Number(item.upb_beg),
      upb_end: acc.upb_end + Number(item.upb_end),
      principal: acc.principal + Number(item.principal_collected),
      interest: acc.interest + Number(item.interest_collected),
      escrow: acc.escrow + Number(item.escrow_collected),
      fees: acc.fees + Number(item.fees_collected),
      svc_fee: acc.svc_fee + Number(item.svc_fee),
      strip_io: acc.strip_io + Number(item.strip_io),
      net_remit: acc.net_remit + Number(item.net_remit)
    }), {
      upb_beg: 0, upb_end: 0, principal: 0, interest: 0, 
      escrow: 0, fees: 0, svc_fee: 0, strip_io: 0, net_remit: 0
    });

    // Generate PDF statement
    const statementData = {
      header: process.env.REMIT_PDF_HEADER || "LoanServe • Investor Remittance Statement",
      watermark: process.env.REMIT_PDF_WATERMARK || "LoanServe",
      investor: {
        name: runData.investor_name,
        id: runData.investor_id,
        deliveryType: runData.delivery_type
      },
      period: {
        start: dayjs(runData.period_start).format('MMM DD, YYYY'),
        end: dayjs(runData.period_end).format('MMM DD, YYYY'),
        label: `${dayjs(runData.period_start).format('MMM YYYY')}`
      },
      summary: {
        loanCount: items.rowCount,
        upbBeginning: totals.upb_beg,
        upbEnding: totals.upb_end,
        principalCollected: totals.principal,
        interestCollected: totals.interest,
        escrowCollected: totals.escrow,
        feesCollected: totals.fees,
        servicingFee: totals.svc_fee,
        stripIO: totals.strip_io,
        netRemittance: totals.net_remit
      },
      loans: items.rows.map(item => ({
        loanNumber: item.loan_number,
        upbBeg: Number(item.upb_beg),
        upbEnd: Number(item.upb_end),
        principal: Number(item.principal_collected),
        interest: Number(item.interest_collected),
        escrow: Number(item.escrow_collected),
        fees: Number(item.fees_collected),
        svcFee: Number(item.svc_fee),
        stripIO: Number(item.strip_io),
        netRemit: Number(item.net_remit)
      })),
      payout: {
        amount: Number(payoutData.amount),
        method: payoutData.method,
        status: payoutData.status,
        reference: payoutData.reference
      }
    };

    const pdfBuffer = await renderRemittanceStatementPdf(statementData);
    
    // Store PDF in S3
    const hash = createHash('sha256').update(pdfBuffer).digest('hex');
    const s3Key = `${process.env.S3_PREFIX || "tenants"}/${tenantId}/${process.env.REMIT_S3_PREFIX || "remittances"}/${runData.investor_id}_${runData.period_start}_${runData.period_end}_statement.pdf`;
    const s3Uri = await putBytes(s3Key, pdfBuffer, 'application/pdf');

    return {
      statementUri: s3Uri,
      hash,
      data: statementData
    };

  } finally {
    client.release();
  }
}

async function renderRemittanceStatementPdf(data: any): Promise<Buffer> {
  const PDFDocument = await import('pdfkit');
  const doc = new PDFDocument.default();
  
  const chunks: Buffer[] = [];
  doc.on('data', chunk => chunks.push(chunk));
  
  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    
    // Header
    doc.fontSize(20).text(data.header, 50, 50);
    doc.fontSize(12).text(`Statement Period: ${data.period.start} - ${data.period.end}`, 50, 80);
    doc.text(`Generated: ${dayjs().format('MMM DD, YYYY')}`, 50, 100);
    
    // Investor info
    doc.fontSize(14).text('Investor Information:', 50, 140);
    doc.fontSize(12)
      .text(`Name: ${data.investor.name}`, 50, 160)
      .text(`ID: ${data.investor.id}`, 50, 180)
      .text(`Delivery Type: ${data.investor.deliveryType}`, 50, 200);
    
    // Summary section
    doc.fontSize(14).text('Remittance Summary:', 50, 240);
    doc.fontSize(12)
      .text(`Loan Count: ${data.summary.loanCount}`, 50, 260)
      .text(`UPB Beginning: $${Number(data.summary.upbBeginning).toFixed(2)}`, 50, 280)
      .text(`UPB Ending: $${Number(data.summary.upbEnding).toFixed(2)}`, 50, 300)
      .text(`Principal Collected: $${Number(data.summary.principalCollected).toFixed(2)}`, 50, 320)
      .text(`Interest Collected: $${Number(data.summary.interestCollected).toFixed(2)}`, 50, 340)
      .text(`Escrow Collected: $${Number(data.summary.escrowCollected).toFixed(2)}`, 50, 360)
      .text(`Fees Collected: $${Number(data.summary.feesCollected).toFixed(2)}`, 50, 380)
      .text(`Servicing Fee: ($${Number(data.summary.servicingFee).toFixed(2)})`, 50, 400)
      .text(`Strip I/O: ($${Number(data.summary.stripIO).toFixed(2)})`, 50, 420);
    
    // Net remittance (highlighted)
    doc.fontSize(14).text(`Net Remittance: $${Number(data.summary.netRemittance).toFixed(2)}`, 50, 450);
    
    // Payout info
    doc.fontSize(12).text('Payout Information:', 50, 480);
    doc.fontSize(11)
      .text(`Amount: $${Number(data.payout.amount).toFixed(2)}`, 50, 500)
      .text(`Method: ${data.payout.method}`, 50, 520)
      .text(`Status: ${data.payout.status}`, 50, 540);
    
    // Loan-level detail (if space permits)
    if (data.loans.length <= 10) {
      doc.addPage();
      doc.fontSize(14).text('Loan-Level Detail:', 50, 50);
      
      let y = 80;
      data.loans.forEach((loan: any, idx: number) => {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }
        
        doc.fontSize(11)
          .text(`${idx + 1}. ${loan.loanNumber}`, 50, y)
          .text(`Principal: $${loan.principal.toFixed(2)}`, 200, y)
          .text(`Interest: $${loan.interest.toFixed(2)}`, 300, y)
          .text(`Net: $${loan.netRemit.toFixed(2)}`, 400, y);
        
        y += 20;
      });
    }
    
    // Watermark
    doc.fontSize(60).fillColor('#E0E0E0').text(data.watermark, 200, 400, { rotate: 45 });
    
    doc.end();
  });
}