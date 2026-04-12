// /workspace/familiehake/src/app/api/health/auth/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function normalizeConfiguredSignInUrl(rawUrl: string | undefined, requestOrigin: string) {
  if (!rawUrl) return "/sign-in";
  try {
    return new URL(rawUrl, requestOrigin).toString();
  } catch {
    return rawUrl;
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const requestOrigin = requestUrl.origin;

  const vercelEnv = process.env.VERCEL_ENV ?? "unknown";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const signInUrl = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL;
  const clerkFrontendApi = process.env.NEXT_PUBLIC_CLERK_FRONTEND_API ?? null;
  const clerkPublishableKey =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;

  const hasPublishableKey = Boolean(clerkPublishableKey);
  const hasSecretKey = Boolean(clerkSecretKey);
  const keyPairConsistent = hasPublishableKey === hasSecretKey;
  const clerkEnabled = hasPublishableKey && hasSecretKey;

  const configuredSignInUrl = normalizeConfiguredSignInUrl(signInUrl, requestOrigin);
  const expectedSignInUrl = signInUrl ?? "/sign-in";

  const appUrlHost = appUrl ? new URL(appUrl).host : null;
  const requestHost = requestUrl.host;
  const signInHost = (() => {
    try {
      return new URL(configuredSignInUrl).host;
    } catch {
      return requestHost;
    }
  })();

  const hostMatchesAppUrl = appUrlHost ? appUrlHost === requestHost : null;
  const signInHostMatchesRequestHost = signInHost === requestHost;

  const issues: string[] = [];
  if (!keyPairConsistent) {
    issues.push("CLERK_KEYS_INCOMPLETE");
  }
  if (vercelEnv === "preview" && !signInHostMatchesRequestHost) {
    issues.push("PREVIEW_SIGNIN_HOST_MISMATCH");
  }
  if (hostMatchesAppUrl === false) {
    issues.push("APP_URL_HOST_MISMATCH");
  }

  const status = issues.length === 0 ? "ok" : "warn";

  return NextResponse.json({
    status,
    checks: {
      vercel_env: vercelEnv,
      request_origin: requestOrigin,
      request_host: requestHost,
      app_url: appUrl ?? null,
      app_url_host: appUrlHost,
      host_matches_app_url: hostMatchesAppUrl,
      clerk_enabled: clerkEnabled,
      clerk_key_pair_consistent: keyPairConsistent,
      clerk_publishable_key_configured: hasPublishableKey,
      clerk_secret_key_configured: hasSecretKey,
      clerk_frontend_api: clerkFrontendApi,
      configured_sign_in_url: configuredSignInUrl,
      expected_sign_in_url: expectedSignInUrl,
      sign_in_host_matches_request_host: signInHostMatchesRequestHost,
      issues,
      hint: {
        preview: "In Preview sollte NEXT_PUBLIC_CLERK_SIGN_IN_URL idealerweise '/sign-in' sein.",
        local_without_clerk:
          "Für lokale Runs ohne Clerk beide Keys leer lassen: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY.",
      },
    },
  });
}
