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
  const { data } = await sb
    .from("dashboard_tiles")
    .select("title,body")
    .eq("id", "welcome")
    .maybeSingle();

  if (!data?.title && !data?.body) {
    return DEFAULT_WELCOME_TILE;
  }

  return {
    title: data.title ?? DEFAULT_WELCOME_TILE.title,
    body: data.body ?? DEFAULT_WELCOME_TILE.body,
  };
}

async function updateWelcomeTile(formData: FormData) {
  "use server";

  const user = await currentUser();
  const role = (user?.publicMetadata?.role as string | undefined)?.toLowerCase() ?? "user";
  const isAdmin =
    !!user &&
    (role === "admin" || role === "superadmin" || user.id === env().PRIMARY_SUPERADMIN_ID);

  if (!isAdmin) return;

  const titleInput = String(formData.get("title") ?? "").trim();
  const bodyInput = String(formData.get("body") ?? "").trim();
  if (!titleInput && !bodyInput) return;

  const existing = await getWelcomeTile();
  const title = titleInput || existing.title;
  const body = bodyInput || existing.body;

  const sb = createClient();

  await sb
    .from("dashboard_tiles")
    .upsert(
      {
        id: "welcome",
        title,
        body,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .throwOnError();

  revalidatePath("/dashboard");
}

export default async function DashboardPage() {
  const user = await currentUser();
  const session = await getSessionInfo();

  const role = (user?.publicMetadata?.role as string | undefined)?.toLowerCase() ?? "user";
  const isAdmin =
    !!user &&
    (role === "admin" || role === "superadmin" || user.id === env().PRIMARY_SUPERADMIN_ID);

  const health = isAdmin ? await getHealthSummary() : null;
  const healthStatus =
    (health?.status as "ok" | "warn" | "degraded" | "unreachable") ?? "unreachable";
  const healthLabel = healthStatus === "ok" ? "Keine Fehler" : "Fehler erkannt";

  const welcomeTile = await getWelcomeTile();

  const toolLinks = session.signedIn
    ? TOOL_LINKS.filter(
        (link) => session.isSuperAdmin || session.permissions[link.routeKey]
      )
    : [];

  const adminLinks = session.signedIn
    ? ADMIN_LINKS.filter(
        (link) => session.isSuperAdmin || session.permissions[link.routeKey]
      )
    : [];

  if (user) {
    await logAudit({
      action: "login_success",
      actorUserId: user.id,
      actorEmail: user.emailAddresses?.[0]?.emailAddress ?? null,
      target: "/dashboard",
    });
  }

  return (
    <RoleGate routeKey="dashboard">
      <section className="flex flex-col gap-6">
        <header className="card p-6 flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-zinc-100">
            {welcomeTile.title}
          </h1>
          <p className="text-zinc-400">{welcomeTile.body}</p>

          {isAdmin && (
            <form action={updateWelcomeTile} className="mt-4 grid gap-2">
              <input
                name="title"
                placeholder="Titel ändern"
                className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
              />
              <textarea
                name="body"
                placeholder="Text ändern"
                rows={3}
                className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
              />
              <button className="self-start rounded-lg border border-zinc-700 text-zinc-200 text-xs font-medium px-3 py-2 hover:bg-zinc-800/60">
                Speichern
              </button>
            </form>
          )}
        </header>

        {isAdmin && (
          <div className="card p-6 flex items-center justify-between">
            <div className="text-sm text-zinc-200">Systemstatus</div>
            <div className="text-xs text-zinc-400">{healthLabel}</div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {toolLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="card p-4 hover:bg-zinc-900/60"
            >
              <div className="text-sm font-medium text-zinc-100">
                {link.label}
              </div>
            </Link>
          ))}
        </div>

        {adminLinks.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {adminLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="card p-4 hover:bg-zinc-900/60"
              >
                <div className="text-sm font-medium text-zinc-100">
                  {link.label}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </RoleGate>
  );
}
