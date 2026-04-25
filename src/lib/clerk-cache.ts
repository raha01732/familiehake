// src/lib/clerk-cache.ts
import { clerkClient } from "@clerk/nextjs/server";
import { getCachedJson, setCachedJson, getRedisClient } from "@/lib/redis";
import type { User } from "@clerk/nextjs/server";

/**
 * Kurzer Cache für Clerk-Profile. Spart Round-Trips in Admin-Views und Audits,
 * bleibt aber kurz genug, damit Profil-Updates zügig sichtbar werden.
 */
const USER_TTL_SECONDS = 60;

type CachedUser = {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  primaryEmailAddressId: string | null;
  emailAddresses: Array<{
    id: string;
    emailAddress: string;
    verification: unknown;
  }>;
  publicMetadata: Record<string, unknown>;
  createdAt: number | null;
};

function toCached(u: User): CachedUser {
  return {
    id: u.id,
    username: u.username ?? null,
    firstName: u.firstName ?? null,
    lastName: u.lastName ?? null,
    primaryEmailAddressId: u.primaryEmailAddressId ?? null,
    emailAddresses: (u.emailAddresses ?? []).map((e) => ({
      id: e.id,
      emailAddress: e.emailAddress,
      verification: e.verification ?? null,
    })),
    publicMetadata: (u.publicMetadata ?? {}) as Record<string, unknown>,
    createdAt: u.createdAt ?? null,
  };
}

function userKey(userId: string): string {
  return `clerk:user:${userId}`;
}

/**
 * Fetch a Clerk user with a short Redis cache.
 * Falls Redis nicht konfiguriert ist, fällt automatisch auf direkten Clerk-Call zurück.
 */
export async function getClerkUserCached(userId: string): Promise<CachedUser | null> {
  const cached = await getCachedJson<CachedUser>(userKey(userId));
  if (cached) return cached;

  try {
    const client = await clerkClient();
    const u = await client.users.getUser(userId);
    const shaped = toCached(u);
    await setCachedJson(userKey(userId), shaped, USER_TTL_SECONDS);
    return shaped;
  } catch {
    return null;
  }
}

/**
 * Invalidierung z. B. nach Profil-Updates.
 */
export async function invalidateClerkUser(userId: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.del(userKey(userId));
  } catch {
    // best-effort
  }
}

/**
 * Liefert die primäre Mail-Adresse aus einem gecachten User-Objekt.
 * Spiegel von Clerks `u.primaryEmailAddress?.emailAddress`.
 */
export function getPrimaryEmail(u: CachedUser | null | undefined): string | null {
  if (!u) return null;
  const pid = u.primaryEmailAddressId;
  if (!pid) return u.emailAddresses[0]?.emailAddress ?? null;
  return u.emailAddresses.find((e) => e.id === pid)?.emailAddress ?? null;
}

export type { CachedUser };
