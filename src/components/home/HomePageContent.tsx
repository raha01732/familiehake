// /workspace/familiehake/src/components/home/HomePageContent.tsx
import RoleGate from "@/components/RoleGate";
import WelcomeTileCard, { WelcomeTile } from "@/components/dashboard/WelcomeTileCard";
import { logAudit } from "@/lib/audit";
import { getSessionInfo } from "@/lib/auth";
import { ADMIN_LINKS, TOOL_LINKS } from "@/lib/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import Link from "next/link";

type HealthSummary = {
  status: "ok" | "warn" | "degraded";
};

type HomePageContentProps = {
  auditTarget: "/" | "/dashboard";
};

const DEFAULT_WELCOME_TILE: WelcomeTile = {
  title: "Willkommen zurück!",
  body: "Schön, dass du da bist. Hier findest du deine freigeschalteten Tools und den Systemstatus.",
  titleColor: "#0f172a",
  bodyColor: "#334155",
  titleSize: 22,
  bodySize: 16,
};

const COLOR_PATTERN = /^#([0-9a-fA-F]{3}){1,2}$/;

function normalizeColor(input: string | null | undefined, fallback: string) {
  if (!input) return fallback;
  return COLOR_PATTERN.test(input) ? input : fallback;
}

function hexToRgb(input: string) {
  const normalized = input.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((segment) => segment + segment)
          .join("")
      : normalized;

  if (value.length !== 6) return null;
  const parsed = Number.parseInt(value, 16);
  if (Number.isNaN(parsed)) return null;
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function normalizeReadableColor(input: string | null | undefined, fallback: string) {
  const color = normalizeColor(input, fallback);
  const rgb = hexToRgb(color);
  if (!rgb) return fallback;
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance > 0.85 ? fallback : color;
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
  try {
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
      titleColor: normalizeReadableColor(data.title_color, DEFAULT_WELCOME_TILE.titleColor),
      bodyColor: normalizeReadableColor(data.body_color, DEFAULT_WELCOME_TILE.bodyColor),
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
  } catch (error) {
    console.error("[dashboard] failed to load welcome tile", error);
    return DEFAULT_WELCOME_TILE;
  }
}

async function updateWelcomeTile(formData: FormData) {
  "use server";

  const session = await getSessionInfo();
  const role = session.primaryRole?.name?.toLowerCase() ?? "user";
  const isAdmin =
    session.signedIn && (session.isSuperAdmin || session.roles.some((entry) => entry.name === "admin"));

  wtDebug("updateWelcomeTile called", {
    hasUser: session.signedIn,
    userId: session.userId,
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

  try {
    const sbAdmin = createAdminClient();

    await sbAdmin.from("dashboard_tile_versions").insert({
      tile_id: "welcome",
      title: existing.title,
      body: existing.body,
      changed_by: session.userId,
    });
  } catch (e) {
    console.error("[WELCOME_TILE VERSIONING] insert failed", e);
  }

  const title = titleInput || existing.title;
  const body = bodyInput || existing.body;
  const titleColor = normalizeReadableColor(titleColorInput, existing.titleColor);
  const bodyColor = normalizeReadableColor(bodyColorInput, existing.bodyColor);
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
    actorUserId: session.userId,
    actorEmail: session.email,
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

  revalidatePath("/");
  revalidatePath("/dashboard");
}

export default async function HomePageContent({ auditTarget }: HomePageContentProps) {
  const session = await getSessionInfo();
  const isAdmin =
    session.signedIn && (session.isSuperAdmin || session.roles.some((entry) => entry.name === "admin"));
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

  if (session.signedIn && session.userId) {
    await logAudit({
      action: "login_success",
      actorUserId: session.userId,
      actorEmail: session.email,
      target: auditTarget,
      detail: null,
    });
  }

  return (
    <RoleGate routeKey="dashboard">
      <section className="grid items-start gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="card relative flex flex-col gap-6 overflow-hidden p-5 lg:sticky lg:top-24">
          <div
            className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-blue-200/40 blur-2xl"
            aria-hidden
          />
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Workspace</p>
            <h2 className="text-xl font-semibold text-slate-900">Deine Schnellnavigation</h2>
            <nav className="flex flex-col gap-1">
              {toolLinks.length === 0 ? (
                <span className="text-xs text-slate-500">Keine Tools freigeschaltet</span>
              ) : (
                toolLinks.map((link) => (
                  <Link
                    key={link.routeKey}
                    href={link.href}
                    className="group rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-white hover:text-slate-900 hover:shadow-sm"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-300 transition group-hover:bg-blue-500" />
                      {link.label}
                    </span>
                  </Link>
                ))
              )}
            </nav>
          </div>
          {adminLinks.length > 0 && (
            <>
              <div className="h-px w-full bg-slate-200/80" aria-hidden />
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Admin</div>
                <nav className="flex flex-col gap-1">
                  {adminLinks.map((link) => (
                    <Link
                      key={link.routeKey}
                      href={link.href}
                      className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-white hover:text-slate-900 hover:shadow-sm"
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
              <div className="h-px w-full bg-slate-200/80" aria-hidden />
              <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">System-Health</div>
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-sm font-medium text-slate-800">Status</div>
                  <span
                    className={`rounded-lg border px-2 py-0.5 text-xs ${
                      healthStatus === "ok"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {healthLabel}
                  </span>
                </div>
                <Link
                  href="/monitoring"
                  className="inline-flex text-xs font-medium text-blue-700 underline underline-offset-4 hover:text-blue-500"
                >
                  Zum Monitoring →
                </Link>
              </div>
            </>
          ) : null}
        </aside>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_280px]">
          <WelcomeTileCard tile={welcomeTile} isAdmin={isAdmin} onSave={updateWelcomeTile} />
          <div className="card flex flex-col gap-3 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Heute im Fokus</p>
            <h3 className="text-2xl font-semibold text-slate-900">Schnell starten ohne Umwege</h3>
            <p className="text-sm leading-relaxed text-slate-700">
              Nutze die Navigation links, um direkt zu Journal, Kalender oder Nachrichten zu springen. Die Oberfläche
              wurde bewusst heller und klarer gestaltet, damit Inhalte schneller lesbar sind.
            </p>
            <Link
              href="/tools"
              className="mt-2 inline-flex w-fit items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Zu allen Tools
            </Link>
          </div>
        </div>
      </section>
    </RoleGate>
  );
}
