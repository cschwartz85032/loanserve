import { pool } from "../../server/db";
import { loadCanonicalAndDocs, loadQcSnapshot } from "../repo/canonical";
import { renderCertificatePdf, renderDiscrepancyPdf } from "../utils/pdf";
import { sha256Buf, sha256Json } from "../utils/hash";
// import { putBytes } from "../utils/storage"; // Commented out for demo - requires S3 configuration
import { summarizeDiscrepancies } from "../discrepancy/summary";

export async function finalizeLoan(loanId: number, userId: number) {
  try {
    // 0) Check if loan exists and is not already finalized
    const loanResult = await pool.query(`SELECT state FROM loans WHERE id = $1`, [loanId]);
    if (loanResult.rows.length === 0) {
      throw new Error("Loan not found");
    }
    if (loanResult.rows[0].state === 'finalized') {
      throw new Error("Loan already finalized");
    }

    // 1) Load canonical + docs + QC snapshot
    const { canonical, evidence, docs } = await loadCanonicalAndDocs(loanId);
    const qc = await loadQcSnapshot(loanId);

    // 2) Mock conflicts for now (until conflict resolution system is integrated)
    const conflicts = { rows: [] };
    const openDefects = qc.open.rows;
    const summaryText = await summarizeDiscrepancies({
      openDefects: openDefects.map(d => ({ code: d.code, name: d.name, severity: d.severity, message: d.message })),
      conflicts: conflicts.rows
    });

    // 3) Calculate hashes
    const docsetHash = sha256Json(docs);
    const canonicalHash = sha256Json(canonical);

    // 4) QC stats
    const totalRules = qc.rules.rowCount || 0;
    const openDefectCount = openDefects.length;
    const passedRules = Math.max(0, totalRules - openDefectCount);

    // 5) Generate QC Certificate PDF
    const certPdfData = await renderCertificatePdf({
      header: process.env.CERT_PDF_HEADER || "LoanServe • QC Certificate",
      watermark: process.env.CERT_PDF_WATERMARK || "LoanServe • DO NOT ALTER",
      loan: canonical,
      canonical,
      stats: { passed: passedRules, total: totalRules },
      hashes: { docset: docsetHash, canonical: canonicalHash },
      waivers: qc.waived.rows,
      issued_by: process.env.CERT_ISSUER_NAME || "LoanServe QC Engine"
    });

    // 6) Generate Discrepancy Report PDF
    const drPdfData = await renderDiscrepancyPdf({
      header: "Loan Discrepancy Report",
      loan: canonical,
      openDefects,
      conflicts: conflicts.rows,
      summaryText
    });

    // 7) Store PDFs to S3
    const version = process.env.FINALIZE_VERSION || "v2025.09.03";
    const certKey = `${process.env.CERT_S3_PREFIX || 'certificates'}/${loanId}/qc-cert-${version}.pdf`;
    const drKey = `${process.env.DR_S3_PREFIX || 'discrepancy-reports'}/${loanId}/discrepancy-report.pdf`;

    // For demo purposes, mock the storage URIs
    const certUri = `file:///finalize/${certKey}`;
    const drUri = `file:///finalize/${drKey}`;
    
    // In production, these would be uploaded to S3:
    // const certUri = await putBytes("loanserve-documents", certKey, certPdfData);
    // const drUri = await putBytes("loanserve-documents", drKey, drPdfData);

    // 8) Store certificate record
    await pool.query(`
      INSERT INTO qc_certificates (
        loan_id, version, file_uri, file_sha256, 
        docset_sha256, canonical_sha256, rules_passed, rules_total, 
        waivers, issued_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      loanId, version, certUri, sha256Buf(certPdfData),
      docsetHash, canonicalHash, passedRules, totalRules,
      JSON.stringify(qc.waived.rows), 
      process.env.CERT_ISSUER_EMAIL || "qc@loanserve.io"
    ]);

    // 9) Store discrepancy report
    await pool.query(`
      INSERT INTO discrepancy_reports (loan_id, file_uri, file_sha256, summary)
      VALUES ($1, $2, $3, $4)
    `, [
      loanId, drUri, sha256Buf(drPdfData),
      JSON.stringify({
        openDefectCount: openDefects.length,
        conflictCount: conflicts.rows.length,
        summaryText,
        generatedAt: new Date().toISOString()
      })
    ]);

    // 10) Update loan state to finalized
    await pool.query(`
      UPDATE loans 
      SET state = 'finalized', finalized_at = now(), finalized_by = $2
      WHERE id = $1
    `, [loanId, userId]);

    console.log(`[Finalize] Loan ${loanId} finalized with certificate ${certUri}`);

    return {
      success: true,
      certificateUri: certUri,
      discrepancyReportUri: drUri,
      stats: {
        rulesPassedTotal: `${passedRules}/${totalRules}`,
        openDefects: openDefects.length,
        conflicts: conflicts.rowCount || 0
      },
      hashes: {
        docset: docsetHash,
        canonical: canonicalHash
      }
    };

  } catch (error) {
    console.error('[Finalize] Error finalizing loan:', error);
    throw error;
  }
}

/**
 * Check if a loan can be finalized
 */
export async function canFinalizeLoan(loanId: number): Promise<{
  canFinalize: boolean;
  reasons: string[];
}> {
  try {
    const reasons: string[] = [];

    // Check if loan exists and get current state
    const loanResult = await pool.query(`SELECT state FROM loans WHERE id = $1`, [loanId]);

    if (loanResult.rows.length === 0) {
      reasons.push("Loan not found");
    } else if (loanResult.rows[0].state === 'finalized') {
      reasons.push("Loan already finalized");
    }

    // For now, assume no critical defects (until QC system is integrated)
    // In a real system, this would check qc_defects table

    return {
      canFinalize: reasons.length === 0,
      reasons
    };

  } catch (error) {
    console.error('[Finalize] Error checking loan eligibility:', error);
    throw error;
  }
}

/**
 * Get finalization status for a loan
 */
export async function getFinalizationStatus(loanId: number) {
  try {
    // Get loan state (using raw SQL for now)
    const loanResult = await pool.query(`
      SELECT state, finalized_at, finalized_by 
      FROM loans WHERE id = $1
    `, [loanId]);

    if (loanResult.rows.length === 0) {
      throw new Error("Loan not found");
    }

    const loan = loanResult.rows[0];

    // Get certificate if exists (using raw SQL for now)
    const certResult = await pool.query(`
      SELECT version, file_uri, issued_by, issued_at, rules_passed, rules_total
      FROM qc_certificates 
      WHERE loan_id = $1 
      ORDER BY issued_at DESC LIMIT 1
    `, [loanId]);

    // Get latest discrepancy report
    const drResult = await pool.query(`
      SELECT file_uri, summary, generated_at
      FROM discrepancy_reports 
      WHERE loan_id = $1 
      ORDER BY generated_at DESC LIMIT 1
    `, [loanId]);

    return {
      state: loan.state,
      finalizedAt: loan.finalized_at,
      finalizedBy: loan.finalized_by,
      certificate: certResult.rows.length > 0 ? certResult.rows[0] : null,
      discrepancyReport: drResult.rows.length > 0 ? drResult.rows[0] : null
    };

  } catch (error) {
    console.error('[Finalize] Error getting finalization status:', error);
    throw error;
  }
}