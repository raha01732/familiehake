import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Öffentliche Routen ohne Login */
const publicRoutes = ["/", "/sign-in(.*)", "/sign-up(.*)", "/api/health"];

/** Optional: IP-Denylist (kommasepariert in ENV: BLOCKED_IPS="1.2.3.4,5.6.7.8") */
const BLOCKED_IPS =
  (process.env.BLOCKED_IPS ?? "")
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

/** Security Headers */
function withSecurityHeaders(res: NextResponse) {
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self';",
      "img-src 'self' data: blob: https://images.clerk.dev https://img.clerk.com;",
      "style-src 'self' 'unsafe-inline';",
      "font-src 'self' data:;",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.com https://*.clerk.services;",
      "connect-src 'self' https://*.clerk.com https://*.clerk.services https://*.supabase.co https://*.ingest.sentry.io;",
      "frame-ancestors 'none';",
      "frame-src https://*.clerk.com https://*.clerk.services;",
      "base-uri 'self';",
      "form-action 'self' https://*.clerk.com;",
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
    (req as any).ip ||
    "";
  if (ip && BLOCKED_IPS.includes(ip)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return null;
}

export default clerkMiddleware(async (auth, req) => {
  // Preview Basic Auth
  const preview = handlePreviewProtection(req);
  if (preview) return withSecurityHeaders(preview);

  // IP-Block optional
  const ipBlock = checkIpBlock(req);
  if (ipBlock) return withSecurityHeaders(ipBlock);

  // Clerk Auth Flow läuft hier weiter
  return withSecurityHeaders(NextResponse.next());
}, { publicRoutes });

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/"],
};
