// src/app/dashboard/page.tsx
import RoleGate from "@/components/RoleGate";
import { currentUser } from "@clerk/nextjs/server";
import { logAudit } from "@/lib/audit";
import { getSessionInfo } from "@/lib/auth";
import { env } from "@/lib/env";
import { ADMIN_LINKS, TOOL_LINKS } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import Link from "next/link";

export const metadata = { title: "Dashboard | Private Tools" };

type HealthSummary = {
  status: "ok" | "warn" | "degraded";
};

type WelcomeTile = {
  title: string;
  body: string;
};

const DEFAULT_WELCOME_TILE: WelcomeTile = {
  title: "Willkommen zurück!",
  body: "Schön, dass du da bist. Hier findest du deine freigeschalteten Tools und den Systemstatus.",
};

async function getHealthSummary(): Promise<HealthSummary | null> {
  try {
    const h = headers();
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
  const sb = createClient();
  const { data } = await sb.from("dashboard_tiles").select("title,body").eq("id", "welcome").maybeSingle();
  if (!data?.title && !data?.body) {
    return DEFAULT_WELCOME_TILE;
  }
  return {
    title: data.title ?? DEFAULT_WELCOME_TILE.title,
    body: data.body ?? DEFAULT_WELCOME_TILE.body
  };
}

async function updateWelcomeTile(formData: FormData) {
  "use server";
  const user = await currentUser();
  const role = (user?.publicMetadata?.role as string | undefined)?.toLowerCase() ?? "user";
  const isAdmin =
    !!user && (role === "admin" || role === "superadmin" || user.id === env().PRIMARY_SUPERADMIN_ID);
  if (!isAdmin) return;

  const titleInput = String(formData.get("title") ?? "").trim();
  const bodyInput = String(formData.get("body") ?? "").trim();
  if (!titleInput && !bodyInput) return;

  const existing = await getWelcomeTile();
  const title = titleInput || existing.title;
  const body = bodyInput || existing.body;

  const sb = createClient();
  await sb.from("dashboard_tiles").upsert(
    {
      id: "welcome",
      title,
      body,
      updated_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );
   await sb.from("dashboard_tiles").upsert(...).throwOnError();

  revalidatePath("/dashboard");
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
      detail: null
    });
  }

  return (
    <RoleGate routeKey="dashboard">
      <section className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="card p-4 flex flex-col gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Tools</div>
            <nav className="mt-2 flex flex-col gap-1">
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
              <div className="text-zinc-600 text-xs">----</div>
              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-500">Admin</div>
                <nav className="mt-2 flex flex-col gap-1">
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
        </aside>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="card p-6 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-semibold text-zinc-100">{welcomeTile.title}</h2>
              {isAdmin ? (
                <span className="text-[11px] text-zinc-500">Admin editierbar</span>
              ) : null}
            </div>
            <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-wrap">{welcomeTile.body}</p>
            {isAdmin ? (
              <form action={updateWelcomeTile} className="mt-3 grid gap-2">
                <input
                  name="title"
                  defaultValue={welcomeTile.title}
                  className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                />
                <textarea
                  name="body"
                  defaultValue={welcomeTile.body}
                  rows={4}
                  className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                />
                <button
                  type="submit"
                  className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900"
                >
                  Speichern
                </button>
              </form>
            ) : null}
          </div>

          {isAdmin ? (
            <div className="card p-6 flex flex-col gap-3">
              <div>
                <h3 className="text-lg font-semibold text-zinc-100">System-Health</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Kurzüberblick aus dem Monitoring – nur für Admins.
                </p>
              </div>
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
                className="text-sm text-zinc-200 hover:text-white underline underline-offset-4"
              >
                Zum Monitoring →
              </Link>
            </div>
          ) : null}
        </div>
        {isAdmin ? (
          <div className="card p-6 flex flex-col gap-3">
            <div>
              <h3 className="text-lg font-semibold text-zinc-100">System-Health</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Kurzüberblick aus dem Monitoring – nur für Admins.
              </p>
            </div>
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
              className="text-sm text-zinc-200 hover:text-white underline underline-offset-4"
            >
              Zum Monitoring →
            </Link>
          </div>
        ) : null}
      </section>
    </RoleGate>
  );
}
