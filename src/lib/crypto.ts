// Hilfen für RSA-OAEP + PEM (Browser WebCrypto)
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

export async function encryptFor(pubKey: CryptoKey, text: string) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pubKey, enc);
  return toB64(buf);
}

export async function decryptWith(privKey: CryptoKey, base64: string) {
  const buf = fromB64(base64);
  const dec = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privKey, buf);
  return new TextDecoder().decode(dec);
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
