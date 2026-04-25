// src/components/NotificationSettings.tsx
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Mail, Check, Loader2 } from "lucide-react";

type Prefs = { email_enabled: boolean };

type SaveState = "idle" | "saving" | "saved" | "error";

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/notifications/preferences", { cache: "no-store" });
        const json = (await res.json()) as { ok: boolean; data?: Prefs; error?: string };
        if (!alive) return;
        if (json.ok && json.data) {
          setPrefs(json.data);
        } else {
          setLoadError(json.error ?? "Konnte Einstellungen nicht laden.");
        }
      } catch {
        if (alive) setLoadError("Netzwerkfehler beim Laden der Einstellungen.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function toggleEmail(next: boolean) {
    setSaveState("saving");
    const previous = prefs;
    setPrefs({ email_enabled: next });
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_enabled: next }),
      });
      const json = (await res.json()) as { ok: boolean };
      if (!json.ok) throw new Error("patch failed");
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      setPrefs(previous);
      setSaveState("error");
    }
  }

  return (
    <div className="w-full p-6">
      <div className="mb-6">
        <h1 className="mb-1 text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
          Benachrichtigungen
        </h1>
        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          Steuere, wie du über Ereignisse in FamilieHake informiert wirst.
        </p>
      </div>

      {loadError ? (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            borderColor: "hsl(var(--destructive) / 0.4)",
            background: "hsl(var(--destructive) / 0.08)",
            color: "hsl(var(--destructive))",
          }}
        >
          {loadError}
        </div>
      ) : prefs === null ? (
        <div
          className="flex items-center gap-2 text-sm"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          <Loader2 size={14} className="animate-spin" aria-hidden />
          Lade Einstellungen…
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <PreferenceRow
            icon={<Mail size={16} aria-hidden />}
            title="E-Mail-Benachrichtigungen"
            description="Erhalte wichtige Ereignisse (z. B. neue Aufgaben) zusätzlich per E-Mail. In-App-Benachrichtigungen bleiben immer aktiv."
            checked={prefs.email_enabled}
            onChange={toggleEmail}
            disabled={saveState === "saving"}
          />

          <div
            className="min-h-[20px] text-xs"
            style={{
              color:
                saveState === "error"
                  ? "hsl(var(--destructive))"
                  : "hsl(var(--muted-foreground))",
            }}
          >
            {saveState === "saving" && (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" aria-hidden /> Speichert…
              </span>
            )}
            {saveState === "saved" && (
              <span className="inline-flex items-center gap-1">
                <Check size={12} aria-hidden /> Gespeichert.
              </span>
            )}
            {saveState === "error" && "Speichern fehlgeschlagen. Bitte erneut versuchen."}
          </div>
        </div>
      )}
    </div>
  );
}

function PreferenceRow({
  icon,
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex items-start gap-4 rounded-xl border p-4"
      style={{
        borderColor: "hsl(var(--border))",
        background: "hsl(var(--card))",
      }}
    >
      <span
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
        style={{
          background: "hsl(var(--primary) / 0.12)",
          color: "hsl(var(--primary))",
        }}
      >
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
          {title}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
          {description}
        </p>
      </div>

      <Toggle checked={checked} onChange={onChange} disabled={disabled} ariaLabel={title} />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition disabled:opacity-50"
      style={{
        background: checked ? "hsl(var(--primary))" : "hsl(var(--muted))",
        border: "1px solid hsl(var(--border))",
      }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
        style={{
          transform: checked ? "translateX(22px)" : "translateX(4px)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}
