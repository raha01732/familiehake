// /workspace/familiehake/src/app/dashboard/page.tsx
import RoleGate from "@/components/RoleGate";
import WelcomeTileCard, { WelcomeTile } from "@/components/dashboard/WelcomeTileCard";
import { currentUser } from "@clerk/nextjs/server";
import { logAudit } from "@/lib/audit";
import { getSessionInfo } from "@/lib/auth";
import { env } from "@/lib/env";
import { ADMIN_LINKS, TOOL_LINKS } from "@/lib/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import Link from "next/link";

export const metadata = { title: "Dashboard | Private Tools" };

type HealthSummary = {
  status: "ok" | "warn" | "degraded";
};

const DEFAULT_WELCOME_TILE: WelcomeTile = {
  title: "Willkommen zurück!",
  body: "Schön, dass du da bist. Hier findest du deine freigeschalteten Tools und den Systemstatus.",
  titleColor: "#f4f4f5",
  bodyColor: "#a1a1aa",
  titleSize: 22,
  bodySize: 14,
};

const COLOR_PATTERN = /^#([0-9a-fA-F]{3}){1,2}$/;

function normalizeColor(input: string | null | undefined, fallback: string) {
  if (!input) return fallback;
  return COLOR_PATTERN.test(input) ? input : fallback;
}

