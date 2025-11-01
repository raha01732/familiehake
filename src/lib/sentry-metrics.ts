import { env } from "@/lib/env";

type SentryStats = {
  available: boolean;
  events24h?: number;
  rejected24h?: number;
  unresolvedIssues?: number;
  latestIssueTitle?: string | null;
  latestRelease?: string | null;
  error?: string;
};

type SentryStatsResponse = Array<[number, number]>;

type SentryIssue = {
  id: string;
  title: string;
  status: string;
};

type SentryRelease = {
  version: string;
  dateCreated: string;
};

function sumPoints(points: SentryStatsResponse): number {
  return points.reduce((acc, [, value]) => acc + value, 0);
}

export async function fetchSentryStats(): Promise<SentryStats> {
  const { SENTRY_API_TOKEN, SENTRY_ORG_SLUG, SENTRY_PROJECT_SLUG } = env();

  if (!SENTRY_API_TOKEN || !SENTRY_ORG_SLUG || !SENTRY_PROJECT_SLUG) {
    return { available: false, error: "missing_config" };
  }

  const authHeader = { Authorization: `Bearer ${SENTRY_API_TOKEN}` };
  const now = Math.floor(Date.now() / 1000);
  const since = now - 60 * 60 * 24; // 24h

  try {
    const [receivedRes, rejectedRes, issuesRes, releasesRes] = await Promise.all([
      fetch(
        `https://sentry.io/api/0/projects/${SENTRY_ORG_SLUG}/${SENTRY_PROJECT_SLUG}/stats/?stat=received&since=${since}&until=${now}&resolution=1h`,
        { headers: authHeader, cache: "no-store" }
      ),
      fetch(
        `https://sentry.io/api/0/projects/${SENTRY_ORG_SLUG}/${SENTRY_PROJECT_SLUG}/stats/?stat=rejected&since=${since}&until=${now}&resolution=1h`,
        { headers: authHeader, cache: "no-store" }
      ),
      fetch(
        `https://sentry.io/api/0/projects/${SENTRY_ORG_SLUG}/${SENTRY_PROJECT_SLUG}/issues/?statsPeriod=24h&per_page=5`,
        { headers: authHeader, cache: "no-store" }
      ),
      fetch(
        `https://sentry.io/api/0/projects/${SENTRY_ORG_SLUG}/${SENTRY_PROJECT_SLUG}/releases/?per_page=1`,
        { headers: authHeader, cache: "no-store" }
      ),
    ]);

    if (!receivedRes.ok) {
      throw new Error(`received:${receivedRes.status}`);
    }
    if (!rejectedRes.ok) {
      throw new Error(`rejected:${rejectedRes.status}`);
    }

    const [received, rejected, issues, releases] = await Promise.all([
      receivedRes.json() as Promise<SentryStatsResponse>,
      rejectedRes.json() as Promise<SentryStatsResponse>,
      issuesRes.ok ? ((issuesRes.json() as Promise<SentryIssue[]>) ?? Promise.resolve([])) : Promise.resolve([]),
      releasesRes.ok ? ((releasesRes.json() as Promise<SentryRelease[]>) ?? Promise.resolve([])) : Promise.resolve([]),
    ]);

    const events24h = sumPoints(received);
    const rejected24h = sumPoints(rejected);
    const unresolvedIssues = issues.filter((issue) => issue.status !== "resolved").length;
    const latestIssueTitle = issues.length > 0 ? issues[0].title : null;
    const latestRelease = releases.length > 0 ? releases[0].version : null;

    return {
      available: true,
      events24h,
      rejected24h,
      unresolvedIssues,
      latestIssueTitle,
      latestRelease,
    };
  } catch (error: any) {
    return {
      available: false,
      error: error?.message ?? "unknown_error",
    };
  }
}
