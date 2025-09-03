/**
 * Title and Homeowner's Insurance (HOI) Verification Services
 * Provides validation of title policies and homeowner's insurance coverage
 */

import { callVendor } from "./http";
import { getCache, putCache, auditVendor } from "./cache";

/**
 * Verify title policy and ownership
 */
export async function verifyTitle(
  tenantId: string,
  loanId: string | null,
  titleFileNo: string
): Promise<any> {
  const key = `TITLE:${titleFileNo}`;
  
  // Check cache first
  const cached = await getCache(tenantId, 'TITLE', key);
  if (cached) {
    return cached;
  }

  // Make API call with retries
  const response = await callVendor({
    base: process.env.TITLE_BASE_URL!,
    path: `/verify/title/${encodeURIComponent(titleFileNo)}`,
    headers: {
      'X-API-KEY': process.env.TITLE_API_KEY!
    },
    timeoutMs: Number(process.env.TITLE_TIMEOUT_MS || 12000),
    retries: Number(process.env.VENDOR_MAX_RETRIES || 3)
  });

  // Audit the call
  await auditVendor(
    tenantId,
    loanId,
    'TITLE',
    `/verify/title/${titleFileNo}`,
    response.status,
    { titleFileNo },
    response.json,
    response.latency
  );

  // Cache the response
  await putCache(
    tenantId,
    loanId,
    'TITLE',
    key,
    response.json,
    Number(process.env.VENDOR_CACHE_TTL_MIN || 1440)
  );

  return response.json;
}

/**
 * Verify homeowner's insurance policy
 */
export async function verifyHOI(
  tenantId: string,
  loanId: string | null,
  policyNo: string
): Promise<any> {
  const key = `HOI:${policyNo}`;
  
  // Check cache first
  const cached = await getCache(tenantId, 'HOI', key);
  if (cached) {
    return cached;
  }

  // Make API call with retries
  const response = await callVendor({
    base: process.env.HOI_BASE_URL!,
    path: `/verify/hoi/${encodeURIComponent(policyNo)}`,
    headers: {
      'X-API-KEY': process.env.HOI_API_KEY!
    },
    timeoutMs: Number(process.env.HOI_TIMEOUT_MS || 12000),
    retries: Number(process.env.VENDOR_MAX_RETRIES || 3)
  });

  // Audit the call
  await auditVendor(
    tenantId,
    loanId,
    'HOI',
    `/verify/hoi/${policyNo}`,
    response.status,
    { policyNo },
    response.json,
    response.latency
  );

  // Cache the response
  await putCache(
    tenantId,
    loanId,
    'HOI',
    key,
    response.json,
    Number(process.env.VENDOR_CACHE_TTL_MIN || 1440)
  );

  return response.json;
}

/**
 * Get title insurance requirements for loan amount
 */
export async function getTitleInsuranceRequirements(
  tenantId: string,
  loanId: string,
  loanAmount: number,
  propertyValue: number
): Promise<any> {
  const key = `TITLE_REQ:${loanAmount}:${propertyValue}`;
  
  // Check cache first
  const cached = await getCache(tenantId, 'TITLE', key);
  if (cached) {
    return cached;
  }

  const response = await callVendor({
    base: process.env.TITLE_BASE_URL!,
    path: `/requirements`,
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.TITLE_API_KEY!
    },
    body: {
      loanAmount,
      propertyValue,
      requestId: `${tenantId}-${Date.now()}`
    },
    timeoutMs: Number(process.env.TITLE_TIMEOUT_MS || 12000),
    retries: Number(process.env.VENDOR_MAX_RETRIES || 3)
  });

  // Audit the call
  await auditVendor(
    tenantId,
    loanId,
    'TITLE',
    `/requirements`,
    response.status,
    { loanAmount, propertyValue },
    response.json,
    response.latency
  );

  // Cache the response
  await putCache(
    tenantId,
    loanId,
    'TITLE',
    key,
    response.json,
    Number(process.env.VENDOR_CACHE_TTL_MIN || 1440)
  );

  return response.json;
}