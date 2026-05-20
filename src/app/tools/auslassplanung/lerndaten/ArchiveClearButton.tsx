"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, Calendar, Trash2 } from "lucide-react";
import { clearArchiveAction } from "../actions";

type ArchiveDate = { show_date: string };

type Mode = "range" | "all";

// Stabiles, no-op subscribe für den useSyncExternalStore-Hydration-Check.
const noopSubscribe = () => () => {};
/**
 * Liefert nach der Hydration `true`, beim Server-Render `false`. SSR-sicherer
 * Ersatz für das setState-im-Effect-"mounted"-Muster (react-hooks/set-state-in-effect).
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

export function ArchiveClearButton({ archiveDates }: { archiveDates: ArchiveDate[] }) {
  const [open, setOpen] = useState(false);
  if (archiveDates.length === 0) {
    return (
      <p className="text-xs italic" style={{ color: "hsl(var(--muted-foreground))" }}>
        Kein Archiv vorhanden — die KI lernt aktuell ausschließlich aus aktiven Vorstellungen.
      </p>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[hsl(var(--destructive)/0.35)] bg-[hsl(var(--destructive)/0.08)] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.15)]"
      >
        <Trash2 size={12} /> Archiv-Einträge löschen…
      </button>
      {open && (
        <ArchiveClearModal
          archiveDates={archiveDates}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ArchiveClearModal({
  archiveDates,
  onClose,
}: {
  archiveDates: ArchiveDate[];
  onClose: () => void;
}) {
  const router = useRouter();
  const mounted = useHydrated();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("range");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [result, setResult] = useState<{ deleted: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, isPending]);

  // Defaults: ältesten Eintrag als 'from', um sicher etwas zu filtern
  const { oldest, newest } = useMemo(() => {
    const sorted = archiveDates.map((d) => d.show_date).sort();
    return { oldest: sorted[0], newest: sorted[sorted.length - 1] };
  }, [archiveDates]);

  const matchedCount = useMemo(() => {
    if (mode === "all") return archiveDates.length;
    return archiveDates.filter((d) => {
      if (dateFrom && d.show_date < dateFrom) return false;
      if (dateTo && d.show_date > dateTo) return false;
      return true;
    }).length;
  }, [archiveDates, dateFrom, dateTo, mode]);

  const canSubmit =
    confirmText.trim() === "ARCHIV LEEREN" &&
    matchedCount > 0 &&
    (mode === "all" || dateFrom !== "" || dateTo !== "") &&
    !isPending;

  function onSubmit() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("confirm", confirmText.trim());
      if (mode === "all") {
        fd.set("scope", "all");
      } else {
        if (dateFrom) fd.set("date_from", dateFrom);
        if (dateTo) fd.set("date_to", dateTo);
      }
      const res = await clearArchiveAction(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResult({ deleted: res.deleted });
      router.refresh();
    });
  }

  if (!mounted) return null;

  const overlay = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !isPending && onClose()}
      />
      <div className="relative w-full max-w-lg mx-3 sm:mx-6 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl shadow-2xl max-h-[calc(100vh-3rem)] overflow-y-auto">
        <div className="flex items-center gap-3 p-5 border-b border-[hsl(var(--border))] rounded-t-2xl">
          <div>
            <h2 className="font-semibold text-[hsl(var(--foreground))]">
              Archiv-Einträge löschen
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
              Lerndaten dauerhaft entfernen — kann nicht rückgängig gemacht werden.
            </p>
          </div>
          <button
            onClick={() => !isPending && onClose()}
            className="ml-auto text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] p-1 rounded-lg hover:bg-[hsl(var(--secondary))]"
            aria-label="Schließen"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {result === null ? (
          <div className="p-5 space-y-4">
            <div
              className="rounded-xl p-3 text-xs flex items-start gap-2"
              style={{
                background: "hsl(32 95% 55% / 0.08)",
                border: "1px solid hsl(32 95% 55% / 0.3)",
                color: "hsl(var(--foreground))",
              }}
            >
              <AlertTriangle
                size={14}
                className="shrink-0 mt-0.5"
                style={{ color: "hsl(32 95% 55%)" }}
              />
              <span>
                Gelöschte Lerndaten stehen der KI nicht mehr als Kontext zur Verfügung. Die
                Empfehlungen werden für ähnliche Konstellationen schlechter, bis neue Daten
                anfallen.
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-[hsl(var(--border))] cursor-pointer hover:bg-[hsl(var(--secondary)/0.4)]">
                <input
                  type="radio"
                  checked={mode === "range"}
                  onChange={() => setMode("range")}
                  className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <div className="flex-1">
                  <div className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                    Zeitraum wählen
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Nur Einträge mit Show-Datum im gewählten Bereich werden gelöscht.
                  </div>
                </div>
              </label>

              {mode === "range" && (
                <div className="ml-7 grid grid-cols-2 gap-2">
                  <div>
                    <label
                      className="block text-[10px] font-semibold uppercase tracking-[0.18em] mb-1"
                      style={{ color: "hsl(var(--muted-foreground))" }}
                    >
                      Von
                    </label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      min={oldest}
                      max={newest}
                      className="w-full bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg px-2 py-1.5 text-[hsl(var(--foreground))] text-sm focus:outline-none focus:border-[hsl(var(--ring))]"
                    />
                  </div>
                  <div>
                    <label
                      className="block text-[10px] font-semibold uppercase tracking-[0.18em] mb-1"
                      style={{ color: "hsl(var(--muted-foreground))" }}
                    >
                      Bis (inkl.)
                    </label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      min={oldest}
                      max={newest}
                      className="w-full bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg px-2 py-1.5 text-[hsl(var(--foreground))] text-sm focus:outline-none focus:border-[hsl(var(--ring))]"
                    />
                  </div>
                </div>
              )}

              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-[hsl(var(--border))] cursor-pointer hover:bg-[hsl(var(--secondary)/0.4)]">
                <input
                  type="radio"
                  checked={mode === "all"}
                  onChange={() => setMode("all")}
                  className="mt-1 h-4 w-4 accent-[hsl(var(--destructive))]"
                />
                <div className="flex-1">
                  <div className="text-sm font-semibold" style={{ color: "hsl(var(--destructive))" }}>
                    Alle {archiveDates.length} Archiv-Einträge löschen
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Komplettes Lern-Archiv zurücksetzen — KI verliert das gesamte historische
                    Wissen.
                  </div>
                </div>
              </label>
            </div>

            <div
              className="rounded-lg p-3 text-xs flex items-center gap-2"
              style={{
                background: "hsl(var(--secondary) / 0.5)",
                color: "hsl(var(--foreground))",
              }}
            >
              <Calendar size={12} />
              <span>
                Treffer im gewählten Bereich:{" "}
                <strong>
                  {matchedCount} {matchedCount === 1 ? "Eintrag" : "Einträge"}
                </strong>
              </span>
            </div>

            <div>
              <label
                className="block text-[10px] font-semibold uppercase tracking-[0.18em] mb-1.5"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                Zur Bestätigung „ARCHIV LEEREN" eingeben
              </label>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="ARCHIV LEEREN"
                autoFocus
                className="w-full bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg px-3 py-2 text-[hsl(var(--foreground))] text-sm focus:outline-none focus:border-[hsl(var(--ring))]"
              />
            </div>

            {error && (
              <p className="text-xs" style={{ color: "hsl(var(--destructive))" }}>
                {error}
              </p>
            )}

            <div className="flex gap-2 pt-2 border-t border-[hsl(var(--border))]">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="ml-auto px-4 py-2 bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-sm rounded-lg"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[hsl(var(--destructive))] hover:opacity-90 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={14} />
                {isPending
                  ? "Lösche…"
                  : `${matchedCount} ${matchedCount === 1 ? "Eintrag" : "Einträge"} löschen`}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4 text-center">
            <p className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
              {result.deleted} {result.deleted === 1 ? "Eintrag" : "Einträge"} aus dem Archiv
              gelöscht.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))] text-sm font-medium rounded-lg"
            >
              Fertig
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
