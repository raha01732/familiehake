// /workspace/familiehake/src/instrumentation.ts
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

type RequestInfo = {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
};

type ErrorContext = {
  routerKind: string;
  routePath: string;
  routeType: string;
};

export const onRequestError = async (error: Error, request: Request, context: { [key: string]: unknown }) => {
  const requestUrl = typeof request?.url === "string" ? request.url : "";
  let requestPath = "unknown";

  if (requestUrl) {
    try {
      requestPath = new URL(requestUrl, "http://localhost").pathname;
    } catch {
      requestPath = "unknown";
    }
  }

  const requestInfo: RequestInfo = {
    path: requestPath,
    method: request.method,
    headers: Object.fromEntries(request.headers),
  };
  const errorContext = context as ErrorContext;

  Sentry.captureRequestError(error, requestInfo, errorContext);

  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return;
  }

  const { getPostHogServer } = await import("./lib/posthog-server");
  const posthog = getPostHogServer();
  const cookieHeader = typeof request.headers.get === "function" ? request.headers.get("cookie") : null;
  const cookieValue = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader ?? "";
  const postHogCookieMatch = cookieValue.match(/ph_phc_.*?_posthog=([^;]+)/);
  let distinctId: string | undefined;

  if (postHogCookieMatch?.[1]) {
    try {
      const decodedCookie = decodeURIComponent(postHogCookieMatch[1]);
      const postHogData = JSON.parse(decodedCookie) as { distinct_id?: string };
      distinctId = postHogData.distinct_id;
    } catch (parseError) {
      console.error("Error parsing PostHog cookie:", parseError);
    }
  }

  await posthog.captureException(error, distinctId);
};
