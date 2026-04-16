// /workspace/familiehake/src/middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Buffer } from "buffer";
import { getClerkPublishableKey } from "@/lib/env";

/** Öffentliche Routen (ohne Login erreichbar) */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health(.*)",
  "/api/keepalive",

  // Legal pages — publicly accessible without login
  "/legal(.*)",

  // ✅ wichtig: Sentry-Tunnel muss öffentlich sein, sonst 500/redirect beim Feedback
  "/api/sentry-tunnel",

  // Cron-Routen haben eigene Auth via isAuthorizedCronRequest
  "/api/cron(.*)",
]);

const clerkPublishableKey = getClerkPublishableKey();
const clerkSignInUrl = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? "/sign-in";
const isClerkEnabled = Boolean(clerkPublishableKey);
const hasRelativeSignInPath = clerkSignInUrl.startsWith("/");
const DEFAULT_LOCALE = process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? "de";
const LOCALE_COOKIE_NAME = "locale";

/** Optional: IP-Denylist (kommasepariert) */
const BLOCKED_IPS = (process.env.BLOCKED_IPS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Preview-Umgebung absichern (Basic Auth) */
function handlePreviewProtection(req: NextRequest) {
  const isPreview = process.env.VERCEL_ENV === "preview";
  if (!isPreview) return null;

  const url = new URL(req.url);
  const allowed = ["/_next", "/favicon.ico", "/robots.txt", "/api/health", "/api/keepalive"];
  if (allowed.some((p) => url.pathname.startsWith(p))) return null;

  const authHeader = req.headers.get("authorization") || "";
  const [scheme, encoded] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": "Basic realm=preview" },
    });
  }
  const [user, pass] = Buffer.from(encoded, "base64").toString().split(":");
  if (user !== process.env.PREVIEW_USER || pass !== process.env.PREVIEW_PASS) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return null;
}

/** Security Headers (CSP etc.) */
function withSecurityHeaders(res: NextResponse) {
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self';",
      "img-src 'self' data: blob: https://images.clerk.dev https://img.clerk.com https://clerk.familiehake.de;",
      "style-src 'self' 'unsafe-inline';",
      "font-src 'self' data:;",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.com https://*.clerk.services https://*.clerk.accounts.dev https://clerk.familiehake.de https://vercel.live;",
      "worker-src 'self' blob:;",
      // Hinweis: 'self' deckt deinen Tunnel /api/sentry-tunnel ab
      "connect-src 'self' https://*.clerk.com https://*.clerk.services https://*.clerk.accounts.dev https://clerk.familiehake.de https://*.supabase.co https://*.ingest.sentry.io;",
      "frame-ancestors 'none';",
      "frame-src https://*.clerk.com https://*.clerk.services https://*.clerk.accounts.dev https://clerk.familiehake.de https://vercel.live;",
      "base-uri 'self';",
      "form-action 'self' https://*.clerk.com https://*.clerk.accounts.dev https://clerk.familiehake.de;",
    ].join(" ")
  );
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-DNS-Prefetch-Control", "off");
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return res;
}

function withLocaleCookie(req: NextRequest, res: NextResponse) {
  const existingLocale = req.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (existingLocale) return res;

  res.cookies.set({
    name: LOCALE_COOKIE_NAME,
    value: DEFAULT_LOCALE,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });

  return res;
}

/** Optional: IP-Block */
function checkIpBlock(req: NextRequest) {
  if (BLOCKED_IPS.length === 0) return null;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    // @ts-ignore (Vercel setzt ip am Request Objekt)
    (req as any).ip ||
    "";
  if (ip && BLOCKED_IPS.includes(ip)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return null;
}

function isClerkSignInRoute(req: NextRequest) {
  if (!hasRelativeSignInPath) return false;
  const pathname = new URL(req.url).pathname;
  const normalizedSignInPath = clerkSignInUrl.replace(/\/+$/, "") || "/";
  return pathname === normalizedSignInPath || pathname.startsWith(`${normalizedSignInPath}/`);
}

const fallbackMiddleware = (req: NextRequest) => {
  const preview = handlePreviewProtection(req);
  if (preview) return withLocaleCookie(req, withSecurityHeaders(preview));

  const ipBlock = checkIpBlock(req);
  if (ipBlock) return withLocaleCookie(req, withSecurityHeaders(ipBlock));

  return withLocaleCookie(req, withSecurityHeaders(NextResponse.next()));
};

const clerkEnabledMiddleware = clerkMiddleware(async (auth, req) => {
  const preview = handlePreviewProtection(req);
  if (preview) return withLocaleCookie(req, withSecurityHeaders(preview));

  const ipBlock = checkIpBlock(req);
  if (ipBlock) return withLocaleCookie(req, withSecurityHeaders(ipBlock));

  if (isPublicRoute(req) || isClerkSignInRoute(req)) {
    return withLocaleCookie(req, withSecurityHeaders(NextResponse.next()));
  }

  // ✅ FIX: protect() gibt es bei deinem auth()-Typ nicht.
  // Stattdessen: wenn nicht eingeloggt -> redirect to sign-in
  const authState = await auth();
  const userId = authState.userId;

  if (!userId) {
    const signInUrl = new URL(clerkSignInUrl, req.url);
    signInUrl.searchParams.set("redirect_url", req.url);
    return withLocaleCookie(req, withSecurityHeaders(NextResponse.redirect(signInUrl)));
  }


  return withLocaleCookie(req, withSecurityHeaders(NextResponse.next()));
});

export default isClerkEnabled ? clerkEnabledMiddleware : fallbackMiddleware;

export const config = {
  matcher: [
    // alles außer statische Dateien
    "/((?!.+\\.[\\w]+$|_next).*)",
    "/",
    // optional: APIs / trpc
    "/(api|trpc)(.*)",
  ],
};
