// src/lib/crypto.ts

// ESM-Import für Node 20+ WebCrypto
import { webcrypto } from "crypto";

// Einheitliche Crypto-/Subtle-Instanz (Browser oder Node)
const cryptoAPI: Crypto = (globalThis as any).crypto ?? (webcrypto as any);
const subtle: SubtleCrypto = cryptoAPI.subtle;

/** Uint8Array|ArrayBuffer -> Base64 */
function bytesToBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Buffer.from(view).toString("base64");
}

/** Base64 -> Uint8Array */
function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/**
 * Liefert garantiert einen ArrayBuffer (kein SharedArrayBuffer) für WebCrypto,
 * indem bei Bedarf eine echte Kopie erzeugt wird.
 */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  // Kopie erzeugen (vermeidet SAB-Typ und ByteOffset-Probleme)
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return copy.buffer;
}

/** AES-GCM Key aus Base64 (32 Byte) importieren */
async function importKeyFromBase64(b64Key: string): Promise<CryptoKey> {
  const keyBytes = base64ToBytes(b64Key);
  if (keyBytes.byteLength !== 32) {
    throw new Error("JOURNAL_ENC_KEY must be 32 bytes (base64 of 32 raw bytes)");
  }
  const raw = toArrayBuffer(keyBytes);
  return subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** String -> AES-256-GCM verschlüsseln; liefert { iv(base64), ciphertext(base64), version } */
export async function encryptString(plaintext: string, base64Key: string) {
  const key = await importKeyFromBase64(base64Key);

  // IV = 12 Bytes für GCM
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

/** Mit vorgegebener IV (Base64) verschlüsseln – praktisch für konsistente IV je Datensatz */
export async function encryptStringWithIv(plaintext: string, base64Key: string, ivB64: string) {
  const key = await importKeyFromBase64(base64Key);
  const iv = base64ToBytes(ivB64);                // Uint8Array
  const enc = new TextEncoder().encode(plaintext);
  const cipher = await subtle.encrypt({ name: "AES-GCM", iv }, key, enc);
  return { ciphertext: bytesToBase64(cipher) };
}

/** AES-256-GCM entschlüsseln (ciphertext+iv jeweils Base64) -> Klartext */
export async function decryptString(ciphertextB64: string, ivB64: string, base64Key: string) {
  const key = await importKeyFromBase64(base64Key);
  const iv = base64ToBytes(ivB64);                // Uint8Array
  const cipherBytes = base64ToBytes(ciphertextB64);
  const cipherBuf = toArrayBuffer(cipherBytes);   // garantiert ArrayBuffer
  const plain = await subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBuf);
  return new TextDecoder().decode(plain);
}
