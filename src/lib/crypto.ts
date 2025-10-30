// Node 20+: Web Crypto API verfügbar
const subtle = globalThis.crypto?.subtle ?? require("crypto").webcrypto.subtle;

function base64ToBytes(b64: string): Uint8Array {
  return Buffer.from(b64, "base64");
}
function bytesToBase64(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Buffer.from(buf).toString("base64");
}

async function importKeyFromBase64(b64Key: string) {
  const keyBytes = base64ToBytes(b64Key);
  if (keyBytes.byteLength !== 32) throw new Error("JOURNAL_ENC_KEY must be 32 bytes (base64 of 32 raw bytes)");
  return subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptString(plaintext: string, base64Key: string) {
  const key = await importKeyFromBase64(base64Key);
  const iv = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint8Array(12))
    : require("crypto").randomBytes(12);

  const enc = new TextEncoder().encode(plaintext);
  const cipher = await subtle.encrypt({ name: "AES-GCM", iv }, key, enc);
  return {
    iv: Buffer.from(iv).toString("base64"),
    ciphertext: bytesToBase64(cipher),
    version: 1 as const,
  };
}

export async function decryptString(ciphertextB64: string, ivB64: string, base64Key: string) {
  const key = await importKeyFromBase64(base64Key);
  const iv = base64ToBytes(ivB64);
  const cipherBytes = base64ToBytes(ciphertextB64);
  const plain = await subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBytes);
  return new TextDecoder().decode(plain);
}
