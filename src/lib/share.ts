// src/lib/share.ts
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(_scrypt);

/** Erzeugt einen kryptisch starken Token (base64url) */
export function generateShareToken(bytes = 32): string {
  return randomBytes(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Passwort-Hashing mit scrypt (ohne externe Dependencies) */
export async function hashPasswordScrypt(password: string) {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, 32)) as Buffer;
  return {
    algo: "s2" as const,
    salt: salt.toString("base64"),
    hash: Buffer.from(key).toString("base64"),
  };
}

export async function verifyPasswordScrypt(password: string, saltB64: string, hashB64: string) {
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const got = (await scrypt(password, salt, 32)) as Buffer;
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

/** Kleine Hilfsprüfung: abgelaufen, widerrufen oder Downloadlimit erreicht? */
export function isShareActive(share: {
  revoked_at: string | null;
  expires_at: string | null;
  max_downloads: number | null;
  downloads_count: number;
}) {
  if (share.revoked_at) return false;
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) return false;
  if (share.max_downloads != null && share.downloads_count >= share.max_downloads) return false;
  return true;
}
