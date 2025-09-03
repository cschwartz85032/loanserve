/**
 * HTTP utilities for vendor integrations with retry logic and timeout handling
 * Used by UCDP/SSR, Flood, Title, and HOI adapters
 */

interface VendorCallOptions {
  base: string;
  path: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: any;
  timeoutMs: number;
  retries: number;
}

interface VendorResponse {
  json: any;
  status: number;
  latency: number;
}

/**
 * Make HTTP call to vendor with retries and timeout handling
 */
export async function callVendor(opts: VendorCallOptions): Promise<VendorResponse> {
  const url = `${opts.base}${opts.path}`;
  const method = opts.method || 'GET';
  const init: any = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    },
    signal: AbortSignal.timeout(opts.timeoutMs)
  };

  if (method === 'POST' && opts.body) {
    init.body = JSON.stringify(opts.body);
  }

  let lastErr: any;
  
  for (let i = 0; i <= opts.retries; i++) {
    const t0 = Date.now();
    
    try {
      const res = await fetch(url, init);
      const latency = Date.now() - t0;
      const text = await res.text();
      const json = safeJson(text);
      
      if (!res.ok) {
        throw new Error(`${res.status} ${text?.slice(0, 200)}`);
      }
      
      return { json, status: res.status, latency };
    } catch (e: any) {
      lastErr = e;
      
      // Wait before retry (exponential backoff)
      if (i < opts.retries) {
        await new Promise(r => setTimeout(r, 300 * (i + 1)));
      }
    }
  }
  
  throw lastErr;
}

/**
 * Safely parse JSON, returning parsed object or raw text
 */
function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return { raw: s };
  }
}