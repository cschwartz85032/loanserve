/**
 * PII Field Encryption Service
 * Implements field-level encryption for sensitive data in PostgreSQL
 */

import * as crypto from 'crypto';

// PII fields that require encryption
export const PII_FIELDS = {
  borrowers: ['ssn', 'dateOfBirth', 'phoneNumber', 'email', 'bankAccountNumber'],
  lenders: ['taxId', 'phoneNumber', 'email', 'bankAccountNumber', 'achRoutingNumber'],
  investors: ['taxId', 'phoneNumber', 'email', 'bankAccountNumber', 'wireRoutingNumber'],
  properties: ['ownerName', 'ownerPhone', 'ownerEmail'],
  payments: ['accountNumber', 'routingNumber', 'wireReference'],
  escrow_accounts: ['accountNumber', 'routingNumber'],
  users: ['phoneNumber', 'personalEmail'],
};

/**
 * Field-level encryption service using AES-256-GCM
 */
export class PIIEncryption {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 16;
  private static readonly TAG_LENGTH = 16;
  private static readonly SALT_LENGTH = 32;
  private static readonly KEY_LENGTH = 32;
  private static readonly ITERATIONS = 100000;

  private encryptionKey: Buffer;

  constructor() {
    this.encryptionKey = this.deriveKey();
  }

  /**
   * Derive encryption key from master key
   */
  private deriveKey(): Buffer {
    const masterKey = process.env.PII_ENCRYPTION_KEY;
    if (!masterKey) {
      throw new Error('PII_ENCRYPTION_KEY not set in environment');
    }

    const salt = process.env.PII_ENCRYPTION_SALT || 'default-salt-change-in-production';
    return crypto.pbkdf2Sync(masterKey, salt, PIIEncryption.ITERATIONS, PIIEncryption.KEY_LENGTH, 'sha256');
  }

  /**
   * Encrypt PII field value
   */
  encrypt(plaintext: string | null | undefined): string | null {
    if (!plaintext) return null;

    try {
      // Generate random IV
      const iv = crypto.randomBytes(PIIEncryption.IV_LENGTH);
      
      // Create cipher
      const cipher = crypto.createCipheriv(PIIEncryption.ALGORITHM, this.encryptionKey, iv);
      
      // Encrypt data
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);
      
      // Get auth tag
      const authTag = cipher.getAuthTag();
      
      // Combine IV + authTag + encrypted data
      const combined = Buffer.concat([iv, authTag, encrypted]);
      
      // Return base64 encoded
      return combined.toString('base64');
    } catch (error) {
      console.error('[PIIEncryption] Encryption failed:', error);
      throw new Error('Failed to encrypt PII data');
    }
  }

  /**
   * Decrypt PII field value
   */
  decrypt(encryptedData: string | null | undefined): string | null {
    if (!encryptedData) return null;

    try {
      // Decode from base64
      const combined = Buffer.from(encryptedData, 'base64');
      
      // Extract components
      const iv = combined.slice(0, PIIEncryption.IV_LENGTH);
      const authTag = combined.slice(PIIEncryption.IV_LENGTH, PIIEncryption.IV_LENGTH + PIIEncryption.TAG_LENGTH);
      const encrypted = combined.slice(PIIEncryption.IV_LENGTH + PIIEncryption.TAG_LENGTH);
      
      // Create decipher
      const decipher = crypto.createDecipheriv(PIIEncryption.ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      
      // Decrypt data
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('[PIIEncryption] Decryption failed:', error);
      throw new Error('Failed to decrypt PII data');
    }
  }

  /**
   * Encrypt multiple PII fields in an object
   */
  encryptObject<T extends Record<string, any>>(
    obj: T,
    fieldsToEncrypt: string[]
  ): T {
    const encrypted = { ...obj };
    
    for (const field of fieldsToEncrypt) {
      if (field in encrypted && encrypted[field]) {
        encrypted[field] = this.encrypt(encrypted[field]);
      }
    }
    
    return encrypted;
  }

  /**
   * Decrypt multiple PII fields in an object
   */
  decryptObject<T extends Record<string, any>>(
    obj: T,
    fieldsToDecrypt: string[]
  ): T {
    const decrypted = { ...obj };
    
    for (const field of fieldsToDecrypt) {
      if (field in decrypted && decrypted[field]) {
        decrypted[field] = this.decrypt(decrypted[field]);
      }
    }
    
    return decrypted;
  }

  /**
   * Hash PII for searching (one-way)
   */
  hash(value: string): string {
    const salt = process.env.PII_HASH_SALT || 'default-hash-salt';
    return crypto
      .createHash('sha256')
      .update(value + salt)
      .digest('hex');
  }

  /**
   * Create searchable hash index for encrypted field
   */
  createSearchIndex(value: string): string {
    // Use deterministic encryption for searchability
    const salt = process.env.PII_SEARCH_SALT || 'search-salt';
    const key = crypto.pbkdf2Sync(
      this.encryptionKey,
      salt,
      1000,
      32,
      'sha256'
    );
    
    return crypto
      .createHmac('sha256', key)
      .update(value.toLowerCase())
      .digest('hex');
  }

  /**
   * Format SSN for display (masked)
   */
  static maskSSN(ssn: string | null): string {
    if (!ssn) return '***-**-****';
    const decrypted = ssn.length > 11 ? new PIIEncryption().decrypt(ssn) : ssn;
    if (!decrypted || decrypted.length < 4) return '***-**-****';
    return `***-**-${decrypted.slice(-4)}`;
  }

  /**
   * Format account number for display (masked)
   */
  static maskAccountNumber(accountNumber: string | null): string {
    if (!accountNumber) return '****';
    const decrypted = accountNumber.length > 20 ? new PIIEncryption().decrypt(accountNumber) : accountNumber;
    if (!decrypted || decrypted.length < 4) return '****';
    return `****${decrypted.slice(-4)}`;
  }

  /**
   * Format phone number for display (partially masked)
   */
  static maskPhoneNumber(phone: string | null): string {
    if (!phone) return '(***) ***-****';
    const decrypted = phone.length > 20 ? new PIIEncryption().decrypt(phone) : phone;
    if (!decrypted || decrypted.length < 4) return '(***) ***-****';
    return `(***) ***-${decrypted.slice(-4)}`;
  }
}

