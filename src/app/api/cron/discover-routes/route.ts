// src/app/api/cron/discover-routes/route.ts
// Täglicher Scan: findet Seiten-Routen, die noch nicht in der Zugriffs-Matrix
// (access_rules) konfiguriert sind, legt sie mit "kein Zugriff" für alle
// Rollen an (sicherer Startwert) und benachrichtigt die Admins, damit die
// gewünschten Rechte manuell vergeben werden. Entspricht genau dem, was
// bisher passierte, wenn ein Admin /admin/settings öffnete und die
// "Zugriffs-Matrix" speicherte – nur automatisch statt bei Gelegenheit.
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { logCronRun } from "@/lib/cron-jobs";
import { reportError } from "@/lib/sentry";
import { createAdminClient } from "@/lib/supabase/admin";
import { discoverAppRoutes } from "@/lib/route-discovery";
import { normalizeRouteKey } from "@/lib/route-access";
import { ROUTE_DESCRIPTORS } from "@/lib/access-map";
import { notifyAdminsNewRoutes } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const startedAt = Date.now();

  if (!isAuthorizedCronRequest(req)) {
    await logCronRun({
      jobName: "discover-routes",
      request: req,
      success: false,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: "unauthorized",
    });
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const sb = createAdminClient();

    const [existingRes, rolesRes, discovered] = await Promise.all([
      sb.from("access_rules").select("route").throwOnError(),
      sb.from("roles").select("name").throwOnError(),
      discoverAppRoutes(),
    ]);

    const knownRoutes = new Set(
      (existingRes.data ?? [])
        .map((r: { route: string }) => normalizeRouteKey(String(r.route ?? "")))
        .filter(Boolean)
    );
    const roleNames = (rolesRes.data ?? [])
      .map((r: { name: string }) => String(r.name).trim().toLowerCase())
      .filter(Boolean);

    const candidateRoutes = new Set<string>();
    for (const descriptor of ROUTE_DESCRIPTORS) {
      const key = normalizeRouteKey(descriptor.route);
      if (key) candidateRoutes.add(key);
    }
    for (const route of discovered) {
      const key = normalizeRouteKey(route);
      if (key) candidateRoutes.add(key);
    }

    const newRoutes = Array.from(candidateRoutes)
      .filter((route) => !knownRoutes.has(route))
      .sort((a, b) => a.localeCompare(b));

    if (newRoutes.length > 0 && roleNames.length > 0) {
      const payload = newRoutes.flatMap((route) =>
        roleNames.map((role) => ({ route, role, allowed: false }))
      );
      const upsertRes = await sb.from("access_rules").upsert(payload, { onConflict: "route,role" });
      if (upsertRes.error) throw upsertRes.error;

      await notifyAdminsNewRoutes(newRoutes);
    }

    await logCronRun({
      jobName: "discover-routes",
      request: req,
      success: true,
      startedAt,
      durationMs: Date.now() - startedAt,
      details: { newRoutes, count: newRoutes.length },
    });

    return NextResponse.json({ ok: true, newRoutes });
  } catch (error) {
    await logCronRun({
      jobName: "discover-routes",
      request: req,
      success: false,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : "discover_routes_failed",
    });
    reportError(error, { cron: "discover-routes" });
    return NextResponse.json({ ok: false, error: "discover_routes_failed" }, { status: 500 });
  }
}
