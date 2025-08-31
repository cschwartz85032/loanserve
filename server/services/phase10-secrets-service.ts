/**
 * Phase 10 Enhanced Secrets Management Service
 * Encryption, key rotation, and secure storage
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac } from 'crypto';
import { pool } from '../db';
import { phase10AuditService } from './phase10-audit-service';

export interface SecretMetadata {
  keyId: string;
  version: number;
  algorithm: string;
  createdAt: Date;
  expiresAt?: Date;
  rotatedAt?: Date;
  purpose: string;
}

export interface EncryptionResult {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  keyId: string;
  algorithm: string;
}

export interface DecryptionInput {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  keyId: string;
  algorithm: string;
}

export class Phase10SecretsService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyDerivationIterations = 100000;
  private masterKey: Buffer | null = null;

  constructor() {
    this.initializeMasterKey();
  }

  /**
   * Initialize master key from environment or generate new one
   */
  private initializeMasterKey(): void {
    const envKey = process.env.PHASE10_MASTER_KEY;
    
    if (envKey) {
      this.masterKey = Buffer.from(envKey, 'hex');
    } else {
      // Generate a new master key (in production, this should be managed by KMS)
      this.masterKey = randomBytes(32);
      console.warn('[Phase10Secrets] No PHASE10_MASTER_KEY found - generated temporary key');
      console.warn('[Phase10Secrets] Set PHASE10_MASTER_KEY for production use');
    }
  }

  /**
   * Derive encryption key from master key
   */
  private deriveKey(purpose: string, salt: Buffer): Buffer {
    if (!this.masterKey) {
      throw new Error('Master key not initialized');
    }

    return createHash('pbkdf2')
      .update(this.masterKey)
      .update(purpose)
      .update(salt)
      .digest();
  }

  /**
   * Generate a data encryption key (DEK)
   */
  private generateDataEncryptionKey(): Buffer {
    return randomBytes(32);
  }

  /**
   * Encrypt data using envelope encryption
   */
  async encryptData(
    plaintext: string | Buffer,
    purpose: string,
    tenantId?: string
  ): Promise<EncryptionResult> {
    try {
      const data = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
      
      // Generate DEK and IV
      const dek = this.generateDataEncryptionKey();
      const iv = randomBytes(12); // 96-bit IV for GCM
      const keyId = randomBytes(16).toString('hex');

      // Encrypt data with DEK
      const cipher = createCipheriv(this.algorithm, dek, iv);
      const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
      const tag = cipher.getAuthTag();

      // Encrypt DEK with KEK (Key Encryption Key derived from master key)
      const kekSalt = randomBytes(16);
      const kek = this.deriveKey(purpose, kekSalt);
      const dekCipher = createCipheriv(this.algorithm, kek, iv);
      const encryptedDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
      const dekTag = dekCipher.getAuthTag();

      // Store key metadata
      await this.storeKeyMetadata({
        keyId,
        version: 1,
        algorithm: this.algorithm,
        createdAt: new Date(),
        purpose
      }, tenantId);

      // Store encrypted DEK
      await this.storeEncryptedDek(keyId, {
        encryptedDek,
        dekTag,
        kekSalt,
        iv: iv,
        algorithm: this.algorithm
      }, tenantId);

      // Log encryption event
      await phase10AuditService.logEvent({
        tenantId: tenantId || '00000000-0000-0000-0000-000000000001',
        eventType: 'ENCRYPTION.DATA_ENCRYPTED',
        actorType: 'system',
        resourceUrn: `urn:encryption:${keyId}`,
        payload: {
          keyId,
          purpose,
          algorithm: this.algorithm,
          dataSize: data.length
        }
      });

      return {
        ciphertext,
        iv,
        tag,
        keyId,
        algorithm: this.algorithm
      };
    } catch (error) {
      console.error('[Phase10Secrets] Encryption failed:', error);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt data using envelope encryption
   */
  async decryptData(
    input: DecryptionInput,
    tenantId?: string
  ): Promise<Buffer> {
    try {
      // Retrieve encrypted DEK
      const dekData = await this.getEncryptedDek(input.keyId, tenantId);
      if (!dekData) {
        throw new Error('Encryption key not found');
      }

      // Derive KEK
      const kek = this.deriveKey(dekData.purpose || 'default', dekData.kekSalt);

      // Decrypt DEK
      const dekDecipher = createDecipheriv(this.algorithm, kek, dekData.iv);
      dekDecipher.setAuthTag(dekData.dekTag);
      const dek = Buffer.concat([dekDecipher.update(dekData.encryptedDek), dekDecipher.final()]);

      // Decrypt data with DEK
      const decipher = createDecipheriv(input.algorithm, dek, input.iv);
      decipher.setAuthTag(input.tag);
      const plaintext = Buffer.concat([decipher.update(input.ciphertext), decipher.final()]);

      // Log decryption event
      await phase10AuditService.logEvent({
        tenantId: tenantId || '00000000-0000-0000-0000-000000000001',
        eventType: 'ENCRYPTION.DATA_DECRYPTED',
        actorType: 'system',
        resourceUrn: `urn:encryption:${input.keyId}`,
        payload: {
          keyId: input.keyId,
          algorithm: input.algorithm
        }
      });

      return plaintext;
    } catch (error) {
      console.error('[Phase10Secrets] Decryption failed:', error);
      throw new Error('Decryption failed');
    }
  }

  /**
   * Generate secure hash for equality lookups
   */
  generateEqualityHash(value: string, salt?: string): Buffer {
    const hashSalt = salt || 'phase10_equality';
    return createHmac('sha256', this.masterKey!)
      .update(value)
      .update(hashSalt)
      .digest();
  }

  /**
   * Encrypt PII field with equality lookup capability
   */
  async encryptPiiField(
    value: string,
    fieldType: string,
    tenantId?: string
  ): Promise<{
    encrypted: EncryptionResult;
    equalityHash: Buffer;
  }> {
    const encrypted = await this.encryptData(value, `pii_${fieldType}`, tenantId);
    const equalityHash = this.generateEqualityHash(value, fieldType);

    return { encrypted, equalityHash };
  }

  /**
   * Rotate encryption key
   */
  async rotateKey(keyId: string, tenantId?: string): Promise<string> {
    const client = await pool.connect();
    
    try {
      if (tenantId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      }

      await client.query('BEGIN');

      // Get current key metadata
      const keyResult = await client.query(`
        SELECT * FROM phase10_key_metadata 
        WHERE key_id = $1 AND ($2::uuid IS NULL OR tenant_id = $2::uuid)
      `, [keyId, tenantId]);

      if (keyResult.rows.length === 0) {
        throw new Error('Key not found');
      }

      const currentKey = keyResult.rows[0];
      const newKeyId = randomBytes(16).toString('hex');

      // Create new key version
      await this.storeKeyMetadata({
        keyId: newKeyId,
        version: currentKey.version + 1,
        algorithm: this.algorithm,
        createdAt: new Date(),
        purpose: currentKey.purpose
      }, tenantId);

      // Mark old key as rotated
      await client.query(`
        UPDATE phase10_key_metadata 
        SET rotated_at = now() 
        WHERE key_id = $1
      `, [keyId]);

      // Log key rotation
      await phase10AuditService.logEvent({
        tenantId: tenantId || '00000000-0000-0000-0000-000000000001',
        eventType: 'ENCRYPTION.KEY_ROTATED',
        actorType: 'system',
        resourceUrn: `urn:encryption:${keyId}`,
        payload: {
          oldKeyId: keyId,
          newKeyId,
          purpose: currentKey.purpose,
          version: currentKey.version + 1
        }
      });

      await client.query('COMMIT');
      return newKeyId;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Phase10Secrets] Key rotation failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Store key metadata
   */
  private async storeKeyMetadata(metadata: SecretMetadata, tenantId?: string): Promise<void> {
    const client = await pool.connect();
    
    try {
      if (tenantId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      }

      await client.query(`
        INSERT INTO phase10_key_metadata (
          key_id, tenant_id, version, algorithm, created_at, expires_at, purpose
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        metadata.keyId,
        tenantId || '00000000-0000-0000-0000-000000000001',
        metadata.version,
        metadata.algorithm,
        metadata.createdAt,
        metadata.expiresAt,
        metadata.purpose
      ]);
    } catch (error) {
      console.error('[Phase10Secrets] Failed to store key metadata:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Store encrypted DEK
   */
  private async storeEncryptedDek(
    keyId: string,
    dekData: {
      encryptedDek: Buffer;
      dekTag: Buffer;
      kekSalt: Buffer;
      iv: Buffer;
      algorithm: string;
    },
    tenantId?: string
  ): Promise<void> {
    const client = await pool.connect();
    
    try {
      if (tenantId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      }

      await client.query(`
        INSERT INTO phase10_encrypted_keys (
          key_id, tenant_id, encrypted_dek, dek_tag, kek_salt, iv, algorithm
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        keyId,
        tenantId || '00000000-0000-0000-0000-000000000001',
        dekData.encryptedDek,
        dekData.dekTag,
        dekData.kekSalt,
        dekData.iv,
        dekData.algorithm
      ]);
    } catch (error) {
      console.error('[Phase10Secrets] Failed to store encrypted DEK:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get encrypted DEK
   */
  private async getEncryptedDek(keyId: string, tenantId?: string): Promise<any> {
    const client = await pool.connect();
    
    try {
      if (tenantId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      }

      const result = await client.query(`
        SELECT ek.*, km.purpose 
        FROM phase10_encrypted_keys ek
        JOIN phase10_key_metadata km ON ek.key_id = km.key_id
        WHERE ek.key_id = $1 AND ($2::uuid IS NULL OR ek.tenant_id = $2::uuid)
      `, [keyId, tenantId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error('[Phase10Secrets] Failed to get encrypted DEK:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * List encryption keys for a tenant
   */
  async listKeys(tenantId?: string, purpose?: string): Promise<SecretMetadata[]> {
    const client = await pool.connect();
    
    try {
      if (tenantId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      }

      let whereClause = 'WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (tenantId) {
        whereClause += ` AND tenant_id = $${paramIndex}::uuid`;
        params.push(tenantId);
        paramIndex++;
      }

      if (purpose) {
        whereClause += ` AND purpose = $${paramIndex}`;
        params.push(purpose);
        paramIndex++;
      }

      const result = await client.query(`
        SELECT key_id, version, algorithm, created_at, expires_at, rotated_at, purpose
        FROM phase10_key_metadata 
        ${whereClause}
        ORDER BY created_at DESC
      `, params);

      return result.rows.map(row => ({
        keyId: row.key_id,
        version: row.version,
        algorithm: row.algorithm,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        rotatedAt: row.rotated_at,
        purpose: row.purpose
      }));
    } catch (error) {
      console.error('[Phase10Secrets] Failed to list keys:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

export const phase10SecretsService = new Phase10SecretsService();