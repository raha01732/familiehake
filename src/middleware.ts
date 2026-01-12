// src/middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Öffentliche Routen (ohne Login erreichbar) */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health",
]);

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isClerkEnabled = Boolean(clerkPublishableKey);

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
  const allowed = ["/_next", "/favicon.ico", "/robots.txt", "/api/health"];
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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.com https://*.clerk.services https://clerk.familiehake.de;",
      "connect-src 'self' https://*.clerk.com https://*.clerk.services https://clerk.familiehake.de https://*.supabase.co https://*.ingest.sentry.io;",
      "frame-ancestors 'none';",
      "frame-src https://*.clerk.com https://*.clerk.services https://clerk.familiehake.de;",
      "base-uri 'self';",
      "form-action 'self' https://*.clerk.com https://clerk.familiehake.de;",
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

const fallbackMiddleware = (req: NextRequest) => {
  const preview = handlePreviewProtection(req);
  if (preview) return withSecurityHeaders(preview);

  const ipBlock = checkIpBlock(req);
  if (ipBlock) return withSecurityHeaders(ipBlock);

  return withSecurityHeaders(NextResponse.next());
};

const clerkEnabledMiddleware = clerkMiddleware((auth, req) => {
  const preview = handlePreviewProtection(req);
  if (preview) return withSecurityHeaders(preview);

  const ipBlock = checkIpBlock(req);
  if (ipBlock) return withSecurityHeaders(ipBlock);

  if (isPublicRoute(req)) {
    return withSecurityHeaders(NextResponse.next());
  }

  auth().protect();

  return withSecurityHeaders(NextResponse.next());
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
