import PDFDocument from "pdfkit";

export function renderCertificatePdf(input: {
  header: string;
  watermark: string;
  loan: any;
  canonical: any;
  stats: { passed: number; total: number };
  hashes: { docset: string; canonical: string };
  waivers: any[];
  issued_by: string;
}) {
  const doc = new PDFDocument({ size: "LETTER", margin: 50 });
  const buffers: Buffer[] = [];
  doc.on("data", (b) => buffers.push(b));
  doc.on("pageAdded", () => addWatermark(doc, input.watermark));

  // Header
  doc.fontSize(18).text(input.header, { align: "center" }).moveDown(0.5);
  // Watermark first page
  addWatermark(doc, input.watermark);

  // Basic info
  doc.fontSize(12);
  doc.text(`Loan Number: ${input.loan?.LoanNumber || "(unknown)"}`);
  doc.text(`Borrower: ${input.canonical.BorrowerFullName || "(unknown)"}`);
  doc.text(`Property: ${[
    input.canonical.PropertyStreet,
    input.canonical.PropertyCity,
    input.canonical.PropertyState,
    input.canonical.PropertyZip
  ].filter(Boolean).join(", ") || "(unknown)"}`);
  doc.moveDown(0.5);
  doc.text(`Note Amount: ${input.canonical.NoteAmount ?? "(unknown)"}`);
  doc.text(`Interest Rate: ${input.canonical.InterestRate ?? "(unknown)"}%`);
  doc.text(`Term (months): ${input.canonical.AmortTermMonths ?? "(unknown)"}`);
  doc.moveDown();

  // QC Stats
  doc.fontSize(14).text("QC Result Summary", { underline: true }).moveDown(0.3);
  doc.fontSize(12).text(`Rules Passed: ${input.stats.passed} / ${input.stats.total}`);
  doc.text(`Issued By: ${input.issued_by}`);
  doc.moveDown(0.5);

  // Hashes
  doc.fontSize(10).text(`Docset SHA-256: ${input.hashes.docset}`);
  doc.text(`Canonical SHA-256: ${input.hashes.canonical}`);
  doc.moveDown(0.5);

  // Waivers
  if (input.waivers?.length) {
    doc.fontSize(12).text("Waivers", { underline: true }).moveDown(0.2);
    input.waivers.forEach((w: any, i: number) => {
      doc.fontSize(10).text(`${i + 1}. ${w.code} — ${w.name} [${w.severity}]`);
      doc.text(`   Message: ${w.message}`);
      if (w.resolved_at) doc.text(`   Waived at: ${new Date(w.resolved_at).toISOString()}`);
      doc.moveDown(0.2);
    });
  }

  doc.end();
  return new Promise<Uint8Array>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });
}

export function renderDiscrepancyPdf(input: {
  header: string;
  loan: any;
  openDefects: any[];
  conflicts: any[];
  summaryText: string;
}) {
  const doc = new PDFDocument({ size: "LETTER", margin: 50 });
  const buffers: Buffer[] = [];
  doc.on("data", (b) => buffers.push(b));

  doc.fontSize(18).text(input.header, { align: "center" }).moveDown(0.5);
  doc.fontSize(12).text(`Loan Number: ${input.loan?.LoanNumber || "(unknown)"}`);
  doc.text(`Property: ${input.loan?.PropertyStreet || ""} ${input.loan?.PropertyCity || ""} ${input.loan?.PropertyState || ""} ${input.loan?.PropertyZip || ""}`);
  doc.moveDown();

  doc.fontSize(14).text("Summary", { underline: true }).moveDown(0.2);
  doc.fontSize(11).text(input.summaryText || "(No summary)").moveDown(0.5);

  doc.fontSize(14).text("Open QC Defects", { underline: true }).moveDown(0.2);
  if (input.openDefects.length === 0) {
    doc.text("None").moveDown(0.5);
  } else {
    input.openDefects.forEach((d: any, i: number) => {
      doc.fontSize(11).text(`${i + 1}. ${d.code} • ${d.severity} • ${d.name}`);
      doc.fontSize(10).text(`   ${d.message}`).moveDown(0.2);
    });
  }

  doc.fontSize(14).text("Unresolved Conflicts", { underline: true }).moveDown(0.2);
  if (input.conflicts.length === 0) {
    doc.text("None");
  } else {
    input.conflicts.forEach((c: any, i: number) => {
      doc.fontSize(11).text(`${i + 1}. ${c.key}`);
      doc.fontSize(10).text(`   Candidates: ${JSON.stringify(c.candidates).slice(0, 400)}...`).moveDown(0.2);
    });
  }

  doc.end();
  return new Promise<Uint8Array>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });
}

function addWatermark(doc: PDFKit.PDFDocument, text: string) {
  if (!text) return;
  const { width, height } = doc.page;
  doc.save();
  doc.fillColor("#cccccc");
  doc.fontSize(48);
  doc.rotate(-30, { origin: [width / 2, height / 2] });
  doc.opacity(0.2).text(text, width / 2 - 200, height / 2 - 50);
  doc.opacity(1).rotate(30, { origin: [width / 2, height / 2] });
  doc.restore();
}