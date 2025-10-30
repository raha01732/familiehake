import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/** Öffentlich zugängliche Routen (ohne Login) */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health",
]);

/** Preview-Schutz (Basic Auth) – nur in Vercel Preview aktiv */
function handlePreviewProtection(req: NextRequest) {
  const url = new URL(req.url);
  const isPreview = process.env.VERCEL_ENV === "preview";
  if (!isPreview) return null;

  // in Preview frei lassen:
  const allowed = [
    "/_next",
    "/favicon.ico",
    "/robots.txt",
    "/sign-in",
    "/sign-up",
    "/api/health",
  ];
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

/** Kombiniert: Preview-Check vor Auth, dann Clerk-Protection für nicht-öffentliche Routen */
export default clerkMiddleware((auth, req) => {
  const previewCheck = handlePreviewProtection(req);
  if (previewCheck) return previewCheck;

  if (!isPublicRoute(req)) {
    auth().protect(); // Login/Session erforderlich
  }
  return NextResponse.next();
});

/** Für welche Pfade gilt die Middleware */
export const config = {
  matcher: [
    // alles außer statische Dateien und _next
    "/((?!.+\\.[\\w]+$|_next).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
};
