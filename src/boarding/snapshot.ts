// Boarding Snapshot: Create immutable snapshots for audit/compliance

import { createHash } from "crypto";
import { createBoardingSnapshot, loadCanonicalWithEvidence } from "../repo/exports";

/**
 * Create a boarding snapshot for a loan
 * This creates an immutable hash of the canonical datapoints for audit purposes
 */
export async function createSnapshotForLoan(tenantId: string, loanId: string) {
  try {
    console.log(`[BoardingSnapshot] Creating snapshot for loan ${loanId}`);
    
    // Load canonical datapoints and evidence
    const { canonical, evidence } = await loadCanonicalWithEvidence(tenantId, loanId);
    
    // Create deterministic snapshot by sorting keys and creating hash
    const sortedKeys = Object.keys(canonical).sort();
    const snapshotData = sortedKeys.map(key => ({
      key,
      value: canonical[key],
      normalized_value: canonical[key], // In production, this might be different
      evidence_hash: evidence[key]?.evidence_text_hash
    }));
    
    // Create SHA-256 hash of the snapshot data
    const snapshotJson = JSON.stringify(snapshotData);
    const snapshotHash = createHash("sha256").update(snapshotJson).digest("hex");
    
    // Store snapshot in database
    await createBoardingSnapshot(tenantId, loanId, snapshotHash);
    
    console.log(`[BoardingSnapshot] Created snapshot ${snapshotHash} for loan ${loanId}`);
    
    return {
      snapshotHash,
      datapoints: snapshotData.length,
      timestamp: new Date().toISOString()
    };
  } catch (error: any) {
    console.error(`[BoardingSnapshot] Failed to create snapshot for loan ${loanId}:`, error);
    throw error;
  }
}

/**
 * Create snapshot when loan is finalized or before first export
 */
export async function ensureSnapshotExists(tenantId: string, loanId: string) {
  try {
    // In production, check if snapshot already exists
    // For now, always create a new one
    return await createSnapshotForLoan(tenantId, loanId);
  } catch (error: any) {
    console.error(`[BoardingSnapshot] Failed to ensure snapshot exists for loan ${loanId}:`, error);
    throw error;
  }
}