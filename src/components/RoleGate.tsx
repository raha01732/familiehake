// Server Component
import { ReactNode } from "react";
import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Erwartetes Schema in Supabase (Beispiel):
 *  - table: roles(name text primary key, label text, rank int)
 *  - table: access_rules(route text, role text, level int, primary key(route, role))
 *    level: 0=NONE, 1=READ, 2=WRITE, 3=ADMIN  (nur Beispiel – du nutzt vermutlich PERMISSION_LEVELS)
 *
 * Diese Komponente:
 *  - lässt 'superadmin' immer durch
 *  - normalisiert routeKey (ohne/mit führendem Slash)
 *  - prüft access_rules(route, role)
 */

type Props = {
  /** z.B. "monitoring", "/monitoring", "admin/settings" */
  routeKey: string;
  children: ReactNode;
  /** optional mindest-Level (default: 1=READ) */
  minLevel?: number;
};

function normalizeRouteKey(key: string) {
  if (!key) return "";
  // führenden Slash entfernen, doppelte Slashes vermeiden
  return key.replace(/^\/+/, "").replace(/\/{2,}/g, "/").trim();
}

export default async function RoleGate({ routeKey, children, minLevel = 1 }: Props) {
  const user = await currentUser();
  const role = (user?.publicMetadata?.role as string | undefined)?.toLowerCase() ?? "member";
  const userId = user?.id ?? null;

  // 1) Superadmin override
  if (role === "superadmin") {
    return <>{children}</>;
  }

  // 2) Falls kein User → blocken
  if (!userId) {
    return <Blocked reason="not_signed_in" role={role} routeKey={routeKey} />;
  }

  // 3) Route-Key normalisieren und beide Varianten prüfen
  const key = normalizeRouteKey(routeKey);
  const variants = [key, `/${key}`]; // tolerant gegenüber führendem Slash

  // 4) DB-Abfrage: hat diese Rolle ausreichend Level auf der Route?
  const sb = createAdminClient();

  // Wir versuchen beide Varianten; erste passende gewinnt
  const { data: rules, error } = await sb
    .from("access_rules")
    .select("route, role, level")
    .in("route", variants)
    .eq("role", role);

  if (error) {
    return (
      <Blocked
        reason="db_error"
        role={role}
        routeKey={routeKey}
        debug={{ error: error.message }}
      />
    );
  }

  // Keine Regel gefunden? → blocken mit Hinweis auf möglichen Route-Key-Mismatch
  if (!rules || rules.length === 0) {
    return (
      <Blocked
        reason="no_rule"
        role={role}
        routeKey={routeKey}
        debug={{ triedVariants: variants }}
      />
    );
  }

  // Mindestens eine passende Regel – Level prüfen
  const maxLevel = Math.max(...rules.map((r) => Number(r.level ?? 0)));
  if (maxLevel >= minLevel) {
    return <>{children}</>;
  }

  return (
    <Blocked
      reason="insufficient_level"
      role={role}
      routeKey={routeKey}
      debug={{ foundLevel: maxLevel, required: minLevel }}
    />
  );
}

/** UI bei blockiertem Zugriff – zeigt klare Hinweise */
function Blocked({
  reason,
  role,
  routeKey,
  debug,
}: {
  reason:
    | "not_signed_in"
    | "no_rule"
    | "insufficient_level"
    | "db_error";
  role: string;
  routeKey: string;
  debug?: Record<string, unknown>;
}) {
  const titles: Record<string, string> = {
    not_signed_in: "Nicht angemeldet",
    no_rule: "Kein Zugriffseintrag gefunden",
    insufficient_level: "Zugriff verweigert",
    db_error: "Zugriffsprüfung fehlgeschlagen",
  };

  const hints: Record<string, string> = {
    not_signed_in: "Bitte melde dich an.",
    no_rule:
      "Für diese Route existiert kein Eintrag für deine Rolle. Prüfe den Route-Key in den Einstellungen.",
    insufficient_level:
      "Deine Rolle hat nicht das nötige Berechtigungslevel für diese Route.",
    db_error:
      "Beim Lesen der Zugriffsregeln ist ein Fehler aufgetreten. Bitte später erneut versuchen.",
  };

  return (
    <section className="p-6">
      <div className="rounded-xl border border-amber-700 bg-amber-900/10 p-4">
        <div className="text-amber-300 font-medium">{titles[reason]}</div>
        <div className="text-amber-200/80 text-sm mt-1">
          Rolle: <span className="font-mono">{role || "—"}</span> · Route:{" "}
          <span className="font-mono">{routeKey}</span>
        </div>
        <div className="text-amber-200/70 text-sm mt-2">{hints[reason]}</div>

        {debug && (
          <pre className="mt-3 text-[11px] leading-5 text-amber-200/60 bg-amber-900/20 border border-amber-800 rounded-lg p-2 overflow-x-auto">
            {JSON.stringify(debug, null, 2)}
          </pre>
        )}
      </div>
    </section>
  );
}
