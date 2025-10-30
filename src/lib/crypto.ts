// src/lib/crypto.ts

import { webcrypto } from "crypto";

// Einheitliche Crypto-Instanzen (Browser oder Node 20+)
const cryptoAPI: Crypto = (globalThis as any).crypto ?? (webcrypto as any);
const subtle: SubtleCrypto = cryptoAPI.subtle;

/** Base64 -> Uint8Array (Node Buffer kann SharedArrayBuffer nutzen – daher kopieren wir immer!) */
function base64ToBytes(b64: string): Uint8Array {
  const buf = Buffer.from(b64, "base64");      // Uint8Array, evtl. SAB-basiert
  const out = new Uint8Array(buf.byteLength);  // echte Kopie mit normalem ArrayBuffer
  out.set(buf);
  return out;
}

/** Uint8Array|ArrayBuffer -> Base64 */
function bytesToBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Buffer.from(view).toString("base64");
}

/** Erzwingt eine frische Uint8Array-Kopie (ohne geteiltes ArrayBuffer-Backend) */
function toSafeU8(input: Uint8Array): Uint8Array {
  const out = new Uint8Array(input.byteLength);
  out.set(input);
  return out;
}

/** AES-GCM Key aus Base64 (32 Byte) importieren – mit sicherem ArrayBuffer */
async function importKeyFromBase64(b64Key: string): Promise<CryptoKey> {
  const keyBytes = base64ToBytes(b64Key);      // schon „sicher“
  if (keyBytes.byteLength !== 32) {
    throw new Error("JOURNAL_ENC_KEY must be 32 bytes (base64 of 32 raw bytes)");
  }
  // ArrayBuffer aus der sicheren Kopie
  const raw: ArrayBuffer = keyBytes.buffer;
  return subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** String -> AES-256-GCM verschlüsseln; liefert { iv(base64), ciphertext(base64), version } */
export async function encryptString(plaintext: string, base64Key: string) {
  const key = await importKeyFromBase64(base64Key);

  // IV = 12 Bytes für GCM
  const iv = new Uint8Array(12);
  cryptoAPI.getRandomValues(iv);               // erzeugt „sicheren“ U8

  const encU8 = toSafeU8(new TextEncoder().encode(plaintext));
  const ivU8 = toSafeU8(iv);

  const cipher = await subtle.encrypt({ name: "AES-GCM", iv: ivU8 }, key, encU8);

  return {
    iv: bytesToBase64(ivU8),
    ciphertext: bytesToBase64(cipher),
    version: 1 as const,
  };
}

/** Mit vorgegebener IV (Base64) verschlüsseln – konsistente IV pro Datensatz */
export async function encryptStringWithIv(plaintext: string, base64Key: string, ivB64: string) {
  const key = await importKeyFromBase64(base64Key);
  const ivU8 = toSafeU8(base64ToBytes(ivB64));
  const encU8 = toSafeU8(new TextEncoder().encode(plaintext));
  const cipher = await subtle.encrypt({ name: "AES-GCM", iv: ivU8 }, key, encU8);
  return { ciphertext: bytesToBase64(cipher) };
}

/** AES-256-GCM entschlüsseln (ciphertext+iv jeweils Base64) -> Klartext */
export async function decryptString(ciphertextB64: string, ivB64: string, base64Key: string) {
  const key = await importKeyFromBase64(base64Key);
  const ivU8 = toSafeU8(base64ToBytes(ivB64));
  const cipherU8 = toSafeU8(base64ToBytes(ciphertextB64));
  const plain = await subtle.decrypt({ name: "AES-GCM", iv: ivU8 }, key, cipherU8);
  return new TextDecoder().decode(plain);
}
