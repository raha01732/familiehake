// src/lib/aead-crypto.ts
// AES-256-GCM AEAD factory. Each feature instantiates its own encryptor with
// an independent key env var and salt — so a leak of one key does not affect
// other features.
//
// Only runs in Node.js (API routes / server actions).

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 12; // 96-bit IV recommended for GCM
const KEY_LEN = 32; // 256-bit key
const SEPARATOR = ".";

export type Aead = {
  encrypt(plaintext: string, userId: string): string;
  decrypt(token: string, userId: string): string;
};

export type AeadOptions = {
  /** Name of the env var holding the secret. */
  keyEnv: string;
  /** Stable salt — must never change for an existing dataset. */
  salt: string;
};

/**
 * Build an AEAD encryptor/decryptor for a feature.
 *
 * Output format: base64(iv).base64(authTag).base64(ciphertext)
 *
 * The userId is bound as Additional Authenticated Data (AAD) so that
 * a ciphertext from one user cannot be decrypted under another user's
 * context — defends against row-swapping attacks.
 */
export function createAead({ keyEnv, salt }: AeadOptions): Aead {
  let cachedKey: Buffer | null = null;

  function getKey(): Buffer {
    if (cachedKey) return cachedKey;
    const secret = process.env[keyEnv];
    if (!secret) {
      throw new Error(
        `${keyEnv} is not set. Generate a value with \`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\` and add it to your environment.`,
      );
    }
    cachedKey = scryptSync(secret, salt, KEY_LEN);
    return cachedKey;
  }

  return {
    encrypt(plaintext, userId) {
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
    },

    decrypt(token, userId) {
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
    },
  };
}
