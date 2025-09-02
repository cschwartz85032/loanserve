import PDFDocument from "pdfkit";
import { sha256Buf } from "../utils/hash";

export async function renderStatementPdf(input: {
  header: string;
  watermark: string;
  account: any;
  schedule: any[];
  asOf: string;
  priorBalance: number;
  currentDue: {
    principal: number;
    interest: number;
    escrow: number;
    fees: number;
    total: number;
  };
  delinquency: {
    dpd: number;
    bucket: string;
  };
  escrow: {
    buckets: Record<string, number>;
    balance: number;
    shortage: number;
  };
  remitTo: {
    email: string;
    phone: string;
    address: string;
  };
}) {
  const doc = new PDFDocument({ size: "LETTER", margin: 50 });
  const buffers: Buffer[] = [];
  doc.on("data", (b) => buffers.push(b));

  // Header & watermark
  doc.fontSize(18).text(input.header, { align: "center" }).moveDown(0.5);
  addWatermark(doc, input.watermark);

  // Account header
  doc.fontSize(12);
  doc.text(`Statement Date: ${input.asOf}`);
  doc.text(`Loan ID: ${input.account.loan_id}`);
  doc.text(`Status: ${input.account.state}`);
  doc.text(`Due (next): ${input.schedule[0]?.due_date || "(n/a)"}`).moveDown(0.5);

  // Amounts
  doc.fontSize(14).text("Amount Due", { underline: true }).moveDown(0.2);
  const d = input.currentDue;
  doc.fontSize(12).text(
    `Principal: $${fmt(d.principal)}   Interest: $${fmt(d.interest)}   Escrow: $${fmt(d.escrow)}   Fees: $${fmt(d.fees)}`
  );
  doc.fontSize(14).text(`Total Due: $${fmt(d.total)}`).moveDown(0.5);

  // Delinquency
  doc.fontSize(12).text(`Days Past Due: ${input.delinquency.dpd} (bucket ${input.delinquency.bucket})`).moveDown(0.5);

  // Escrow
  doc.fontSize(14).text("Escrow", { underline: true }).moveDown(0.2);
  doc.fontSize(12).text(`Balance: $${fmt(input.escrow.balance)}   Shortage: $${fmt(input.escrow.shortage)}`);
  const eb = input.escrow.buckets;
  doc.text(
    `Monthly Accruals — TAX: $${fmt(eb.TAX || 0)} HOI: $${fmt(eb.HOI || 0)} FLOOD: $${fmt(eb.FLOOD || 0)} HOA: $${fmt(eb.HOA || 0)}`
  ).moveDown(0.5);

  // Schedule teaser (3 rows)
  doc.fontSize(14).text("Upcoming Schedule", { underline: true }).moveDown(0.2);
  doc.fontSize(12);
  input.schedule.slice(0, 3).forEach(r => {
    doc.text(
      `${r.installment_no}. ${r.due_date}  P: $${fmt(r.principal_due)}  I: $${fmt(r.interest_due)}  Esc: $${fmt(r.escrow_due)}  Total: $${fmt(r.total_due)}`
    );
  });
  doc.moveDown(0.5);

  // Remittance box
  doc.fontSize(14).text("How to Pay", { underline: true }).moveDown(0.2);
  doc.fontSize(12).text(`Email: ${input.remitTo.email}  Phone: ${input.remitTo.phone}`);
  doc.text(`Mail: ${input.remitTo.address}`);

  doc.end();
  const pdf = await new Promise<Buffer>((resolve) => 
    doc.on("end", () => resolve(Buffer.concat(buffers)))
  );
  
  return { pdf, sha256: sha256Buf(pdf) };
}

function addWatermark(doc: PDFKit.PDFDocument, text: string) {
  if (!text) return;
  const { width, height } = doc.page;
  doc.save()
    .fillColor("#dddddd")
    .fontSize(40)
    .rotate(-30, { origin: [width / 2, height / 2] })
    .opacity(0.2)
    .text(text, width / 2 - 200, height / 2 - 50)
    .opacity(1)
    .rotate(30, { origin: [width / 2, height / 2] })
    .restore();
}

function fmt(n: number): string {
  return n.toFixed(2);
}