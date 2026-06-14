// src/app/tools/calender/FeedManager.tsx
"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Globe,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Rss,
  Trash2,
  X,
} from "lucide-react";

export type CalendarFeed = {
  id: string;
  name: string;
  url: string;
  color: string;
  enabled: boolean;
  last_synced_at: string | null;
  last_error: string | null;
};

export type FeedInput = { name: string; url: string; color: string; enabled: boolean };

export const FEED_COLORS = ["221", "262", "27", "142", "0", "330", "192"];

type FeedManagerProps = {
  feeds: CalendarFeed[];
  subscribeToken: string | null;
  onClose: () => void;
  onAdd: (input: FeedInput) => Promise<void> | void;
  onUpdate: (id: string, input: Partial<FeedInput>) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onRefresh: () => void;
  onGenerateSubscribe: () => Promise<void> | void;
  onRevokeSubscribe: () => Promise<void> | void;
};

export default function FeedManager({
  feeds,
  subscribeToken,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
  onRefresh,
  onGenerateSubscribe,
  onRevokeSubscribe,
}: FeedManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [color, setColor] = useState(FEED_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setEditingId(null);
    setName("");
    setUrl("");
    setColor(FEED_COLORS[0]);
    setError(null);
  }

  function startEdit(feed: CalendarFeed) {
    setEditingId(feed.id);
    setName(feed.name);
    setUrl(feed.url);
    setColor(feed.color);
    setError(null);
  }

  async function handleSubmit() {
    setError(null);
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName) {
      setError("Bitte einen Namen angeben.");
      return;
    }
    if (!/^(https?:\/\/|webcal:\/\/)/i.test(trimmedUrl)) {
      setError("Bitte eine gültige ICS-/iCal-Adresse (http, https oder webcal) angeben.");
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        await onUpdate(editingId, { name: trimmedName, url: trimmedUrl, color });
      } else {
        await onAdd({ name: trimmedName, url: trimmedUrl, color, enabled: true });
      }
      resetForm();
    } catch {
      setError("Speichern fehlgeschlagen. Adresse prüfen und erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[600] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Externe Kalender verwalten"
    >
      <button
        type="button"
        aria-label="Schließen"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: "hsl(var(--background) / 0.6)", backdropFilter: "blur(4px)" }}
      />

      <div
        className="card animate-fade-up relative z-10 flex w-full max-w-xl flex-col gap-4 p-5 sm:rounded-2xl"
        style={{ maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}
            >
              <Rss size={16} aria-hidden />
            </span>
            <h2 className="text-lg font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Externe Kalender
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-[hsl(var(--secondary))]"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {/* Bestehende Abos */}
        {feeds.length > 0 && (
          <div className="flex flex-col gap-2">
            {feeds.map((feed) => (
              <div
                key={feed.id}
                className="flex items-center gap-3 rounded-xl border p-2.5"
                style={{ borderColor: "hsl(var(--border))" }}
              >
                <span
                  className="h-3 w-3 flex-shrink-0 rounded-full"
                  style={{ background: `hsl(${feed.color} 70% 50%)` }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
                    {feed.name}
                  </div>
                  <div className="truncate text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {feed.last_error ? (
                      <span className="inline-flex items-center gap-1" style={{ color: "hsl(var(--destructive))" }}>
                        <AlertTriangle size={11} aria-hidden /> {feed.last_error}
                      </span>
                    ) : feed.last_synced_at ? (
                      `Aktualisiert: ${new Date(feed.last_synced_at).toLocaleString("de-DE")}`
                    ) : (
                      "Noch nicht synchronisiert"
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onUpdate(feed.id, { enabled: !feed.enabled })}
                  title={feed.enabled ? "Aktiv – ausblenden" : "Ausgeblendet – einblenden"}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border transition hover:bg-[hsl(var(--secondary))]"
                  style={{
                    borderColor: feed.enabled ? "hsl(var(--primary) / 0.4)" : "hsl(var(--border))",
                    color: feed.enabled ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                  }}
                >
                  {feed.enabled ? <Check size={13} aria-hidden /> : <X size={13} aria-hidden />}
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(feed)}
                  aria-label="Bearbeiten"
                  className="flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-[hsl(var(--secondary))]"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  <Pencil size={13} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(feed.id)}
                  aria-label="Entfernen"
                  className="flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-[hsl(var(--destructive)/0.1)]"
                  style={{ color: "hsl(var(--destructive))" }}
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Hinzufügen / Bearbeiten */}
        <div className="flex flex-col gap-3 rounded-xl border p-3" style={{ borderColor: "hsl(var(--border))" }}>
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
            {editingId ? "Abo bearbeiten" : "Kalender abonnieren"}
          </div>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (z. B. Feiertage NRW)"
            className="input-field"
            maxLength={120}
          />
          <div className="flex items-center gap-2">
            <Link2 size={15} aria-hidden style={{ color: "hsl(var(--muted-foreground))" }} />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="ICS-/iCal-Adresse (https://… oder webcal://…)"
              className="input-field"
            />
          </div>

          {/* Farbauswahl */}
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              Farbe
            </span>
            <div className="flex items-center gap-1.5">
              {FEED_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Farbe ${c}`}
                  className="h-6 w-6 rounded-full transition"
                  style={{
                    background: `hsl(${c} 70% 50%)`,
                    outline: color === c ? "2px solid hsl(var(--foreground))" : "none",
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </div>

          {error && (
            <p
              className="rounded-lg px-3 py-2 text-xs"
              style={{ background: "hsl(var(--destructive) / 0.1)", color: "hsl(var(--destructive))" }}
            >
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border px-3 py-2 text-sm font-medium transition hover:bg-[hsl(var(--secondary))]"
                style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
              >
                Abbrechen
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy}
              className="brand-button inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              <Plus size={15} aria-hidden /> {editingId ? "Speichern" : "Abonnieren"}
            </button>
          </div>
        </div>

        {/* Eigenen Kalender veröffentlichen */}
        <PublishSection
          token={subscribeToken}
          onGenerate={onGenerateSubscribe}
          onRevoke={onRevokeSubscribe}
        />

        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
            Tipp: In Google Kalender unter „Einstellungen → Kalender → Geheime Adresse im
            iCal-Format", in Outlook über „Kalender veröffentlichen → ICS".
          </p>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:bg-[hsl(var(--secondary))]"
            style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
          >
            <RefreshCw size={13} aria-hidden /> Jetzt aktualisieren
          </button>
        </div>
      </div>
    </div>
  );
}

function PublishSection({
  token,
  onGenerate,
  onRevoke,
}: {
  token: string | null;
  onGenerate: () => Promise<void> | void;
  onRevoke: () => Promise<void> | void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const url =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/api/calendar/subscribe/${token}`
      : "";

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function run(action: () => Promise<void> | void) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3" style={{ borderColor: "hsl(var(--border))" }}>
      <div className="flex items-center gap-2">
        <Globe size={15} aria-hidden style={{ color: "hsl(var(--primary))" }} />
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
          Meinen Kalender veröffentlichen
        </span>
      </div>

      <p className="text-[11px] leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
        Abonniere deine eigenen Termine in Google, Apple oder Outlook über eine geheime Adresse
        (einseitig, Aktualisierung je nach Anbieter im Stunden­takt).
      </p>

      {token ? (
        <>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="input-field text-xs"
            />
            <button
              type="button"
              onClick={copy}
              aria-label="Adresse kopieren"
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition hover:bg-[hsl(var(--secondary))]"
              style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
            >
              {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
              {copied ? "Kopiert" : "Kopieren"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => run(onGenerate)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:bg-[hsl(var(--secondary))] disabled:opacity-50"
              style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
            >
              <RefreshCw size={13} aria-hidden /> Neu generieren
            </button>
            <button
              type="button"
              onClick={() => run(onRevoke)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:bg-[hsl(var(--destructive)/0.1)] disabled:opacity-50"
              style={{ borderColor: "hsl(var(--destructive) / 0.4)", color: "hsl(var(--destructive))" }}
            >
              <Trash2 size={13} aria-hidden /> Deaktivieren
            </button>
          </div>
          <p className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
            Jeder mit dieser Adresse kann deine Termine lesen. Bei Verdacht „Neu generieren" – die alte
            Adresse wird damit ungültig.
          </p>
        </>
      ) : (
        <button
          type="button"
          onClick={() => run(onGenerate)}
          disabled={busy}
          className="brand-button inline-flex w-fit items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          <Globe size={15} aria-hidden /> Abo-Adresse erstellen
        </button>
      )}
    </div>
  );
}
