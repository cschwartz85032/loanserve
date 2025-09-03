/**
 * Flood Determination Service Integration
 * Provides flood zone determination and insurance requirements for properties
 */

import { callVendor } from "./http";
import { getCache, putCache, auditVendor } from "./cache";
import { createHash } from "crypto";

/**
 * Get flood determination for a property address
 */
export async function getFlood(
  tenantId: string,
  loanId: string | null,
  address: string
): Promise<any> {
  // Create hash of address for cache key
  const addressHash = createHash('sha256').update(address.toLowerCase().trim()).digest('hex').substring(0, 16);
  const key = `FLOOD:${addressHash}`;
  
  // Check cache first
  const cached = await getCache(tenantId, 'FLOOD', key);
  if (cached) {
    return cached;
  }

  // Make API call with retries
  const response = await callVendor({
    base: process.env.FLOOD_BASE_URL!,
    path: `/determine/${addressHash}`,
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.FLOOD_API_KEY!
    },
    body: {
      address: address,
      requestId: `${tenantId}-${Date.now()}`
    },
    timeoutMs: Number(process.env.FLOOD_TIMEOUT_MS || 12000),
    retries: Number(process.env.VENDOR_MAX_RETRIES || 3)
  });

  // Audit the call
  await auditVendor(
    tenantId,
    loanId,
    'FLOOD',
    `/determine/${addressHash}`,
    response.status,
    { address, addressHash },
    response.json,
    response.latency
  );

  // Cache the response
  await putCache(
    tenantId,
    loanId,
    'FLOOD',
    key,
    response.json,
    Number(process.env.VENDOR_CACHE_TTL_MIN || 1440)
  );

  return response.json;
}

/**
 * Get flood insurance requirements for a property
 */
export async function getFloodInsuranceRequirements(
  tenantId: string,
  loanId: string,
  floodZone: string,
  loanAmount: number
): Promise<any> {
  const key = `FLOOD_REQ:${floodZone}:${loanAmount}`;
  
  // Check cache first
  const cached = await getCache(tenantId, 'FLOOD', key);
  if (cached) {
    return cached;
  }

  const response = await callVendor({
    base: process.env.FLOOD_BASE_URL!,
    path: `/requirements`,
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.FLOOD_API_KEY!
    },
    body: {
      floodZone,
      loanAmount,
      requestId: `${tenantId}-${Date.now()}`
    },
    timeoutMs: Number(process.env.FLOOD_TIMEOUT_MS || 12000),
    retries: Number(process.env.VENDOR_MAX_RETRIES || 3)
  });

  // Audit the call
  await auditVendor(
    tenantId,
    loanId,
    'FLOOD',
    `/requirements`,
    response.status,
    { floodZone, loanAmount },
    response.json,
    response.latency
  );

  // Cache the response
  await putCache(
    tenantId,
    loanId,
    'FLOOD',
    key,
    response.json,
    Number(process.env.VENDOR_CACHE_TTL_MIN || 1440)
  );

  return response.json;
}