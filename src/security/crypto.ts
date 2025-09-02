import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from "@aws-sdk/client-kms";
import axios from "axios";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const kms = new KMSClient({ 
  region: process.env.AWS_REGION || "us-east-1" 
});

interface DEKPair {
  plaintext: Buffer;
  ciphertext: Buffer;
}

/**
 * Retrieve or create a per-tenant Data Encryption Key (DEK) encrypted by KMS
 * Implements envelope encryption pattern: KMS Key Encryption Key -> Vault stored DEK
 */
export async function getTenantDEK(tenantId: string): Promise<DEKPair> {
  const vaultPath = `${process.env.VAULT_ADDR}/v1/${process.env.VAULT_KV_PATH}/tenants/${tenantId}/dek`;
  
  try {
    // 1) Try to retrieve existing DEK from Vault
    const response = await axios.get(vaultPath, {
      headers: { "X-Vault-Token": process.env.VAULT_TOKEN },
      timeout: 5000
    });
    
    const encryptedDEK = Buffer.from(response.data.data.data.ciphertext, "base64");
    
    // 2) Decrypt DEK using KMS
    const decryptCommand = new DecryptCommand({ CiphertextBlob: encryptedDEK });
    const decryptResult = await kms.send(decryptCommand);
    
    return {
      plaintext: Buffer.from(decryptResult.Plaintext as Uint8Array),
      ciphertext: encryptedDEK
    };
  } catch (error) {
    // 3) Generate new DEK if not found
    console.log(`[Crypto] Generating new DEK for tenant ${tenantId}`);
    
    const generateCommand = new GenerateDataKeyCommand({
      KeyId: process.env.KMS_KEY_ARN!,
      KeySpec: "AES_256"
    });
    
    const generateResult = await kms.send(generateCommand);
    const plaintext = Buffer.from(generateResult.Plaintext as Uint8Array);
    const ciphertext = Buffer.from(generateResult.CiphertextBlob as Uint8Array);
    
    // 4) Store encrypted DEK in Vault
    try {
      await axios.post(vaultPath, {
        data: { ciphertext: ciphertext.toString("base64") }
      }, {
        headers: { "X-Vault-Token": process.env.VAULT_TOKEN },
        timeout: 5000
      });
    } catch (vaultError) {
      console.warn('[Crypto] Failed to store DEK in Vault:', vaultError);
      // Continue with generated key even if Vault storage fails
    }
    
    return { plaintext, ciphertext };
  }
}

/**
 * AEAD (AES-256-GCM) encrypt with Additional Authenticated Data
 * Returns base64 payload: iv.ciphertext.tag
 */
export async function enc(tenantId: string, plaintext: string, aad: string): Promise<string> {
  const { plaintext: dek } = await getTenantDEK(tenantId);
  const key = dek; // 32 bytes from KMS
  const iv = randomBytes(12); // 96-bit IV for GCM
  
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(aad, "utf-8"));
  
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf-8")),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv(12) + ciphertext(var) + tag(16)
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64");
}

/**
 * Decrypt AEAD payload produced by enc()
 */
export async function dec(tenantId: string, b64Payload: string, aad: string): Promise<string> {
  const { plaintext: dek } = await getTenantDEK(tenantId);
  const key = dek;
  const raw = Buffer.from(b64Payload, "base64");
  
  if (raw.length < 28) { // minimum: 12 (iv) + 0 (data) + 16 (tag)
    throw new Error("Invalid encrypted payload length");
  }
  
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(raw.length - 16);
  const ciphertext = raw.subarray(12, raw.length - 16);
  
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAAD(Buffer.from(aad, "utf-8"));
  decipher.setAuthTag(authTag);
  
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
  
  return plaintext.toString("utf-8");
}

/**
 * Tokenize: SHA-256 hash for deterministic matching without revealing value
 * Used for searchable encryption (e.g., SSN last 4, email domains)
 */
export function tokenize(value: string): string {
  return createHash("sha256").update(value.toLowerCase().trim()).digest("hex");
}

/**
 * Secure random token generation for API keys, session tokens, etc.
 */
export function generateSecureToken(bytes: number = 32): string {
  return randomBytes(bytes).toString("hex");
}

/**
 * Hash password with salt (for fallback authentication)
 */
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const passwordSalt = salt || randomBytes(16).toString("hex");
  const hash = createHash("sha256")
    .update(password + passwordSalt)
    .digest("hex");
  return { hash, salt: passwordSalt };
}

/**
 * Verify password hash
 */
export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const { hash: computedHash } = hashPassword(password, salt);
  return computedHash === hash;
}