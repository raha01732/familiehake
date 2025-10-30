// src/lib/crypto.ts

// WebCrypto (funktioniert in Browser und Node 20+)
const { webcrypto } = require("crypto");
const cryptoAPI: Crypto = (globalThis.crypto as any) ?? (webcrypto as any);
const subtle: SubtleCrypto = cryptoAPI.subtle;

/** Uint8Array -> Base64 */
function bytesToBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Buffer.from(view).toString("base64");
}

/** Base64 -> Uint8Array */
function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/** Extrahiert ein "eng" geschnittenes ArrayBuffer aus einer Uint8Array-View */
function sliceToArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

/** AES-GCM Key aus Base64 (32 Byte) importieren */
async function importKeyFromBase64(b64Key: string): Promise<CryptoKey> {
  const keyBytes = base64ToBytes(b64Key);
  if (keyBytes.byteLength !== 32) {
    throw new Error("JOURNAL_ENC_KEY must be 32 bytes (base64 of 32 raw bytes)");
  }
  const raw = sliceToArrayBuffer(keyBytes);
  return subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** String -> AES-256-GCM verschlüsseln; liefert { iv(base64), ciphertext(base64), version } */
export async function encryptString(plaintext: string, base64Key: string) {
  const key = await importKeyFromBase64(base64Key);
  const iv = new Uint8Array(12);
  cryptoAPI.getRandomValues(iv);

  const enc = new TextEncoder().encode(plaintext);
  const cipher = await subtle.encrypt({ name: "AES-GCM", iv }, key, enc);

  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(cipher),
    version: 1 as const,
  };
}

/** String mit vorgegebener IV (Base64) verschlüsseln – praktisch für konsistente IV je Datensatz */
export async function encryptStringWithIv(plaintext: string, base64Key: string, ivB64: string) {
  const key = await importKeyFromBase64(base64Key);
  const iv = base64ToBytes(ivB64);
  const enc = new TextEncoder().encode(plaintext);
  const cipher = await subtle.encrypt({ name: "AES-GCM", iv }, key, enc);
  return { ciphertext: bytesToBase64(cipher) };
}

/** AES-256-GCM entschlüsseln (ciphertext+iv jeweils Base64) -> Klartext */
export async function decryptString(ciphertextB64: string, ivB64: string, base64Key: string) {
  const key = await importKeyFromBase64(base64Key);
  const iv = base64ToBytes(ivB64);
  const cipherBytes = base64ToBytes(ciphertextB64);
  const cipherBuf = sliceToArrayBuffer(cipherBytes);
  const plain = await subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBuf);
  return new TextDecoder().decode(plain);
}
