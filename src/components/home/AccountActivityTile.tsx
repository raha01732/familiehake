import { getMyAccountActivity, type AccountSession } from "@/lib/clerk-activity";
import { AlertTriangle, Clock, MapPin, ShieldCheck, Smartphone, Monitor } from "lucide-react";

function formatWhen(ms: number | null): string {
  if (ms == null) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ms));
  } catch {
    return "—";
  }
}

function relative(ms: number | null): string {
  if (ms == null) return "";
  const diff = Date.now() - ms;
  if (diff < 0) return "";
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tag${d === 1 ? "" : "en"}`;
}

function locationOf(s: AccountSession): string | null {
  const parts = [s.city, s.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export default async function AccountActivityTile({ userId }: { userId: string }) {
  const activity = await getMyAccountActivity(userId);
  if (!activity) return null;

  const { lastSignInAt, locked, sessions } = activity;

  return (
    <div className="soft-surface flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}
        >
          <ShieldCheck size={14} strokeWidth={2} aria-hidden />
        </span>
        <div className="flex flex-1 items-center gap-2">
          <h3 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Konto-Aktivität
          </h3>
          <span className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
            {lastSignInAt ? `· zuletzt ${relative(lastSignInAt)}` : "· keine Daten"}
          </span>
        </div>
      </div>

      {locked && (
        <div
          className="flex items-start gap-2 rounded-lg border p-3"
          style={{
            borderColor: "hsl(0 84% 60% / 0.4)",
            background: "hsl(0 84% 60% / 0.08)",
          }}
        >
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-red-500" aria-hidden />
          <p className="text-[13px] leading-relaxed" style={{ color: "hsl(var(--foreground))" }}>
            Dein Konto ist aktuell <strong>gesperrt</strong> – meist nach mehreren
            fehlgeschlagenen Anmeldeversuchen. Falls du das nicht warst, ändere dein Passwort.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border px-3 py-2"
           style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card) / 0.6)" }}>
        <span className="flex items-center gap-1.5 text-[12px] font-medium"
              style={{ color: "hsl(var(--muted-foreground))" }}>
          <Clock size={12} aria-hidden /> Letzte Anmeldung
        </span>
        <span className="text-[12px] font-medium" style={{ color: "hsl(var(--foreground))" }}>
          {formatWhen(lastSignInAt)}
        </span>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
           style={{ color: "hsl(var(--muted-foreground))" }}>
          Aktive Geräte {sessions.length > 0 ? `· ${sessions.length}` : ""}
        </p>
        {sessions.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-3 text-center text-[12px]"
             style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
            Noch keine Aktivitätsdaten – der nächste Abgleich füllt diese Ansicht.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {sessions.map((s) => {
              const loc = locationOf(s);
              const Icon = s.isMobile ? Smartphone : Monitor;
              return (
                <li
                  key={s.sessionId}
                  className="flex items-center gap-2.5 rounded-lg border p-2.5"
                  style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card) / 0.6)" }}
                >
                  <span
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }}
                  >
                    <Icon size={14} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium" style={{ color: "hsl(var(--foreground))" }}>
                      {s.browser}
                      <span className="font-normal" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {" · "}{s.device}
                      </span>
                    </p>
                    <p className="flex items-center gap-2 truncate text-[11px]"
                       style={{ color: "hsl(var(--muted-foreground))" }}>
                      {loc && (
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin size={10} aria-hidden /> {loc}
                        </span>
                      )}
                      {s.lastActiveAt && <span>{relative(s.lastActiveAt)}</span>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
