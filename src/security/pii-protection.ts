/**
 * PII Protection and Tokenization
 * Handles encryption, tokenization, and redaction of sensitive data
 */

import { enc, dec, tokenize } from "./crypto";
import { DbContext } from "./abac";

export interface PIIBorrowerData {
  email?: string;
  phone?: string;
  ssn_last4?: string;
  dob?: string;
  full_name?: string;
}

export interface EncryptedPIIData {
  email_enc?: string;
  email_tok?: string;
  phone_enc?: string;
  phone_tok?: string;
  ssn_last4_enc?: string;
  ssn_last4_tok?: string;
  dob_enc?: string;
  full_name_enc?: string;
  full_name_tok?: string;
}

/**
 * Encrypt and tokenize PII data for storage
 */
export async function encryptPIIData(
  tenantId: string,
  loanId: string,
  data: PIIBorrowerData
): Promise<EncryptedPIIData> {
  const result: EncryptedPIIData = {};

  // Email encryption and tokenization
  if (data.email) {
    result.email_enc = await enc(tenantId, data.email, `email:${loanId}`);
    result.email_tok = tokenize(data.email.toLowerCase());
  }

  // Phone encryption and tokenization
  if (data.phone) {
    const normalizedPhone = data.phone.replace(/[^\d]/g, ""); // Remove formatting
    result.phone_enc = await enc(tenantId, normalizedPhone, `phone:${loanId}`);
    result.phone_tok = tokenize(normalizedPhone);
  }

  // SSN last 4 encryption and tokenization
  if (data.ssn_last4) {
    result.ssn_last4_enc = await enc(tenantId, data.ssn_last4, `ssn:${loanId}`);
    result.ssn_last4_tok = tokenize(data.ssn_last4);
  }

  // Date of birth encryption (no tokenization for dates)
  if (data.dob) {
    result.dob_enc = await enc(tenantId, data.dob, `dob:${loanId}`);
  }

  // Full name encryption and tokenization
  if (data.full_name) {
    result.full_name_enc = await enc(tenantId, data.full_name, `name:${loanId}`);
    result.full_name_tok = tokenize(data.full_name.toLowerCase());
  }

  return result;
}

/**
 * Decrypt PII data for authorized access
 */
export async function decryptPIIData(
  tenantId: string,
  loanId: string,
  encryptedData: EncryptedPIIData
): Promise<PIIBorrowerData> {
  const result: PIIBorrowerData = {};

  try {
    if (encryptedData.email_enc) {
      result.email = await dec(tenantId, encryptedData.email_enc, `email:${loanId}`);
    }

    if (encryptedData.phone_enc) {
      result.phone = await dec(tenantId, encryptedData.phone_enc, `phone:${loanId}`);
    }

    if (encryptedData.ssn_last4_enc) {
      result.ssn_last4 = await dec(tenantId, encryptedData.ssn_last4_enc, `ssn:${loanId}`);
    }

    if (encryptedData.dob_enc) {
      result.dob = await dec(tenantId, encryptedData.dob_enc, `dob:${loanId}`);
    }

    if (encryptedData.full_name_enc) {
      result.full_name = await dec(tenantId, encryptedData.full_name_enc, `name:${loanId}`);
    }
  } catch (error) {
    console.error('[PII] Decryption error:', error);
    throw new Error('Failed to decrypt PII data');
  }

  return result;
}

/**
 * Repository layer for encrypted PII operations
 */
export class PIIRepository {
  private client: any;
  private context: DbContext;

  constructor(client: any, context: DbContext) {
    this.client = client;
    this.context = context;
  }

