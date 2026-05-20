"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Clock,
  Save,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  Mail,
  Bell,
  FileText,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  BLOCK_TYPES,
  createBlock,
  renderEmailHtml,
  type SystemMessageBlock,
  type SystemMessageChannel,
  type SystemMessageStatus,
} from "@/lib/system-messages/blocks";
import {
  saveDraftAction,
  sendSystemMessageNowAction,
  scheduleSystemMessageAction,
  deleteSystemMessageAction,
  resendSystemReportAction,
  type SystemMessageInput,
} from "./actions";

export type DirectoryEntry = { id: string; displayName: string };

export type RecipientStat = {
  userId: string;
  name: string;
  emailSent: boolean;
  inappSent: boolean;
  openedAt: string | null;
  clickedAt: string | null;
  inappReadAt: string | null;
};

export type HistoryItem = {
  id: string;
  title: string;
  blocks: SystemMessageBlock[];
  channels: SystemMessageChannel[];
  audience: "all" | "selected";
  recipientIds: string[];
  status: SystemMessageStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  recipientCount: number;
  emailSentCount: number;
  inappSentCount: number;
  createdAt: string;
  recipientStats: RecipientStat[];
  openedCount: number;
  clickedCount: number;
  inappReadCount: number;
};

const BLOCK_LABELS: Record<SystemMessageBlock["type"], string> = {
  heading: "Überschrift",
  paragraph: "Text",
  button: "Button",
  notice: "Hinweis-Box",
  divider: "Trennlinie",
  image: "Bild",
};

