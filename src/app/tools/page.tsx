import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import { TOOL_LINKS } from "@/lib/navigation";
import { PreviewPlaceholder } from "@/components/PreviewNotice";
import { getAllowedRoutesForRole, LEVEL_NONE, LEVEL_READ, normalizeRouteKey } from "@/lib/route-access";
import { getToolStatusMap } from "@/lib/tool-status";
import {
  FolderOpen, BookOpen, Film, CalendarClock, Calendar,
  MessageSquare, HardDrive, Monitor, type LucideIcon,
  Wrench,
} from "lucide-react";

export const metadata = { title: "Werkzeuge" };

const ICON_MAP: Record<string, LucideIcon> = {
  "tools/files":        FolderOpen,
  "tools/journal":      BookOpen,
  "tools/dispoplaner":  Film,
  "tools/dienstplaner": CalendarClock,
  "tools/calender":     Calendar,
  "tools/messages":     MessageSquare,
  "tools/storage":      HardDrive,
  "tools/system":       Monitor,
};

export default async function ToolsPage() {
  const user = await currentUser();
  if (!user) {
    return (
      <section className="p-6">
        <div
          className="rounded-2xl border p-5"
          style={{ borderColor: "hsl(var(--destructive) / 0.3)", background: "hsl(var(--destructive) / 0.06)" }}
        >
          <div className="font-semibold" style={{ color: "hsl(var(--destructive))" }}>Nicht angemeldet</div>
          <div className="text-sm mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
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
    <section className="flex flex-col gap-8 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div
          className="shimmer-badge inline-flex w-fit items-center gap-2 rounded-full px-3 py-1"
          style={{ border: "1px solid hsl(var(--primary) / 0.3)" }}
        >
          <Wrench size={11} style={{ color: "hsl(var(--primary))" }} aria-hidden />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: "hsl(var(--primary))" }}
          >
            Workspace
          </span>
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="gradient-text">Werkzeuge</span>
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            Alle für deine Rolle freigeschalteten Module auf einen Blick.
          </p>
        </div>
      </div>

      <PreviewPlaceholder
        title="Werkzeug-Übersicht im Preview-Modus"
        description="Die Detailseiten sind in Preview absichtlich reduziert. Echte Daten aus externen Services werden nur in Production geladen."
        fields={["Datenbank-Inhalte", "Integrationen", "Live-Statusdaten"]}
      />

      {visible.length === 0 ? (
        <div
          className="rounded-2xl border p-8 text-center"
          style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
        >
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
          >
            <Wrench size={22} aria-hidden />
          </div>
          <p className="font-medium" style={{ color: "hsl(var(--foreground))" }}>
            Keine Werkzeuge freigeschaltet
          </p>
          <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
            Konfiguriere die Zugriffe unter{" "}
            <span className="font-mono" style={{ color: "hsl(var(--primary))" }}>/admin/settings</span>
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((t) => {
            const Icon = ICON_MAP[t.routeKey] ?? Wrench;
            const toolStatus = toolStatusMap[t.routeKey];
            const enabled = toolStatus?.enabled ?? true;
            const maintenanceMessage = toolStatus?.maintenanceMessage?.trim() || null;

            return (
              <Link
                key={t.routeKey}
                href={t.href}
                className="feature-card group flex flex-col gap-4 p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110"
                    style={{
                      background: enabled
                        ? "hsl(var(--primary) / 0.12)"
                        : "hsl(var(--muted))",
                      color: enabled
                        ? "hsl(var(--primary))"
                        : "hsl(var(--muted-foreground))",
                    }}
                  >
                    <Icon size={19} strokeWidth={2} aria-hidden />
                  </div>
                  {!enabled && (
                    <span
                      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{
                        borderColor: "hsl(27 96% 61% / 0.4)",
                        background: "hsl(27 96% 61% / 0.1)",
                        color: "hsl(27 96% 50%)",
                      }}
                    >
                      {maintenanceMessage ? "Wartung" : "Deaktiviert"}
                    </span>
                  )}
                </div>
                <div>
                  <h3
                    className="text-sm font-semibold group-hover:underline"
                    style={{ color: "hsl(var(--foreground))" }}
                  >
                    {t.label}
                  </h3>
                  {t.description && (
                    <p
                      className="mt-1 text-xs leading-relaxed"
                      style={{ color: "hsl(var(--muted-foreground))" }}
                    >
                      {t.description}
                    </p>
                  )}
                  {!enabled && maintenanceMessage && (
                    <p
                      className="mt-2 text-xs line-clamp-2"
                      style={{ color: "hsl(27 96% 50%)" }}
                    >
                      {maintenanceMessage}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
