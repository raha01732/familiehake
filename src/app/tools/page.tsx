import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Werkzeuge" };

/** ---- RBAC-Konstanten (Level) ---- */
const LEVEL_NONE = 0;
const LEVEL_READ = 1;
// const LEVEL_WRITE = 2; // bei Bedarf
// const LEVEL_ADMIN = 3; // bei Bedarf

/** ---- Alle verfügbaren Tool-Module (nur hier definieren/ergänzen) ----
 * routeKey muss zu access_rules.route passen (wir normalisieren ohne führenden Slash).
 */
const ALL_TOOLS: Array<{
  routeKey: string;       // z. B. "tools/files"
  href: string;           // z. B. "/tools/files"
  title: string;          // UI-Titel
  description: string;    // UI-Beschreibung
}> = [
  {
    routeKey: "tools/files",
    href: "/tools/files",
    title: "Dateien",
    description: "Ablage, Ordner, Freigaben & Papierkorb",
  },
  // Weitere Tools kannst du hier hinzufügen, z. B.:
  // {
  //   routeKey: "tools/notes",
  //   href: "/tools/notes",
  //   title: "Notizen",
  //   description: "Schnelle Notizen & Checklisten",
  // },
];

/** Führende Slashes entfernen, doppelte Slashes bereinigen */
function normalizeKey(key: string) {
  return key.replace(/^\/+/, "").replace(/\/{2,}/g, "/").trim();
}

/** Daten laden: Rolle + alle Routen (mit Level) für die Rolle */
async function getAllowedRoutesForRole(role: string) {
  const sb = createAdminClient();

  // Regeln für diese Rolle lesen
  const { data: rules, error } = await sb
    .from("access_rules")
    .select("route, level")
    .eq("role", role);

  if (error || !rules) return new Map<string, number>();

  // Map: route(normalized) -> level
  const map = new Map<string, number>();
  for (const r of rules) {
    const key = normalizeKey(String(r.route ?? ""));
    const level = Number(r.level ?? 0);
    if (!key) continue;
    // Wenn mehrfach vorhanden, größtes Level behalten
    map.set(key, Math.max(map.get(key) ?? LEVEL_NONE, level));
  }
  return map;
}

/** ---- Page (Server Component) ---- */
export default async function ToolsPage() {
  const user = await currentUser();

  return (
    <section className="p-6 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Werkzeuge</h1>
        <p className="text-sm text-zinc-400">
          Sammelstelle aller Module – angelehnt an das Nextcloud-App-Grid, mit Kennzahlen aus deinen Daten.
        </p>
      </header>

      {!user ? (
        <div className="rounded-xl border border-amber-700 bg-amber-900/10 p-4">
          <div className="text-amber-300 font-medium">Nicht angemeldet</div>
          <div className="text-amber-200/80 text-sm mt-1">
            Bitte melde dich an, um deine Werkzeuge zu sehen.
          </div>
        </div>
      ) : (
        <ToolsGrid />
      )}
    </section>
  );
}

/** Ausgelagerter Server-Teil: lädt Rolle & Regeln und rendert das Grid */
async function ToolsGrid() {
  const user = await currentUser();
  const role = (user?.publicMetadata?.role as string | undefined)?.toLowerCase() ?? "member";

  // Superadmin sieht alles
  if (role === "superadmin") {
    return <Grid tools={ALL_TOOLS} emptyHint={false} />;
  }

  // Regeln aus DB lesen
  const allowedMap = await getAllowedRoutesForRole(role);

  // Filter: nur Tools mit Level >= READ
  const visible = ALL_TOOLS.filter((t) => {
    const key = normalizeKey(t.routeKey);
    const lvl = allowedMap.get(key) ?? LEVEL_NONE;
    return lvl >= LEVEL_READ;
  });

  return <Grid tools={visible} emptyHint={true} />;
}

/** Reines UI-Grid */
function Grid({ tools, emptyHint }: { tools: typeof ALL_TOOLS; emptyHint: boolean }) {
  if (!tools || tools.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <div className="text-zinc-300 text-sm">
          Für deine Rolle sind derzeit keine Werkzeuge freigeschaltet.
        </div>
        {emptyHint && (
          <div className="text-[11px] text-zinc-500 mt-2">
            Tipp: In <span className="font-mono text-zinc-400">/admin/settings</span> kannst du die
            Zugriffsrechte anpassen (Route-Key z. B.{" "}
            <span className="font-mono text-zinc-400">tools/files</span>).
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((t) => (
        <Link
          key={t.routeKey}
          href={t.href}
          className="group rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 hover:bg-zinc-900/60 hover:border-zinc-700 transition-colors"
        >
          <div className="text-zinc-100 font-medium text-base group-hover:underline">
            {t.title}
          </div>
          <div className="text-zinc-400 text-sm mt-1">{t.description}</div>
        </Link>
      ))}
    </div>
  );
}