/**
 * Database encryption middleware
 */
export class DatabaseEncryption {
  private encryption: PIIEncryption;

  constructor() {
    this.encryption = new PIIEncryption();
  }

  /**
   * Encrypt PII fields before insert/update
   */
  beforeSave(tableName: string, data: any): any {
    const fieldsToEncrypt = PII_FIELDS[tableName as keyof typeof PII_FIELDS];
    if (!fieldsToEncrypt) return data;

    return this.encryption.encryptObject(data, fieldsToEncrypt);
  }

  /**
   * Decrypt PII fields after select
   */
  afterLoad(tableName: string, data: any): any {
    const fieldsToDecrypt = PII_FIELDS[tableName as keyof typeof PII_FIELDS];
    if (!fieldsToDecrypt) return data;

    // Handle single record
    if (!Array.isArray(data)) {
      return this.encryption.decryptObject(data, fieldsToDecrypt);
    }

    // Handle array of records
    return data.map(record => 
      this.encryption.decryptObject(record, fieldsToDecrypt)
    );
  }

  /**
   * Create encrypted search condition
   */
  createSearchCondition(field: string, value: string): string {
    const searchIndex = this.encryption.createSearchIndex(value);
    return `${field}_search_index = '${searchIndex}'`;
  }
}

/**
 * Encryption key rotation service
 */
export class EncryptionKeyRotation {
  private oldEncryption: PIIEncryption;
  private newEncryption: PIIEncryption;

  constructor(oldKey: string, newKey: string) {
    process.env.PII_ENCRYPTION_KEY = oldKey;
    this.oldEncryption = new PIIEncryption();
    
    process.env.PII_ENCRYPTION_KEY = newKey;
    this.newEncryption = new PIIEncryption();
  }

  /**
   * Re-encrypt a field with new key
   */
  rotateField(encryptedValue: string): string {
    const decrypted = this.oldEncryption.decrypt(encryptedValue);
    if (!decrypted) return encryptedValue;
    return this.newEncryption.encrypt(decrypted);
  }

  /**
   * Rotate all PII fields in a table
   */
  async rotateTable(
    tableName: string,
    db: any,
    batchSize: number = 100
  ): Promise<{ processed: number; failed: number }> {
    const fields = PII_FIELDS[tableName as keyof typeof PII_FIELDS];
    if (!fields) {
      return { processed: 0, failed: 0 };
    }

    let processed = 0;
    let failed = 0;
    let offset = 0;

    while (true) {
      // Fetch batch of records
      const records = await db
        .select()
        .from(tableName)
        .limit(batchSize)
        .offset(offset);

      if (records.length === 0) break;

      for (const record of records) {
        try {
          const updates: any = {};
          
          // Re-encrypt each PII field
          for (const field of fields) {
            if (record[field]) {
              updates[field] = this.rotateField(record[field]);
            }
          }

          // Update record if any fields were rotated
          if (Object.keys(updates).length > 0) {
            await db
              .update(tableName)
              .set(updates)
              .where({ id: record.id });
            processed++;
          }
        } catch (error) {
          console.error(`[KeyRotation] Failed to rotate record ${record.id}:`, error);
          failed++;
        }
      }

      offset += batchSize;
    }

    return { processed, failed };
  }
}

/**
 * Generate encryption keys
 */
export function generateEncryptionKeys(): {
  masterKey: string;
  salt: string;
  hashSalt: string;
  searchSalt: string;
} {
  return {
    masterKey: crypto.randomBytes(32).toString('base64'),
    salt: crypto.randomBytes(32).toString('base64'),
    hashSalt: crypto.randomBytes(32).toString('base64'),
    searchSalt: crypto.randomBytes(32).toString('base64'),
  };
}

/**
 * Validate encryption configuration
 */
export function validateEncryptionConfig(): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (!process.env.PII_ENCRYPTION_KEY) {
    issues.push('PII_ENCRYPTION_KEY not set');
  } else if (process.env.PII_ENCRYPTION_KEY.length < 32) {
    issues.push('PII_ENCRYPTION_KEY too short (minimum 32 characters)');
  }

  if (!process.env.PII_ENCRYPTION_SALT) {
    issues.push('PII_ENCRYPTION_SALT not set (using default - insecure)');
  }

  if (!process.env.PII_HASH_SALT) {
    issues.push('PII_HASH_SALT not set (using default - insecure)');
  }

  if (!process.env.PII_SEARCH_SALT) {
    issues.push('PII_SEARCH_SALT not set (using default - insecure)');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// Export singleton instance
export const piiEncryption = new PIIEncryption();
export const dbEncryption = new DatabaseEncryption();