  /**
   * Store encrypted PII data
   */
  async upsertBorrowerPII(loanId: string, data: PIIBorrowerData): Promise<void> {
    const encryptedData = await encryptPIIData(this.context.tenantId, loanId, data);
    
    await this.client.query(`
      INSERT INTO pii_borrowers (
        tenant_id, loan_id, 
        email_enc, email_tok,
        phone_enc, phone_tok,
        ssn_last4_enc, ssn_last4_tok,
        dob_enc,
        full_name_enc, full_name_tok
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (tenant_id, loan_id)
      DO UPDATE SET
        email_enc = COALESCE($3, pii_borrowers.email_enc),
        email_tok = COALESCE($4, pii_borrowers.email_tok),
        phone_enc = COALESCE($5, pii_borrowers.phone_enc),
        phone_tok = COALESCE($6, pii_borrowers.phone_tok),
        ssn_last4_enc = COALESCE($7, pii_borrowers.ssn_last4_enc),
        ssn_last4_tok = COALESCE($8, pii_borrowers.ssn_last4_tok),
        dob_enc = COALESCE($9, pii_borrowers.dob_enc),
        full_name_enc = COALESCE($10, pii_borrowers.full_name_enc),
        full_name_tok = COALESCE($11, pii_borrowers.full_name_tok),
        updated_at = now()
    `, [
      this.context.tenantId, loanId,
      encryptedData.email_enc, encryptedData.email_tok,
      encryptedData.phone_enc, encryptedData.phone_tok,
      encryptedData.ssn_last4_enc, encryptedData.ssn_last4_tok,
      encryptedData.dob_enc,
      encryptedData.full_name_enc, encryptedData.full_name_tok
    ]);
  }

  /**
   * Retrieve and decrypt PII data
   */
  async getBorrowerPII(loanId: string): Promise<PIIBorrowerData | null> {
    const result = await this.client.query(`
      SELECT 
        email_enc, phone_enc, ssn_last4_enc, dob_enc, full_name_enc
      FROM pii_borrowers
      WHERE tenant_id = $1 AND loan_id = $2
    `, [this.context.tenantId, loanId]);

    if (result.rows.length === 0) {
      return null;
    }

    const encryptedData: EncryptedPIIData = result.rows[0];
    return await decryptPIIData(this.context.tenantId, loanId, encryptedData);
  }

  /**
   * Search by tokenized values (for lookups without revealing PII)
   */
  async findByEmailToken(emailToken: string): Promise<string[]> {
    const result = await this.client.query(`
      SELECT loan_id FROM pii_borrowers
      WHERE tenant_id = $1 AND email_tok = $2
    `, [this.context.tenantId, emailToken]);

    return result.rows.map((row: any) => row.loan_id);
  }

  async findByPhoneToken(phoneToken: string): Promise<string[]> {
    const result = await this.client.query(`
      SELECT loan_id FROM pii_borrowers
      WHERE tenant_id = $1 AND phone_tok = $2
    `, [this.context.tenantId, phoneToken]);

    return result.rows.map((row: any) => row.loan_id);
  }
}

/**
 * PII redaction for logs and metrics
 * Replaces sensitive data with [REDACTED] or partial values
 */
export function redactPII(data: any): any {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  const redacted = Array.isArray(data) ? [] : {};
  
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    
    if (lowerKey.includes('ssn') || lowerKey.includes('social')) {
      redacted[key] = '[REDACTED-SSN]';
    } else if (lowerKey.includes('email')) {
      if (typeof value === 'string' && value.includes('@')) {
        const [local, domain] = value.split('@');
        redacted[key] = `${local.charAt(0)}***@${domain}`;
      } else {
        redacted[key] = '[REDACTED-EMAIL]';
      }
    } else if (lowerKey.includes('phone') || lowerKey.includes('tel')) {
      if (typeof value === 'string' && value.length >= 4) {
        redacted[key] = `***-***-${value.slice(-4)}`;
      } else {
        redacted[key] = '[REDACTED-PHONE]';
      }
    } else if (lowerKey.includes('dob') || lowerKey.includes('birth')) {
      redacted[key] = '[REDACTED-DOB]';
    } else if (typeof value === 'object') {
      redacted[key] = redactPII(value);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}