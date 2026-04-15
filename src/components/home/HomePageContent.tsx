import RoleGate from "@/components/RoleGate";
import WelcomeTileCard, { WelcomeTile } from "@/components/dashboard/WelcomeTileCard";
import { logAudit } from "@/lib/audit";
import { getSessionInfo } from "@/lib/auth";
import { ADMIN_LINKS, TOOL_LINKS } from "@/lib/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import Link from "next/link";
import {
  Activity,
  BarChart2,
  BookOpen,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Film,
  FolderOpen,
  HardDrive,
  MessageSquare,
  Monitor,
  Settings2,
  ShieldCheck,
  Users,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

// ─── Icon-Map für Tool- und Admin-Links ────────────────────────────
const TOOL_ICON_MAP: Record<string, LucideIcon> = {
  "tools/files":       FolderOpen,
  "tools/journal":     BookOpen,
  "tools/dispoplaner": Film,
  "tools/dienstplaner":CalendarClock,
  "tools/calender":    Calendar,
  "tools/messages":    MessageSquare,
  "tools/storage":     HardDrive,
  "tools/system":      Monitor,
};

const ADMIN_ICON_MAP: Record<string, LucideIcon> = {
  "admin":           ShieldCheck,
  "admin/users":     Users,
  "admin/settings":  Settings2,
  "monitoring":      Activity,
  "activity":        BarChart2,
};

// ─── Typen & Konstanten ────────────────────────────────────────────
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
      ? normalized.split("").map((s) => s + s).join("")
      : normalized;
  if (value.length !== 6) return null;
  const parsed = Number.parseInt(value, 16);
  if (Number.isNaN(parsed)) return null;
  return { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 };
}

function normalizeReadableColor(input: string | null | undefined, fallback: string) {
  const color = normalizeColor(input, fallback);
  const rgb = hexToRgb(color);
  if (!rgb) return fallback;
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance > 0.85 ? fallback : color;
}

function normalizeFontSize(
  input: string | null | undefined,
  fallback: number,
  min: number,
  max: number
) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

// Debug-Logging (aktiv mit DEBUG_WELCOME_TILES=1)
function wtDebug(tag: string, payload?: Record<string, unknown>) {
  if (process.env.DEBUG_WELCOME_TILES !== "1") return;
  try { console.log(`[WELCOME_TILE DEBUG] ${tag}`, payload ?? {}); } catch { /* no-op */ }
}

