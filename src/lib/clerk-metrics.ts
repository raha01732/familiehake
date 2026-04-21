// /workspace/familiehake/src/lib/clerk-metrics.ts
import { env } from "@/lib/env";
import { getCachedJson, setCachedJson } from "@/lib/redis";
import { reportError } from "@/lib/sentry";

type ClerkInvitation = {
  id: string;
  status?: string;
};

type ClerkPaginated<T> = {
  data: T[];
  total_count: number;
};

type ClerkCountResponse = {
  total_count?: number;
  object?: string;
};

export type ClerkStats = {
  available: boolean;
  totalUsers?: number;
  activeUsers24h?: number;
  pendingInvitations?: number;
  revokedInvitations?: number;
  error?: string;
};

const CLERK_BASE_URL = "https://api.clerk.com/v1";
const CLERK_CACHE_KEY = "monitoring:clerk:summary:v3";
const CLERK_CACHE_TTL_SECONDS = 45;
// Pin the API version so list endpoints reliably return `{data, total_count}`.
// Older instances default to the version at creation time and may still return bare arrays.
const CLERK_API_VERSION = "2024-10-01";

function clerkHeaders() {
  const { CLERK_SECRET_KEY } = env();
  if (!CLERK_SECRET_KEY) {
    throw new Error("clerk_secret_key_missing");
  }
  return {
    Authorization: `Bearer ${CLERK_SECRET_KEY}`,
    "Content-Type": "application/json",
    "Clerk-API-Version": CLERK_API_VERSION,
  };
}

async function fetchFromClerk<T>(path: string): Promise<T> {
  const response = await fetch(`${CLERK_BASE_URL}${path}`, {
    cache: "no-store",
    headers: clerkHeaders(),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`clerk:${path}:${response.status}:${body.slice(0, 200)}`);
  }

  return (await response.json()) as T;
}

function extractList<T>(payload: ClerkPaginated<T> | T[] | null | undefined): T[] {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray((payload as ClerkPaginated<T>).data)) {
    return (payload as ClerkPaginated<T>).data;
  }
  return [];
}

export async function fetchClerkStats(): Promise<ClerkStats> {
  const cached = await getCachedJson<ClerkStats>(CLERK_CACHE_KEY);
  if (cached) {
    return cached;
  }

  try {
    const since = Date.now() - 24 * 60 * 60 * 1000;

    // `/users/count` returns `{total_count}` (not a list) on every API version,
    // so it's safe regardless of the instance's default response shape.
    const [totalUsersRes, activeUsersRes, invitationsRes] = await Promise.all([
      fetchFromClerk<ClerkCountResponse | number>("/users/count"),
      fetchFromClerk<ClerkCountResponse | number>(
        `/users/count?last_sign_in_at_after=${since}`
      ),
      fetchFromClerk<ClerkPaginated<ClerkInvitation> | ClerkInvitation[]>(
        "/invitations?limit=500"
      ),
    ]);

    const totalUsers =
      typeof totalUsersRes === "number"
        ? totalUsersRes
        : totalUsersRes?.total_count ?? 0;
    const activeUsers24h =
      typeof activeUsersRes === "number"
        ? activeUsersRes
        : activeUsersRes?.total_count ?? 0;
    const invitations = extractList(invitationsRes);
    const pendingInvitations = invitations.filter((entry) => entry.status === "pending").length;
    const revokedInvitations = invitations.filter((entry) => entry.status === "revoked").length;

    const stats: ClerkStats = {
      available: true,
      totalUsers,
      activeUsers24h,
      pendingInvitations,
      revokedInvitations,
    };

    await setCachedJson(CLERK_CACHE_KEY, stats, CLERK_CACHE_TTL_SECONDS);
    return stats;
  } catch (error: any) {
    reportError(error, {
      clerkMetrics: {
        location: "fetchClerkStats",
      },
    });

    const unavailable: ClerkStats = {
      available: false,
      error: error?.message ?? "unknown_error",
    };

    await setCachedJson(CLERK_CACHE_KEY, unavailable, 30);
    return unavailable;
  }
}
