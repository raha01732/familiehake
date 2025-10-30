import { authMiddleware } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Öffentliche Routen, die ohne Login erreichbar sein sollen.
 * Clerk ignoriert diese beim Auth-Check.
 */
const publicRoutes = ["/", "/sign-in(.*)", "/sign-up(.*)", "/api/health"];

/**
 * Preview-Schutz: aktiviert Basic Auth nur in Vercel Preview-Deployments.
 * Greift also NICHT lokal oder in Production.
 */
function handlePreviewProtection(req: NextRequest) {
  const url = new URL(req.url);
  const isPreview = process.env.VERCEL_ENV === "preview";

  if (!isPreview) return null; // keine Vorschau → nichts tun

  // manche Pfade sollen trotz Schutz erreichbar bleiben (Assets, API, Auth)
  const allowed = [
    "/_next",
    "/favicon.ico",
    "/robots.txt",
    "/api/health",
    "/sign-in",
    "/sign-up",
  ];
  if (allowed.some((p) => url.pathname.startsWith(p))) return null;

  // Basic Auth prüfen
  const authHeader = req.headers.get("authorization") || "";
  const [scheme, encoded] = authHeader.split(" ");

  if (scheme?.toLowerCase() !== "basic" || !encoded) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": "Basic realm=preview" },
    });
  }

  const [user, pass] = Buffer.from(encoded, "base64").toString().split(":");
  if (
    user !== process.env.PREVIEW_USER ||
    pass !== process.env.PREVIEW_PASS
  ) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return null; // Auth OK → weiter
}

/**
 * Kombinierte Middleware:
 *  - Preview-Schutz läuft vor der Clerk-Authentifizierung
 *  - Clerk übernimmt Login/Session-Handling
 */
export default authMiddleware({
  publicRoutes,
  beforeAuth: (req) => {
    const previewCheck = handlePreviewProtection(req);
    if (previewCheck) return previewCheck; // stoppe Request bei Preview-Auth-Fehler
    return NextResponse.next();
  },
  afterAuth: (auth, req) => {
    // falls du später z. B. Rollen oder Header prüfen willst
    return NextResponse.next();
  },
});

/**
 * Matcher: legt fest, für welche Routen die Middleware gilt
 * (alle außer statische Assets, _next, etc.)
 */
export const config = {
  matcher: [
    "/((?!.+\\.[\\w]+$|_next).*)",
    "/",
  ],
};
