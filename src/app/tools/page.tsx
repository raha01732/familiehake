// src/app/tools/page.tsx
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Werkzeuge" };

const LEVEL_NONE = 0;
const LEVEL_READ = 1;

const ALL_TOOLS = [
  {
    routeKey: "tools/files",
    href: "/tools/files",
    title: "Dateien",
    description: "Ablage, Ordner, Freigaben & Papierkorb",
  },
  {
    routeKey: "tools/journal",
    href: "/tools/journal",
    title: "Journal",
    description: "Privates Tagebuch mit Markdown & Suche",
  },
  {
    routeKey: "tools/dispoplaner",
    href: "/tools/dispoplaner",
    title: "Dispoplaner",
    description: "Kinovorstellungen Wochenplan",
  },
];

function normalizeKey(key: string) {
  return key.replace(/^\/+/, "").replace(/\/{2,}/g, "/").trim();
}

async function getAllowedRoutesForRole(role: string) {
  const sb = createAdminClient();
  const { data: roleData } = await sb
    .from("roles")
    .select("id")
    .eq("name", role)
    .single();

  if (!roleData) return new Map();

  const { data: perms } = await sb
    .from("role_permissions")
    .select("route, level")
    .eq("role_id", roleData.id);

  const map = new Map<string, number>();
  for (const r of perms ?? []) {
    const key = normalizeKey(String(r.route));
    const level = Number(r.level ?? 0);
    if (!key) continue;
    map.set(key, Math.max(map.get(key) ?? LEVEL_NONE, level));
  }
  return map;
}

export default async function ToolsPage() {
  const user = await currentUser();
  if (!user) {
    return (
      <section className="p-6">
        <div className="rounded-xl border border-amber-700 bg-amber-900/10 p-4">
          <div className="text-amber-300 font-medium">Nicht angemeldet</div>
          <div className="text-amber-200/80 text-sm mt-1">
            Bitte melde dich an, um deine Werkzeuge zu sehen.
          </div>
        </div>
      </section>
    );
  }

  const role = (user.publicMetadata?.role as string | undefined)?.toLowerCase() ?? "member";
  const isSuper = role === "superadmin";

  const visible = isSuper
    ? ALL_TOOLS
    : (await (async () => {
        const allowed = await getAllowedRoutesForRole(role);
        return ALL_TOOLS.filter((t) => (allowed.get(normalizeKey(t.routeKey)) ?? LEVEL_NONE) >= LEVEL_READ);
      })());

  return (
    <section className="p-6 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Werkzeuge</h1>
        <p className="text-sm text-zinc-400">Module, die deiner Rolle freigeschaltet sind.</p>
      </header>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="text-zinc-300 text-sm">Für deine Rolle sind derzeit keine Werkzeuge freigeschaltet.</div>
          <div className="text-[11px] text-zinc-500 mt-2">
            Konfiguriere die Zugriffe in <span className="font-mono">/admin/settings</span> (Keys: <span className="font-mono">tools/files</span>, <span className="font-mono">tools/journal</span>, <span className="font-mono">tools/dispoplaner</span>).
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((t) => (
            <Link
              key={t.routeKey}
              href={t.href}
              className="group rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 hover:bg-zinc-900/60 hover:border-zinc-700 transition-colors"
            >
              <div className="text-zinc-100 font-medium text-base group-hover:underline">{t.title}</div>
              <div className="text-zinc-400 text-sm mt-1">{t.description}</div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
