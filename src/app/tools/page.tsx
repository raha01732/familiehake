// /workspace/familiehake/src/app/tools/page.tsx
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import { TOOL_LINKS } from "@/lib/navigation";
import { PreviewPlaceholder } from "@/components/PreviewNotice";
import { getAllowedRoutesForRole, LEVEL_NONE, LEVEL_READ, normalizeRouteKey } from "@/lib/route-access";
import { getToolStatusMap } from "@/lib/tool-status";

export const metadata = { title: "Werkzeuge" };

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

  const role = getRoleFromPublicMetadata(user.publicMetadata);
  const isSuper = user.id === env().PRIMARY_SUPERADMIN_ID;
  const [allowed, toolStatusMap] = await Promise.all([
    isSuper ? Promise.resolve<Map<string, number> | null>(null) : getAllowedRoutesForRole(role),
    getToolStatusMap(),
  ]);

  const visible = isSuper
    ? TOOL_LINKS
    : TOOL_LINKS.filter(
        (t) => (allowed?.get(normalizeRouteKey(t.routeKey)) ?? LEVEL_NONE) >= LEVEL_READ
      );

  return (
    <section className="p-6 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Werkzeuge</h1>
        <p className="text-sm text-zinc-400">
          Alle für deine Rolle sichtbaren Module inklusive globalem Tool-Status.
        </p>
      </header>
      <PreviewPlaceholder
        title="Werkzeug-Übersicht im Preview-Modus"
        description="Die Detailseiten sind in Preview absichtlich reduziert. Echte Daten aus externen Services werden nur in Production geladen."
        fields={["Datenbank-Inhalte", "Integrationen", "Live-Statusdaten"]}
      />

      {visible.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="text-zinc-300 text-sm">Für deine Rolle sind derzeit keine Werkzeuge freigeschaltet.</div>
          <div className="text-[11px] text-zinc-500 mt-2">
            Konfiguriere die Zugriffe in <span className="font-mono">/admin/settings</span> (Keys:{" "}
            <span className="font-mono">
              {TOOL_LINKS.map((link) => link.routeKey).join(", ")}
            </span>
            ).
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((t) => (
            (() => {
              const toolStatus = toolStatusMap[t.routeKey];
              const enabled = toolStatus?.enabled ?? true;
              const maintenanceMessage = toolStatus?.maintenanceMessage?.trim() || null;
              const showDisabledBadge = !enabled;
              const disabledLabel = maintenanceMessage ? "Wartung" : "Deaktiviert";

              return (
                <Link
                  key={t.routeKey}
                  href={t.href}
                  className="group rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 hover:bg-zinc-900/60 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-zinc-100 font-medium text-base group-hover:underline">{t.label}</div>
                    {showDisabledBadge ? (
                      <span className="inline-flex items-center rounded-full border border-amber-600/80 bg-amber-900/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                        {disabledLabel}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-zinc-400 text-sm mt-1">{t.description}</div>
                  {!enabled ? (
                    <div className="text-amber-200/90 text-xs mt-2 line-clamp-2">
                      {maintenanceMessage || "Dieses Tool ist aktuell vorübergehend deaktiviert."}
                    </div>
                  ) : null}
                </Link>
              );
            })()
          ))}
        </div>
      )}
    </section>
  );
}
