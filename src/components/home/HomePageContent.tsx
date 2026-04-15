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
      <section className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">

        {/* Sidebar */}
        <aside className="card relative flex flex-col gap-5 overflow-hidden p-5 lg:sticky lg:top-24">
          {/* Hintergrund-Glow */}
          <div
            className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full blur-3xl"
            style={{ background: "hsl(var(--primary) / 0.12)" }}
            aria-hidden
          />

          {/* Tool-Links */}
          <div className="space-y-2">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Workspace
            </p>
            <h2
              className="text-base font-semibold"
              style={{ color: "hsl(var(--foreground))" }}
            >
              Schnellnavigation
            </h2>
            <nav className="mt-1 flex flex-col gap-0.5">
              {toolLinks.length === 0 ? (
                <span
                  className="text-xs"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  Keine Tools freigeschaltet
                </span>
              ) : (
                toolLinks.map((link) => (
                  <Link
                    key={link.routeKey}
                    href={link.href}
                    className="nav-link flex items-center gap-2 px-3 py-2.5 text-sm font-medium"
                  >
                    <span
                      className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                      style={{ background: "hsl(var(--primary) / 0.4)" }}
                    />
                    {link.label}
                  </Link>
                ))
              )}
            </nav>
          </div>

          {/* Admin-Links */}
          {adminLinks.length > 0 && (
            <>
              <div
                className="h-px w-full"
                style={{ background: "hsl(var(--border))" }}
                aria-hidden
              />
              <div className="space-y-2">
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.15em]"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  Admin
                </p>
                <nav className="flex flex-col gap-0.5">
                  {adminLinks.map((link) => (
                    <Link
                      key={link.routeKey}
                      href={link.href}
                      className="nav-link px-3 py-2.5 text-sm font-medium"
                    >
                      {link.label}
                    </Link>
                  ))}
                </nav>
              </div>
            </>
          )}

          {/* System-Health */}
          {isAdmin && (
            <>
              <div
                className="h-px w-full"
                style={{ background: "hsl(var(--border))" }}
                aria-hidden
              />
              <div
                className="space-y-3 rounded-2xl p-3.5"
                style={{
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                }}
              >
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.15em]"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  System-Health
                </p>
                <div
                  className="flex items-center justify-between rounded-xl p-3"
                  style={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  }}
                >
                  <span
                    className="text-sm font-medium"
                    style={{ color: "hsl(var(--foreground))" }}
                  >
                    Status
                  </span>
                  <span
                    className={`rounded-lg px-2 py-0.5 text-xs font-medium ${
                      healthStatus === "ok"
                        ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {healthLabel}
                  </span>
                </div>
                <Link
                  href="/monitoring"
                  className="inline-flex text-xs font-medium underline underline-offset-4 transition-opacity hover:opacity-70"
                  style={{ color: "hsl(var(--primary))" }}
                >
                  Zum Monitoring →
                </Link>
              </div>
            </>
          )}
        </aside>

        {/* Haupt-Inhalt */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
          <WelcomeTileCard tile={welcomeTile} isAdmin={isAdmin} onSave={updateWelcomeTile} />

          {/* Quick-Start Card */}
          <div className="soft-surface flex flex-col gap-4 p-6">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.15em]"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Heute im Fokus
            </p>
            <h3
              className="text-xl font-semibold leading-snug"
              style={{ color: "hsl(var(--foreground))" }}
            >
              Schnell starten
            </h3>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Nutze die Navigation links, um direkt zu deinen Tools zu springen.
            </p>
            <Link
              href="/tools"
              className="brand-button mt-auto inline-flex w-fit items-center rounded-xl px-4 py-2.5 text-sm font-semibold"
            >
              Zu allen Tools →
            </Link>
          </div>
        </div>
      </section>
    </RoleGate>
  );
}
