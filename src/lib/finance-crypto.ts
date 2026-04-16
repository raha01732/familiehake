// src/lib/finance-crypto.ts
// AES-256-GCM encryption for finance transaction data.
// Only runs in Node.js (API routes / server actions).

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 12;   // 96-bit IV recommended for GCM
const KEY_LEN = 32;  // 256-bit key
const SALT = "familiehake-finance-v1";
const SEPARATOR = ".";

let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;
  const secret =
    process.env.FINANCE_ENCRYPTION_KEY ??
    "familiehake-dev-placeholder-key-unsafe";
  // Derive deterministic 256-bit key from the secret
  _key = scryptSync(secret, SALT, KEY_LEN);
  return _key;
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * The userId is used as Additional Authenticated Data so that
 * ciphertext from one user cannot be decrypted in another user's context.
 *
 * Output format: base64(iv).base64(authTag).base64(ciphertext)
 */
export function encryptValue(plaintext: string, userId: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(SEPARATOR);
}

/**
 * Decrypt a token produced by encryptValue.
 * Throws if the token is malformed, tampered with, or the userId doesn't match.
 */
export function decryptValue(token: string, userId: string): string {
  const parts = token.split(SEPARATOR);
  if (parts.length !== 3) throw new Error("Invalid encrypted token");
  const [ivB64, tagB64, encB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encB64, "base64");
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(userId, "utf8"));
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
