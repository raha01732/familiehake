// src/lib/shares/cache.ts
import { getCachedJson, setCachedJson, getRedisClient } from "@/lib/redis";

/**
 * Kurzer Cache auf Token-Lookups.
 * TTL bewusst klein, damit Revoke/Expiry nicht zu lange überbrückt werden,
 * und bei Revoke invalidieren wir explizit.
 */
const SHARE_TTL_SECONDS = 30;

export type CachedShareRow = {
  id: string;
  token: string;
  file_id: string;
  owner_user_id: string;
  expires_at: string | null;
  max_downloads: number | null;
  downloads_count: number;
  revoked_at: string | null;
  password_algo: string | null;
  password_salt: string | null;
  password_hash: string | null;
  files_meta:
    | { storage_path: string | null; file_name: string | null }
    | Array<{ storage_path: string | null; file_name: string | null }>
    | null;
};

function tokenKey(token: string): string {
  return `share:token:${token}`;
}

function idKey(shareId: string): string {
  return `share:id:${shareId}`;
}

export async function getCachedShareByToken(
  token: string,
): Promise<CachedShareRow | null> {
  return getCachedJson<CachedShareRow>(tokenKey(token));
}

export async function cacheShareByToken(share: CachedShareRow): Promise<void> {
  await Promise.all([
    setCachedJson(tokenKey(share.token), share, SHARE_TTL_SECONDS),
    setCachedJson(idKey(share.id), share.token, SHARE_TTL_SECONDS),
  ]);
}

/**
 * Invalidierung bei Revoke.
 * Wir kennen nur die shareId → Redis-Lookup auf Token, dann Token-Key + ID-Key löschen.
 */
export async function invalidateShareById(shareId: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  try {
    const token = await client.get<string>(idKey(shareId));
    if (token) {
      await client.del(tokenKey(token));
    }
    await client.del(idKey(shareId));
  } catch {
    // Invalidation ist best-effort
  }
}

export async function invalidateShareByToken(token: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.del(tokenKey(token));
  } catch {
    // ignore
  }
}