function normalizeFontSize(input: string | null | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

// ===================== WELCOME TILE DEBUG START =====================
// Aktivieren über Env: DEBUG_WELCOME_TILES=1
function wtDebug(tag: string, payload?: Record<string, any>) {
  if (process.env.DEBUG_WELCOME_TILES !== "1") return;
  try {
    console.log(`[WELCOME_TILE DEBUG] ${tag}`, payload ?? {});
  } catch {
    // no-op
  }
}
// ===================== WELCOME TILE DEBUG END =====================

async function getHealthSummary(): Promise<HealthSummary | null> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (!host) return null;
    const base = `${proto}://${host}`;
    const res = await fetch(`${base}/api/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as HealthSummary;
  } catch {
    return null;
  }
}

async function getWelcomeTile(): Promise<WelcomeTile> {
  const sb = createAdminClient();

  const { data, error } = await sb
    .from("dashboard_tiles")
    .select("title,body,title_color,body_color,title_size,body_size")
    .eq("id", "welcome")
    .maybeSingle();

  wtDebug("getWelcomeTile result", {
    hasData: !!data,
    titleLen: data?.title ? String(data.title).length : 0,
    bodyLen: data?.body ? String(data.body).length : 0,
    error: error
      ? { message: error.message, code: (error as any).code, details: (error as any).details }
      : null,
  });

  if (!data?.title && !data?.body) {
    wtDebug("getWelcomeTile fallback_used", { reason: "no_title_and_no_body" });
    return DEFAULT_WELCOME_TILE;
  }

  return {
    title: data.title ?? DEFAULT_WELCOME_TILE.title,
    body: data.body ?? DEFAULT_WELCOME_TILE.body,
    titleColor: normalizeColor(data.title_color, DEFAULT_WELCOME_TILE.titleColor),
    bodyColor: normalizeColor(data.body_color, DEFAULT_WELCOME_TILE.bodyColor),
    titleSize: normalizeFontSize(
      data.title_size ? String(data.title_size) : null,
      DEFAULT_WELCOME_TILE.titleSize,
      14,
      40
    ),
    bodySize: normalizeFontSize(
      data.body_size ? String(data.body_size) : null,
      DEFAULT_WELCOME_TILE.bodySize,
      12,
      24
    ),
  };
}

async function updateWelcomeTile(formData: FormData) {
  "use server";

  const user = await currentUser();
  const role = (user?.publicMetadata?.role as string | undefined)?.toLowerCase() ?? "user";
  const isAdmin =
    !!user && (role === "admin" || role === "superadmin" || user.id === env().PRIMARY_SUPERADMIN_ID);

  wtDebug("updateWelcomeTile called", {
    hasUser: !!user,
    userId: user?.id ?? null,
    role,
    isAdmin,
  });

  if (!isAdmin) {
    wtDebug("updateWelcomeTile blocked", { reason: "not_admin" });
    return;
  }

  const titleInput = String(formData.get("title") ?? "").trim();
  const bodyInput = String(formData.get("body") ?? "").trim();
  const titleColorInput = String(formData.get("titleColor") ?? "").trim();
  const bodyColorInput = String(formData.get("bodyColor") ?? "").trim();
  const titleSizeInput = String(formData.get("titleSize") ?? "").trim();
  const bodySizeInput = String(formData.get("bodySize") ?? "").trim();

  wtDebug("updateWelcomeTile inputs", {
    titleLen: titleInput.length,
    bodyLen: bodyInput.length,
    titleColor: titleColorInput || null,
    bodyColor: bodyColorInput || null,
    titleSize: titleSizeInput || null,
    bodySize: bodySizeInput || null,
    titlePreview: titleInput.slice(0, 80),
    bodyPreview: bodyInput.slice(0, 80),
  });

  if (
    !titleInput &&
    !bodyInput &&
    !titleColorInput &&
    !bodyColorInput &&
    !titleSizeInput &&
    !bodySizeInput
  ) {
    wtDebug("updateWelcomeTile early_return", { reason: "empty_inputs" });
    return;
  }

  const existing = await getWelcomeTile();

  // ===================== WELCOME TILE VERSIONING START =====================
  try {
    const sbAdmin = createAdminClient();

    await sbAdmin.from("dashboard_tile_versions").insert({
      tile_id: "welcome",
      title: existing.title,
      body: existing.body,
      changed_by: user?.id ?? null,
    });
  } catch (e) {
    console.error("[WELCOME_TILE VERSIONING] insert failed", e);
  }
  // ===================== WELCOME TILE VERSIONING END =====================

  const title = titleInput || existing.title;
  const body = bodyInput || existing.body;
  const titleColor = normalizeColor(titleColorInput, existing.titleColor);
  const bodyColor = normalizeColor(bodyColorInput, existing.bodyColor);
  const titleSize = normalizeFontSize(titleSizeInput, existing.titleSize, 14, 40);
  const bodySize = normalizeFontSize(bodySizeInput, existing.bodySize, 12, 24);

  const sb = createAdminClient();

  const { error } = await sb.from("dashboard_tiles").upsert(
    {
      id: "welcome",
      title,
      body,
      title_color: titleColor,
      body_color: bodyColor,
      title_size: titleSize,
      body_size: bodySize,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  await logAudit({
    action: "dashboard_welcome_update",
    actorUserId: user.id,
    actorEmail: user.emailAddresses?.[0]?.emailAddress ?? null,
    target: "dashboard_tiles:welcome",
    detail: {
      before: {
        title: existing.title,
        body: existing.body,
        titleColor: existing.titleColor,
        bodyColor: existing.bodyColor,
        titleSize: existing.titleSize,
        bodySize: existing.bodySize,
      },
      after: {
        title,
        body,
        titleColor,
        bodyColor,
        titleSize,
        bodySize,
      },
    },
  });

  wtDebug("updateWelcomeTile upsert_result", {
    ok: !error,
    error: error
      ? { message: error.message, code: (error as any).code, details: (error as any).details }
      : null,
    savedTitleLen: title.length,
    savedBodyLen: body.length,
  });

  revalidatePath("/dashboard");
  revalidatePath("/");
}

export default async function DashboardPage() {
  // Login-Success (einfachheitshalber bei jedem Dashboard-Aufruf – später optional mit Cookie drosseln)
  const user = await currentUser();
  const session = await getSessionInfo();
  const role = (user?.publicMetadata?.role as string | undefined)?.toLowerCase() ?? "user";
  const isAdmin =
    !!user && (role === "admin" || role === "superadmin" || user.id === env().PRIMARY_SUPERADMIN_ID);
  const health = isAdmin ? await getHealthSummary() : null;
  const healthStatus = (health?.status as "ok" | "warn" | "degraded" | "unreachable") ?? "unreachable";
  const healthLabel = healthStatus === "ok" ? "Keine Fehler" : "Fehler erkannt";
  const welcomeTile = await getWelcomeTile();
  const toolLinks = session.signedIn
    ? TOOL_LINKS.filter((link) => session.isSuperAdmin || session.permissions[link.routeKey])
    : [];
  const adminLinks = session.signedIn
    ? ADMIN_LINKS.filter((link) => session.isSuperAdmin || session.permissions[link.routeKey])
    : [];
  if (user) {
    await logAudit({
      action: "login_success",
      actorUserId: user.id,
      actorEmail: user.emailAddresses?.[0]?.emailAddress ?? null,
      target: "/dashboard",
      detail: null,
    });
  }

  return (
    <RoleGate routeKey="dashboard">
      <section className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="card flex flex-col gap-5 p-4 lg:sticky lg:top-24">
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Tools</div>
            <nav className="flex flex-col gap-1">
              {toolLinks.length === 0 ? (
                <span className="text-xs text-zinc-500">Keine Tools freigeschaltet</span>
              ) : (
                toolLinks.map((link) => (
                  <Link
                    key={link.routeKey}
                    href={link.href}
                    className="rounded-md px-2 py-1 text-sm text-zinc-200 hover:bg-zinc-900/60 hover:text-white"
                  >
                    {link.label}
                  </Link>
                ))
              )}
            </nav>
          </div>
          {adminLinks.length > 0 && (
            <>
              <div className="h-px w-full bg-white/10" aria-hidden />
              <div className="space-y-3">
                <div className="text-xs uppercase tracking-wide text-zinc-500">Admin</div>
                <nav className="flex flex-col gap-1">
                  {adminLinks.map((link) => (
                    <Link
                      key={link.routeKey}
                      href={link.href}
                      className="rounded-md px-2 py-1 text-sm text-zinc-200 hover:bg-zinc-900/60 hover:text-white"
                    >
                      {link.label}
                    </Link>
                  ))}
                </nav>
              </div>
            </>
          )}
          {isAdmin ? (
            <>
              <div className="h-px w-full bg-white/10" aria-hidden />
              <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                <div className="text-xs uppercase tracking-wide text-zinc-500">System-Health</div>
                <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="text-sm text-zinc-200">Status</div>
                  <span
                    className={`rounded-lg border px-2 py-0.5 text-xs ${
                      healthStatus === "ok"
                        ? "border-green-700 text-green-300 bg-green-900/20"
                        : "border-amber-600 text-amber-300 bg-amber-900/20"
                    }`}
                  >
                    {healthLabel}
                  </span>
                </div>
                <Link
                  href="/monitoring"
                  className="inline-flex text-xs text-zinc-300 underline underline-offset-4 hover:text-white"
                >
                  Zum Monitoring →
                </Link>
              </div>
            </>
          ) : null}
        </aside>

        <div className="grid gap-6 md:grid-cols-2">
          <WelcomeTileCard tile={welcomeTile} isAdmin={isAdmin} onSave={updateWelcomeTile} />
        </div>
      </section>
    </RoleGate>
  );
}