// ─── Datenabruf ────────────────────────────────────────────────────
async function getHealthSummary(): Promise<HealthSummary | null> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (!host) return null;
    const res = await fetch(`${proto}://${host}/api/health`, { cache: "no-store" });
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
      error: error ? { message: error.message } : null,
    });

    if (!data?.title && !data?.body) return DEFAULT_WELCOME_TILE;

    return {
      title: data.title ?? DEFAULT_WELCOME_TILE.title,
      body: data.body ?? DEFAULT_WELCOME_TILE.body,
      titleColor: normalizeReadableColor(data.title_color, DEFAULT_WELCOME_TILE.titleColor),
      bodyColor: normalizeReadableColor(data.body_color, DEFAULT_WELCOME_TILE.bodyColor),
      titleSize: normalizeFontSize(
        data.title_size ? String(data.title_size) : null,
        DEFAULT_WELCOME_TILE.titleSize, 14, 40
      ),
      bodySize: normalizeFontSize(
        data.body_size ? String(data.body_size) : null,
        DEFAULT_WELCOME_TILE.bodySize, 12, 24
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
  const isAdmin =
    session.signedIn &&
    (session.isSuperAdmin || session.roles.some((r) => r.name === "admin"));

  wtDebug("updateWelcomeTile called", { userId: session.userId, isAdmin });
  if (!isAdmin) { wtDebug("updateWelcomeTile blocked", { reason: "not_admin" }); return; }

  const titleInput      = String(formData.get("title") ?? "").trim();
  const bodyInput       = String(formData.get("body") ?? "").trim();
  const titleColorInput = String(formData.get("titleColor") ?? "").trim();
  const bodyColorInput  = String(formData.get("bodyColor") ?? "").trim();
  const titleSizeInput  = String(formData.get("titleSize") ?? "").trim();
  const bodySizeInput   = String(formData.get("bodySize") ?? "").trim();

  if (!titleInput && !bodyInput && !titleColorInput && !bodyColorInput && !titleSizeInput && !bodySizeInput) {
    wtDebug("updateWelcomeTile early_return", { reason: "empty_inputs" });
    return;
  }

  const existing = await getWelcomeTile();

  try {
    await createAdminClient().from("dashboard_tile_versions").insert({
      tile_id: "welcome",
      title: existing.title,
      body: existing.body,
      changed_by: session.userId,
    });
  } catch (e) {
    console.error("[WELCOME_TILE VERSIONING] insert failed", e);
  }

  const title      = titleInput || existing.title;
  const body       = bodyInput  || existing.body;
  const titleColor = normalizeReadableColor(titleColorInput, existing.titleColor);
  const bodyColor  = normalizeReadableColor(bodyColorInput, existing.bodyColor);
  const titleSize  = normalizeFontSize(titleSizeInput, existing.titleSize, 14, 40);
  const bodySize   = normalizeFontSize(bodySizeInput, existing.bodySize, 12, 24);

  const { error } = await createAdminClient().from("dashboard_tiles").upsert(
    {
      id: "welcome",
      title, body,
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
      before: { title: existing.title, body: existing.body, titleColor: existing.titleColor, bodyColor: existing.bodyColor, titleSize: existing.titleSize, bodySize: existing.bodySize },
      after:  { title, body, titleColor, bodyColor, titleSize, bodySize },
    },
  });

  wtDebug("updateWelcomeTile upsert_result", { ok: !error });
  revalidatePath("/");
  revalidatePath("/dashboard");
}

