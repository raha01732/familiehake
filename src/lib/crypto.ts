// Hilfen für Ende-zu-Ende-Verschlüsselung (Browser WebCrypto).
//
// Envelope-Verschlüsselung (Hybrid): RSA-OAEP kann pro Aufruf nur sehr
// wenig Klartext direkt verschlüsseln (bei 2048 Bit + SHA-256 ca. 190 Byte).
// Deshalb wird pro Nachricht ein zufälliger AES-256-GCM-Schlüssel erzeugt,
// der den eigentlichen Text verschlüsselt; nur dieser kurze AES-Schlüssel
// wird per RSA-OAEP mit dem Public Key des Empfängers verschlüsselt. Damit
// sind Nachrichten praktisch nicht mehr längenbegrenzt.
//
// decryptWith() versteht zusätzlich das alte, reine RSA-OAEP-Format (vor
// der Umstellung auf Envelope-Verschlüsselung gesendete Nachrichten bleiben
// lesbar).

export async function generateRSA() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"]
  );
  const pub = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const priv = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  return {
    publicPEM: spkiToPEM(pub),
    privatePEM: pkcs8ToPEM(priv),
  };
}

export async function importPublicKey(pem: string) {
  const bin = pemToBinary(pem);
  return crypto.subtle.importKey(
    "spki",
    bin,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
}

export async function importPrivateKey(pem: string) {
  const bin = pemToBinary(pem);
  return crypto.subtle.importKey(
    "pkcs8",
    bin,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
}

type EnvelopeV2 = { v: 2; key: string; iv: string; data: string };
type EnvelopeV3 = { v: 3; keys: string[]; iv: string; data: string };

function isEnvelopeV2(value: unknown): value is EnvelopeV2 {
  const v = value as Partial<EnvelopeV2> | null;
  return (
    !!v && v.v === 2 && typeof v.key === "string" && typeof v.iv === "string" && typeof v.data === "string"
  );
}

function isEnvelopeV3(value: unknown): value is EnvelopeV3 {
  const v = value as Partial<EnvelopeV3> | null;
  return (
    !!v &&
    v.v === 3 &&
    Array.isArray(v.keys) &&
    v.keys.every((k) => typeof k === "string") &&
    typeof v.iv === "string" &&
    typeof v.data === "string"
  );
}

/**
 * Verschlüsselt beliebig langen Text für alle übergebenen Public Keys
 * (typischerweise Empfänger + eigener Schlüssel, damit man die selbst
 * gesendete Nachricht später auch wieder lesen kann – reines RSA-OAEP
 * für nur den Empfänger würde für den Absender unlesbar bleiben).
 */
export async function encryptFor(pubKeys: CryptoKey[], text: string): Promise<string> {
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(text);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plain);

  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
  const wrappedKeys = await Promise.all(
    pubKeys.map(async (pubKey) => toB64(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pubKey, rawAesKey)))
  );

  const envelope: EnvelopeV3 = {
    v: 3,
    keys: wrappedKeys,
    iv: toB64(iv.buffer as ArrayBuffer),
    data: toB64(cipherBuf),
  };
  return JSON.stringify(envelope);
}

async function unwrapAesKey(privKey: CryptoKey, wrappedKeys: string[]): Promise<CryptoKey> {
  for (const wrapped of wrappedKeys) {
    try {
      const rawAesKey = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privKey, fromB64(wrapped));
      return await crypto.subtle.importKey("raw", rawAesKey, { name: "AES-GCM" }, false, ["decrypt"]);
    } catch {
      // dieser Wrapped-Key gehört nicht zu diesem privaten Schlüssel – nächsten probieren
    }
  }
  throw new Error("Kein zu diesem Schlüssel passender Envelope-Eintrag gefunden");
}

/** Entschlüsselt eine mit encryptFor() erzeugte Nachricht (oder eine alte, reine RSA-OAEP-Nachricht). */
export async function decryptWith(privKey: CryptoKey, payload: string): Promise<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    parsed = null;
  }

  let aesKey: CryptoKey;
  let iv: ArrayBuffer;
  let cipherBuf: ArrayBuffer;

  if (isEnvelopeV3(parsed)) {
    aesKey = await unwrapAesKey(privKey, parsed.keys);
    iv = fromB64(parsed.iv);
    cipherBuf = fromB64(parsed.data);
  } else if (isEnvelopeV2(parsed)) {
    // Vor der Dual-Key-Umstellung: AES-Schlüssel war nur für den Empfänger
    // verschlüsselt, der Absender kann seine eigenen alten Nachrichten hier
    // nicht mehr entschlüsseln.
    aesKey = await unwrapAesKey(privKey, [parsed.key]);
    iv = fromB64(parsed.iv);
    cipherBuf = fromB64(parsed.data);
  } else {
    // Legacy-Format: Text direkt per RSA-OAEP verschlüsselt (vor Umstellung
    // auf Envelope-Verschlüsselung, max. ~190 Byte Klartext).
    const buf = fromB64(payload);
    const dec = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privKey, buf);
    return new TextDecoder().decode(dec);
  }

  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, aesKey, cipherBuf);
  return new TextDecoder().decode(plainBuf);
}

function spkiToPEM(spki: ArrayBuffer) {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(spki)));
  return `-----BEGIN PUBLIC KEY-----\n${wrap64(b64)}\n-----END PUBLIC KEY-----`;
}
function pkcs8ToPEM(pk: ArrayBuffer) {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(pk)));
  return `-----BEGIN PRIVATE KEY-----\n${wrap64(b64)}\n-----END PRIVATE KEY-----`;
}
function pemToBinary(pem: string) {
  const b64 = pem.replace(/-----(BEGIN|END) (PUBLIC|PRIVATE) KEY-----/g, "").replace(/\s+/g, "");
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}
function wrap64(s: string) {
  return s.replace(/(.{64})/g, "$1\n");
}
function toB64(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(b64: string) {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}