const STATUS_META: Record<SystemMessageStatus, { label: string; bg: string; color: string }> = {
  draft: { label: "Entwurf", bg: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" },
  scheduled: { label: "Geplant", bg: "#eef2ff", color: "#3730a3" },
  sent: { label: "Gesendet", bg: "#dcfce7", color: "#166534" },
  failed: { label: "Fehler", bg: "#fee2e2", color: "#991b1b" },
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const inputCls =
  "w-full rounded-lg border bg-[hsl(var(--background))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]";
const inputStyle = { borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" } as const;

/**
 * Wandelt den Wert eines <input type="datetime-local"> (lokale Wanduhrzeit
 * ohne Zeitzone) in eine echte UTC-ISO-Zeit um. `new Date(value)` interpretiert
 * den Wert im Browser korrekt in der Zeitzone des Nutzers.
 */
function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Umgekehrt: UTC-ISO -> lokaler datetime-local-Wert "YYYY-MM-DDTHH:mm". */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MessagesAdminClient({
  history,
  directory,
}: {
  history: HistoryItem[];
  directory: DirectoryEntry[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<SystemMessageBlock[]>([
    { type: "heading", text: "Hallo zusammen," },
    { type: "paragraph", text: "" },
  ]);
  const [channelEmail, setChannelEmail] = useState(true);
  const [channelInApp, setChannelInApp] = useState(true);
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const previewHtml = useMemo(
    () => renderEmailHtml({ title: title || "Ohne Titel", blocks, appUrl: null }),
    [title, blocks]
  );

  const filteredDirectory = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return directory;
    return directory.filter((u) => u.displayName.toLowerCase().includes(q));
  }, [directory, userSearch]);

  function resetComposer() {
    setEditingId(null);
    setTitle("");
    setBlocks([
      { type: "heading", text: "Hallo zusammen," },
      { type: "paragraph", text: "" },
    ]);
    setChannelEmail(true);
    setChannelInApp(true);
    setAudience("all");
    setRecipientIds([]);
    setScheduleEnabled(false);
    setScheduledAt("");
  }

  // ── Block-Editor ────────────────────────────────────────────────────
  function addBlock(type: SystemMessageBlock["type"]) {
    setBlocks((prev) => [...prev, createBlock(type)]);
  }
  function removeBlock(index: number) {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  }
  function moveBlock(index: number, dir: -1 | 1) {
    setBlocks((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function patchBlock(index: number, block: SystemMessageBlock) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? block : b)));
  }

  function channels(): SystemMessageChannel[] {
    const out: SystemMessageChannel[] = [];
    if (channelEmail) out.push("email");
    if (channelInApp) out.push("inapp");
    return out;
  }

  function buildInput(): SystemMessageInput {
    return {
      id: editingId,
      title,
      blocks,
      channels: channels(),
      audience,
      recipientIds,
      scheduledAt: scheduleEnabled && scheduledAt ? localInputToIso(scheduledAt) : null,
    };
  }

  function toggleRecipient(id: string) {
    setRecipientIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // ── Aktionen ────────────────────────────────────────────────────────
  function runAction(fn: () => Promise<void>) {
    setFeedback(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setFeedback({ type: "err", text: e instanceof Error ? e.message : "Unbekannter Fehler." });
      }
    });
  }

  function onSend() {
    if (audience === "all") {
      const ok = window.confirm("Diese Nachricht wirklich an ALLE Mitglieder senden?");
      if (!ok) return;
    }
    runAction(async () => {
      const res = await sendSystemMessageNowAction(buildInput());
      if (!res.ok) {
        setFeedback({ type: "err", text: res.error ?? "Senden fehlgeschlagen." });
        return;
      }
      setFeedback({
        type: "ok",
        text: `Gesendet an ${res.recipientCount ?? 0} Empfänger (E-Mail: ${res.emailSent ?? 0}, In-App: ${res.inappSent ?? 0}).`,
      });
      resetComposer();
      router.refresh();
    });
  }

  function onSchedule() {
    runAction(async () => {
      const res = await scheduleSystemMessageAction(buildInput());
      if (!res.ok) {
        setFeedback({ type: "err", text: res.error ?? "Planen fehlgeschlagen." });
        return;
      }
      setFeedback({ type: "ok", text: "Nachricht wurde geplant." });
      resetComposer();
      router.refresh();
    });
  }

  function onSaveDraft() {
    runAction(async () => {
      const res = await saveDraftAction(buildInput());
      if (!res.ok) {
        setFeedback({ type: "err", text: res.error ?? "Speichern fehlgeschlagen." });
        return;
      }
      setFeedback({ type: "ok", text: "Entwurf gespeichert." });
      setEditingId(res.id ?? null);
      router.refresh();
    });
  }

  function onDelete(id: string) {
    if (!window.confirm("Diese Nachricht wirklich löschen?")) return;
    runAction(async () => {
      const res = await deleteSystemMessageAction(id);
      if (!res.ok) {
        setFeedback({ type: "err", text: res.error ?? "Löschen fehlgeschlagen." });
        return;
      }
      if (editingId === id) resetComposer();
      router.refresh();
    });
  }

  function onResendReport() {
    runAction(async () => {
      const res = await resendSystemReportAction();
      if (!res.ok) {
        setFeedback({ type: "err", text: res.error ?? "Versand fehlgeschlagen." });
        return;
      }
      setFeedback({ type: "ok", text: `Systemreport an ${res.recipients ?? 0} Admin(s) gesendet.` });
    });
  }

  function loadIntoComposer(item: HistoryItem) {
    setEditingId(item.id);
    setTitle(item.title);
    setBlocks(item.blocks.length > 0 ? item.blocks : [{ type: "paragraph", text: "" }]);
    setChannelEmail(item.channels.includes("email"));
    setChannelInApp(item.channels.includes("inapp"));
    setAudience(item.audience);
    setRecipientIds(item.recipientIds);
    const isScheduled = item.status === "scheduled" && !!item.scheduledAt;
    setScheduleEnabled(isScheduled);
    setScheduledAt(isScheduled ? isoToLocalInput(item.scheduledAt) : "");
    setFeedback({ type: "ok", text: "In den Editor geladen." });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Feedback */}
      {feedback && (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{
            borderColor: feedback.type === "ok" ? "hsl(142 70% 45% / 0.4)" : "hsl(0 70% 55% / 0.4)",
            background: feedback.type === "ok" ? "hsl(142 70% 45% / 0.1)" : "hsl(0 70% 55% / 0.1)",
            color: feedback.type === "ok" ? "hsl(142 70% 35%)" : "hsl(0 70% 45%)",
          }}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Composer ───────────────────────────────────────────── */}
        <div className="feature-card flex flex-col gap-5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              {editingId ? "Entwurf bearbeiten" : "Neue Nachricht"}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetComposer}
                className="text-xs underline"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                Neu beginnen
              </button>
            )}
          </div>

          {/* Titel */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
              Titel / Betreff
            </label>
            <input
              className={inputCls}
              style={inputStyle}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z.B. Wartungsarbeiten am Wochenende"
            />
          </div>

          {/* Bausteine */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
              Inhalt (Bausteine)
            </label>
            <div className="flex flex-col gap-3">
              {blocks.map((block, index) => (
                <BlockEditor
                  key={index}
                  block={block}
                  index={index}
                  count={blocks.length}
                  onChange={(b) => patchBlock(index, b)}
                  onRemove={() => removeBlock(index)}
                  onMove={(dir) => moveBlock(index, dir)}
                />
              ))}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {BLOCK_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addBlock(type)}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition hover:bg-[hsl(var(--secondary))]"
                  style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
                >
                  <Plus size={11} /> {BLOCK_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Kanäle */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
              Versandkanäle
            </label>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm" style={{ color: "hsl(var(--foreground))" }}>
                <input type="checkbox" checked={channelEmail} onChange={(e) => setChannelEmail(e.target.checked)} />
                <Mail size={14} /> E-Mail
              </label>
              <label className="inline-flex items-center gap-2 text-sm" style={{ color: "hsl(var(--foreground))" }}>
                <input type="checkbox" checked={channelInApp} onChange={(e) => setChannelInApp(e.target.checked)} />
                <Bell size={14} /> In-App (Glocke)
              </label>
            </div>
          </div>

          {/* Empfänger */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
              Empfänger
            </label>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm" style={{ color: "hsl(var(--foreground))" }}>
                <input
                  type="radio"
                  name="audience"
                  checked={audience === "all"}
                  onChange={() => setAudience("all")}
                />
                Alle Mitglieder ({directory.length})
              </label>
              <label className="inline-flex items-center gap-2 text-sm" style={{ color: "hsl(var(--foreground))" }}>
                <input
                  type="radio"
                  name="audience"
                  checked={audience === "selected"}
                  onChange={() => setAudience("selected")}
                />
                Ausgewählte ({recipientIds.length})
              </label>
            </div>
            {audience === "selected" && (
              <div
                className="mt-1 flex flex-col gap-2 rounded-lg border p-2"
                style={{ borderColor: "hsl(var(--border))" }}
              >
                <input
                  className={inputCls}
                  style={inputStyle}
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Mitglieder suchen…"
                />
                <div className="max-h-44 overflow-y-auto pr-1">
                  {filteredDirectory.length === 0 ? (
                    <p className="px-1 py-2 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      Keine Treffer.
                    </p>
                  ) : (
                    filteredDirectory.map((u) => (
                      <label
                        key={u.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-[hsl(var(--secondary))]"
                        style={{ color: "hsl(var(--foreground))" }}
                      >
                        <input
                          type="checkbox"
                          checked={recipientIds.includes(u.id)}
                          onChange={() => toggleRecipient(u.id)}
                        />
                        {u.displayName}
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Zeitplanung */}
          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 text-sm" style={{ color: "hsl(var(--foreground))" }}>
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
              />
              <Clock size={14} /> Zeitgesteuert senden
            </label>
            {scheduleEnabled && (
              <>
                <input
                  type="datetime-local"
                  className={inputCls}
                  style={inputStyle}
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
                <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Zeit in deiner lokalen Zeitzone. Bei aktivem QStash wird minutengenau zum
                  gewählten Zeitpunkt versendet; ohne QStash beim täglichen Versandlauf
                  (gegen 04:00 Uhr) nach diesem Zeitpunkt.
                </p>
              </>
            )}
          </div>

          {/* Aktionen */}
          <div className="flex flex-wrap gap-2 pt-1">
            {scheduleEnabled ? (
              <button
                type="button"
                disabled={isPending}
                onClick={onSchedule}
                className="brand-button inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                <Clock size={14} /> Planen
              </button>
            ) : (
              <button
                type="button"
                disabled={isPending}
                onClick={onSend}
                className="brand-button inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                <Send size={14} /> Jetzt senden
              </button>
            )}
            <button
              type="button"
              disabled={isPending}
              onClick={onSaveDraft}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-[hsl(var(--secondary))] disabled:opacity-60"
              style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
            >
              <Save size={14} /> Als Entwurf speichern
            </button>
          </div>
        </div>

        {/* ── Vorschau ───────────────────────────────────────────── */}
        <div className="feature-card flex flex-col gap-3 p-5">
          <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Live-Vorschau <span style={{ color: "hsl(var(--muted-foreground))" }}>(E-Mail-Layout)</span>
          </h2>
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "hsl(var(--border))" }}>
            <iframe
              title="Vorschau"
              srcDoc={previewHtml}
              className="h-[560px] w-full bg-white"
              sandbox=""
            />
          </div>
        </div>
      </div>

      {/* ── Systemreport erneut senden ───────────────────────────── */}
      <div className="feature-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}
          >
            <RefreshCw size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Systemreport erneut senden
            </h3>
            <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              Sendet den aktuellen Cron-Status-Tagesreport (inkl. Aktivitäten) sofort an alle Admins.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={onResendReport}
          className="inline-flex items-center gap-2 self-start rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-[hsl(var(--secondary))] disabled:opacity-60 sm:self-auto"
          style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
        >
          <Send size={14} /> An Admins senden
        </button>
      </div>

      {/* ── Verlauf ──────────────────────────────────────────────── */}
      <div className="feature-card flex flex-col gap-3 p-5">
        <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
          Verlauf & Entwürfe
        </h2>
        {history.length === 0 ? (
          <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            Noch keine Nachrichten erstellt.
          </p>
        ) : (
          <div className="flex flex-col divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {history.map((item) => (
              <HistoryRow
                key={item.id}
                item={item}
                isPending={isPending}
                onLoad={loadIntoComposer}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Verlauf-Zeile inkl. ausklappbarer Bestätigungen ─────────────────

function HistoryRow({
  item,
  isPending,
  onLoad,
  onDelete,
}: {
  item: HistoryItem;
  isPending: boolean;
  onLoad: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[item.status];
  const editable =
    item.status === "draft" || item.status === "scheduled" || item.status === "failed";
  const hasStats = item.status === "sent" && item.recipientStats.length > 0;

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
          style={{ background: meta.bg, color: meta.color }}
        >
          {meta.label}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
            {item.title || "Ohne Titel"}
          </p>
          <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
            {item.channels.includes("email") ? "E-Mail" : ""}
            {item.channels.length === 2 ? " + " : ""}
            {item.channels.includes("inapp") ? "In-App" : ""}
            {" · "}
            {item.audience === "all" ? "Alle" : `${item.recipientIds.length} ausgewählt`}
            {item.status === "sent" &&
              ` · ${item.recipientCount} Empf. (Mail ${item.emailSentCount}/In-App ${item.inappSentCount}) · ${formatDateTime(item.sentAt)}`}
            {item.status === "scheduled" && ` · geplant für ${formatDateTime(item.scheduledAt)}`}
            {item.status === "draft" && ` · erstellt ${formatDateTime(item.createdAt)}`}
            {item.status === "failed" && " · Versand fehlgeschlagen"}
          </p>
          {item.status === "sent" && (
            <p className="mt-0.5 text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
              👁 {item.openedCount} geöffnet · 🔗 {item.clickedCount} geklickt · ✅ {item.inappReadCount} in-app gelesen
            </p>
          )}
        </div>
        {hasStats && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition hover:bg-[hsl(var(--secondary))]"
            style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
          >
            {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />} Details
          </button>
        )}
        {editable && (
          <button
            type="button"
            onClick={() => onLoad(item)}
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition hover:bg-[hsl(var(--secondary))]"
            style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
          >
            <FileText size={11} /> Bearbeiten
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() => onDelete(item.id)}
          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition hover:bg-[hsl(0_70%_55%/0.1)] disabled:opacity-60"
          style={{ borderColor: "hsl(var(--border))", color: "hsl(0 70% 50%)" }}
        >
          <Trash2 size={11} /> Löschen
        </button>
      </div>

      {open && hasStats && (
        <div
          className="mt-3 overflow-hidden rounded-lg border"
          style={{ borderColor: "hsl(var(--border))" }}
        >
          <table className="w-full text-left text-xs">
            <thead className="bg-[hsl(var(--secondary))]" style={{ color: "hsl(var(--muted-foreground))" }}>
              <tr>
                <th className="px-3 py-1.5 font-medium">Empfänger</th>
                <th className="px-3 py-1.5 font-medium">E-Mail geöffnet</th>
                <th className="px-3 py-1.5 font-medium">Klick</th>
                <th className="px-3 py-1.5 font-medium">In-App gelesen</th>
              </tr>
            </thead>
            <tbody>
              {item.recipientStats.map((r) => (
                <tr key={r.userId} className="border-t" style={{ borderColor: "hsl(var(--border))" }}>
                  <td className="px-3 py-1.5" style={{ color: "hsl(var(--foreground))" }}>
                    {r.name}
                  </td>
                  <td className="px-3 py-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {!r.emailSent ? "—" : r.openedAt ? `✓ ${formatDateTime(r.openedAt)}` : "offen"}
                  </td>
                  <td className="px-3 py-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {r.clickedAt ? `✓ ${formatDateTime(r.clickedAt)}` : "—"}
                  </td>
                  <td className="px-3 py-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {!r.inappSent ? "—" : r.inappReadAt ? `✓ ${formatDateTime(r.inappReadAt)}` : "ungelesen"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Einzel-Baustein-Editor ──────────────────────────────────────────

function BlockEditor({
  block,
  index,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  block: SystemMessageBlock;
  index: number;
  count: number;
  onChange: (b: SystemMessageBlock) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "hsl(var(--border))" }}>
      <div className="mb-2 flex items-center justify-between">
        <span
          className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          {BLOCK_LABELS[block.type]}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="rounded p-1 disabled:opacity-30 hover:bg-[hsl(var(--secondary))]"
            aria-label="Nach oben"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            <ArrowUp size={13} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            className="rounded p-1 disabled:opacity-30 hover:bg-[hsl(var(--secondary))]"
            aria-label="Nach unten"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            <ArrowDown size={13} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1 hover:bg-[hsl(0_70%_55%/0.1)]"
            aria-label="Entfernen"
            style={{ color: "hsl(0 70% 50%)" }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {block.type === "heading" && (
        <input
          className={inputCls}
          style={inputStyle}
          value={block.text}
          onChange={(e) => onChange({ type: "heading", text: e.target.value })}
          placeholder="Überschrift"
        />
      )}

      {block.type === "paragraph" && (
        <textarea
          className={`${inputCls} min-h-[80px] resize-y`}
          style={inputStyle}
          value={block.text}
          onChange={(e) => onChange({ type: "paragraph", text: e.target.value })}
          placeholder="Text… (Zeilenumbrüche werden übernommen)"
        />
      )}

      {block.type === "button" && (
        <div className="flex flex-col gap-2">
          <input
            className={inputCls}
            style={inputStyle}
            value={block.label}
            onChange={(e) => onChange({ type: "button", label: e.target.value, href: block.href })}
            placeholder="Beschriftung (z.B. Öffnen)"
          />
          <input
            className={inputCls}
            style={inputStyle}
            value={block.href}
            onChange={(e) => onChange({ type: "button", label: block.label, href: e.target.value })}
            placeholder="https://…"
          />
        </div>
      )}

      {block.type === "notice" && (
        <div className="flex flex-col gap-2">
          <select
            className={inputCls}
            style={inputStyle}
            value={block.tone}
            onChange={(e) =>
              onChange({
                type: "notice",
                tone: e.target.value as "info" | "warn" | "success",
                text: block.text,
              })
            }
          >
            <option value="info">Info (blau)</option>
            <option value="warn">Achtung (gelb)</option>
            <option value="success">Erfolg (grün)</option>
          </select>
          <textarea
            className={`${inputCls} min-h-[60px] resize-y`}
            style={inputStyle}
            value={block.text}
            onChange={(e) => onChange({ type: "notice", tone: block.tone, text: e.target.value })}
            placeholder="Hinweistext…"
          />
        </div>
      )}

      {block.type === "image" && (
        <div className="flex flex-col gap-2">
          <input
            className={inputCls}
            style={inputStyle}
            value={block.src}
            onChange={(e) => onChange({ type: "image", src: e.target.value, alt: block.alt ?? "" })}
            placeholder="Bild-URL (https://…)"
          />
          <input
            className={inputCls}
            style={inputStyle}
            value={block.alt ?? ""}
            onChange={(e) => onChange({ type: "image", src: block.src, alt: e.target.value })}
            placeholder="Alternativtext"
          />
        </div>
      )}

      {block.type === "divider" && (
        <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          Horizontale Trennlinie.
        </p>
      )}
    </div>
  );
}
