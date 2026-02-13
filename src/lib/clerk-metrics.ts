// /workspace/familiehake/src/lib/clerk-metrics.ts
import { env } from "@/lib/env";
import { getCachedJson, setCachedJson } from "@/lib/redis";
import { reportError } from "@/lib/sentry";

type ClerkSession = {
  id: string;
  status?: string;
  last_active_at?: number;
};

type ClerkInvitation = {
  id: string;
  status?: string;
};

export type ClerkStats = {
  available: boolean;
  activeSessions?: number;
  pendingInvitations?: number;
  revokedInvitations?: number;
  error?: string;
};

const CLERK_BASE_URL = "https://api.clerk.com/v1";
const CLERK_CACHE_KEY = "monitoring:clerk:summary:v1";
const CLERK_CACHE_TTL_SECONDS = 45;

function clerkHeaders() {
  const { CLERK_SECRET_KEY } = env();
  return {
    Authorization: `Bearer ${CLERK_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
}

async function fetchFromClerk<T>(path: string): Promise<T> {
  const response = await fetch(`${CLERK_BASE_URL}${path}`, {
    cache: "no-store",
    headers: clerkHeaders(),
  });

  if (!response.ok) {
    throw new Error(`clerk:${path}:${response.status}`);
  }

  return (await response.json()) as T;
}

function isActiveSession(session: ClerkSession) {
  if (session.status === "active") return true;
  if (!session.last_active_at) return false;
  return Date.now() - session.last_active_at < 30 * 60 * 1000;
}

export async function fetchClerkStats(): Promise<ClerkStats> {
  const cached = await getCachedJson<ClerkStats>(CLERK_CACHE_KEY);
  if (cached) {
    return cached;
  }

  try {
    const [sessions, invitations] = await Promise.all([
      fetchFromClerk<ClerkSession[]>("/sessions?limit=500&status=active"),
      fetchFromClerk<ClerkInvitation[]>("/invitations?limit=500"),
    ]);

    const activeSessions = sessions.filter(isActiveSession).length;
    const pendingInvitations = invitations.filter((entry) => entry.status === "pending").length;
    const revokedInvitations = invitations.filter((entry) => entry.status === "revoked").length;

    const stats: ClerkStats = {
      available: true,
      activeSessions,
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
