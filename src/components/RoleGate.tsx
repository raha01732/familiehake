// src/components/RoleGate.tsx
// Server Component
import { ReactNode } from "react";
import { getSessionInfo } from "@/lib/auth";
import { getRouteDefaultAccess } from "@/lib/access-map";

/**
 * Erwartetes Schema in Supabase (Beispiel):
 *  - table: roles(name text primary key, label text, rank int)
 *  - table: access_rules(route text, role text, allowed boolean, primary key(route, role))
 *
 * Diese Komponente:
 *  - lässt 'superadmin' immer durch
 *  - normalisiert routeKey (ohne/mit führendem Slash)
 *  - prüft access_rules(route, role) auf allowed=true
 */

type Props = {
  /** z.B. "monitoring", "/monitoring", "admin/settings" */
  routeKey: string;
  children: ReactNode;
};

function normalizeRouteKey(key: string) {
  if (!key) return "";
  // führenden Slash entfernen, doppelte Slashes vermeiden
  return key.replace(/^\/+/, "").replace(/\/{2,}/g, "/").trim();
}

export default async function RoleGate({ routeKey, children }: Props) {
  const session = await getSessionInfo();
  const role = session.primaryRole?.name?.toLowerCase() ?? "user";
  const userId = session.userId;

  // 1) Superadmin override
  if (session.isSuperAdmin) {
    return <>{children}</>;
  }

  // 2) Falls kein User → blocken
  if (!userId) {
    return <Blocked reason="not_signed_in" role={role} routeKey={routeKey} />;
  }

  // 3) Route-Key normalisieren und gegen zentrale Permission-Map prüfen
  const key = normalizeRouteKey(routeKey);
  const allowedBySession = session.permissions[key] ?? session.permissions[`/${key}`];
  if (allowedBySession) {
    return <>{children}</>;
  }

  const fallbackAllowed = getRouteDefaultAccess(key, role);
  if (fallbackAllowed) {
    return <>{children}</>;
  }

  return (
    <Blocked
      reason="no_rule"
      role={role}
      routeKey={routeKey}
      debug={{ normalizedRouteKey: key }}
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
    | "insufficient_level";
  role: string;
  routeKey: string;
  debug?: Record<string, unknown>;
}) {
  const titles: Record<string, string> = {
    not_signed_in: "Nicht angemeldet",
    no_rule: "Kein Zugriffseintrag gefunden",
    insufficient_level: "Zugriff verweigert",
  };

  const hints: Record<string, string> = {
    not_signed_in: "Bitte melde dich an.",
    no_rule:
      "Für diese Route existiert kein Eintrag für deine Rolle. Prüfe den Route-Key in den Einstellungen.",
    insufficient_level:
      "Deine Rolle hat keinen Zugriff auf diese Route.",
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