// ─── Haupt-Komponente ──────────────────────────────────────────────
export default async function HomePageContent({ auditTarget }: HomePageContentProps) {
  const session = await getSessionInfo();
  const isAdmin =
    session.signedIn &&
    (session.isSuperAdmin || session.roles.some((r) => r.name === "admin"));

  const health = isAdmin ? await getHealthSummary() : null;
  const healthStatus = (health?.status as "ok" | "warn" | "degraded" | "unreachable") ?? "unreachable";
  const welcomeTile = await getWelcomeTile();

  const toolLinks = session.signedIn
    ? TOOL_LINKS.filter((l) => session.isSuperAdmin || session.permissions[l.routeKey])
    : [];
  const adminLinks = session.signedIn
    ? ADMIN_LINKS.filter((l) => session.isSuperAdmin || session.permissions[l.routeKey])
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
      <section className="grid items-start gap-6 lg:grid-cols-[272px_minmax(0,1fr)]">

        {/* ── Sidebar ─────────────────────────────── */}
        <aside className="card relative flex flex-col gap-5 overflow-hidden p-5 lg:sticky lg:top-24">
          {/* Hintergrund-Glow */}
          <div
            className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full blur-3xl"
            style={{ background: "hsl(var(--primary) / 0.1)" }}
            aria-hidden
          />

          {/* Tool-Links */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em]"
               style={{ color: "hsl(var(--muted-foreground))" }}>
              Workspace
            </p>
            <nav className="flex flex-col gap-0.5">
              {toolLinks.length === 0 ? (
                <span className="px-3 py-2 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Keine Tools freigeschaltet
                </span>
              ) : (
                toolLinks.map((link) => {
                  const Icon = TOOL_ICON_MAP[link.routeKey];
                  return (
                    <Link
                      key={link.routeKey}
                      href={link.href}
                      className="nav-link flex items-center gap-2.5 px-3 py-2 text-sm font-medium"
                    >
                      {Icon && (
                        <span
                          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg"
                          style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}
                        >
                          <Icon size={13} strokeWidth={2.2} aria-hidden />
                        </span>
                      )}
                      {link.label}
                    </Link>
                  );
                })
              )}
            </nav>
          </div>

          {/* Admin-Links */}
          {adminLinks.length > 0 && (
            <>
              <div className="h-px w-full" style={{ background: "hsl(var(--border))" }} aria-hidden />
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                   style={{ color: "hsl(var(--muted-foreground))" }}>
                  Admin
                </p>
                <nav className="flex flex-col gap-0.5">
                  {adminLinks.map((link) => {
                    const Icon = ADMIN_ICON_MAP[link.routeKey];
                    return (
                      <Link
                        key={link.routeKey}
                        href={link.href}
                        className="nav-link-muted flex items-center gap-2.5 px-3 py-2 text-sm font-medium"
                      >
                        {Icon && (
                          <span
                            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg"
                            style={{ background: "hsl(var(--muted) / 0.8)", color: "hsl(var(--muted-foreground))" }}
                          >
                            <Icon size={13} strokeWidth={2.2} aria-hidden />
                          </span>
                        )}
                        {link.label}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </>
          )}

          {/* System-Health */}
          {isAdmin && (
            <>
              <div className="h-px w-full" style={{ background: "hsl(var(--border))" }} aria-hidden />
              <div
                className="space-y-3 rounded-2xl p-3.5"
                style={{ background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))" }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                   style={{ color: "hsl(var(--muted-foreground))" }}>
                  System-Health
                </p>
                <div
                  className="flex items-center justify-between rounded-xl px-3 py-2.5"
                  style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                >
                  <span className="flex items-center gap-2 text-sm font-medium"
                        style={{ color: "hsl(var(--foreground))" }}>
                    {healthStatus === "ok" ? (
                      <CheckCircle2 size={14} className="text-emerald-500" aria-hidden />
                    ) : (
                      <AlertTriangle size={14} className="text-amber-500" aria-hidden />
                    )}
                    Status
                  </span>
                  <span
                    className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${
                      healthStatus === "ok"
                        ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {healthStatus === "ok" ? "Keine Fehler" : "Fehler erkannt"}
                  </span>
                </div>
                <Link
                  href="/monitoring"
                  className="inline-flex text-xs font-medium transition-opacity hover:opacity-70"
                  style={{ color: "hsl(var(--primary))" }}
                >
                  Zum Monitoring →
                </Link>
              </div>
            </>
          )}
        </aside>

        {/* ── Haupt-Inhalt ────────────────────────── */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_240px]">
          <WelcomeTileCard tile={welcomeTile} isAdmin={isAdmin} onSave={updateWelcomeTile} />

          {/* Quick-Access */}
          <div className="soft-surface flex flex-col gap-4 p-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                 style={{ color: "hsl(var(--muted-foreground))" }}>
                Schnellstart
              </p>
              <h3 className="mt-1 text-base font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                Heute im Fokus
              </h3>
            </div>

            {toolLinks.length > 0 ? (
              <div className="flex flex-col gap-2">
                {toolLinks.slice(0, 4).map((link) => {
                  const Icon = TOOL_ICON_MAP[link.routeKey];
                  return (
                    <Link
                      key={link.routeKey}
                      href={link.href}
                      className="group flex items-center gap-3 rounded-xl p-3 transition-all"
                      style={{ border: "1px solid hsl(var(--border) / 0.7)", background: "hsl(var(--card) / 0.6)" }}
                      onMouseEnter={undefined}
                    >
                      {Icon && (
                        <span
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-110"
                          style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}
                        >
                          <Icon size={15} strokeWidth={2} aria-hidden />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
                          {link.label}
                        </p>
                        {link.description && (
                          <p className="truncate text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                            {link.description}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
                {toolLinks.length > 4 && (
                  <Link
                    href="/tools"
                    className="rounded-xl px-3 py-2 text-center text-xs font-medium transition-opacity hover:opacity-70"
                    style={{ color: "hsl(var(--primary))" }}
                  >
                    +{toolLinks.length - 4} weitere Tools →
                  </Link>
                )}
              </div>
            ) : (
              <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                Nutze die Navigation links, um direkt zu deinen Tools zu springen.
              </p>
            )}

            <Link
              href="/tools"
              className="brand-button mt-auto inline-flex w-full items-center justify-center rounded-xl py-2.5 text-sm font-semibold"
            >
              Alle Tools →
            </Link>
          </div>
        </div>
      </section>
    </RoleGate>
  );
}
