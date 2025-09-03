/**
 * UCDP (Uniform Collateral Data Portal) / SSR (Submission Summary Report) Integration
 * Provides appraisal verification and submission tracking for loan QC
 */

import { callVendor } from "./http";
import { getCache, putCache, auditVendor } from "./cache";

/**
 * Get Submission Summary Report from UCDP
 */
export async function getSSR(
  tenantId: string,
  loanId: string | null,
  appraisalId: string
): Promise<any> {
  const key = `SSR:${appraisalId}`;
  
  // Check cache first
  const cached = await getCache(tenantId, 'UCDP', key);
  if (cached) {
    return cached;
  }

  // Make API call with retries
  const startTime = Date.now();
  const response = await callVendor({
    base: process.env.UCDP_BASE_URL!,
    path: `/ssr/${appraisalId}`,
    headers: {
      'Authorization': `Bearer ${process.env.UCDP_API_KEY}`
    },
    timeoutMs: Number(process.env.UCDP_TIMEOUT_MS || 15000),
    retries: Number(process.env.VENDOR_MAX_RETRIES || 3)
  });

  // Audit the call
  await auditVendor(
    tenantId,
    loanId,
    'UCDP',
    `/ssr/${appraisalId}`,
    response.status,
    { appraisalId },
    response.json,
    response.latency
  );

  // Cache the response
  await putCache(
    tenantId,
    loanId,
    'UCDP',
    key,
    response.json,
    Number(process.env.VENDOR_CACHE_TTL_MIN || 1440)
  );

  return response.json;
}

/**
 * Submit appraisal to UCDP for review
 */
export async function submitAppraisal(
  tenantId: string,
  loanId: string,
  appraisalData: any
): Promise<any> {
  const response = await callVendor({
    base: process.env.UCDP_BASE_URL!,
    path: `/submit`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.UCDP_API_KEY}`
    },
    body: appraisalData,
    timeoutMs: Number(process.env.UCDP_TIMEOUT_MS || 15000),
    retries: Number(process.env.VENDOR_MAX_RETRIES || 3)
  });

  // Audit the submission
  await auditVendor(
    tenantId,
    loanId,
    'UCDP',
    `/submit`,
    response.status,
    appraisalData,
    response.json,
    response.latency
  );

  return response.json;
}