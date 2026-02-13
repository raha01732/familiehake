// /workspace/familiehake/src/app/api/monitoring/summary/route.ts
import { fetchClerkStats } from "@/lib/clerk-metrics";
import { fetchSentryStats } from "@/lib/sentry-metrics";
import { getStorageUsageSummary } from "@/lib/stats";
import { NextResponse } from "next/server";

export const revalidate = 30;

export async function GET() {
  const [clerkResult, sentryResult, storageResult] = await Promise.allSettled([
    fetchClerkStats(),
    fetchSentryStats(),
    getStorageUsageSummary(),
  ]);

  return NextResponse.json(
    {
      clerkStats:
        clerkResult.status === "fulfilled"
          ? clerkResult.value
          : { available: false, error: "data_unavailable" },
      sentryStats:
        sentryResult.status === "fulfilled"
          ? sentryResult.value
          : { available: false, error: "data_unavailable" },
      storage:
        storageResult.status === "fulfilled"
          ? storageResult.value
          : {
              totalFiles: 0,
              totalBytes: 0,
              trashedFiles: 0,
              trashedBytes: 0,
              activeShares: 0,
              revokedShares: 0,
              expiredShares: 0,
              expiringSoon: 0,
              recentShares: [],
            },
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
