// /workspace/familiehake/src/app/tools/journal/JournalClientPage.tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useAuth } from "@clerk/nextjs";
import { PreviewPlaceholder } from "@/components/PreviewNotice";

type Row = {
  id: string;
  title: string;
  content_md: string;
  created_at: string;
  updated_at: string;
};

type DraftState = {
  saving: boolean;
  savedAt: string | null;
  restored: boolean;
};

const DRAFT_DEBOUNCE_MS = 1500;

export default function JournalPage() {
  const isPreview = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
  const { userId } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, startSaving] = useTransition();
  const [draftState, setDraftState] = useState<Record<string, DraftState>>({});
  const draftTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Initial load + Drafts wiederherstellen ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/journal/entries");
      const json = await res.json();
      if (cancelled) return;
      const dbRows: Row[] = json?.ok ? (json.data ?? []) : [];

      // Drafts pro Eintrag prüfen — bei vorhandenem Draft den Inhalt überschreiben
      const restored: Record<string, DraftState> = {};
      const finalRows: Row[] = await Promise.all(
        dbRows.map(async (row): Promise<Row> => {
          try {
            const draftRes = await fetch(`/api/journal/draft?entryId=${row.id}`);
            const draftJson = await draftRes.json();
            const draft = draftJson?.data;
            if (draft && draft.saved_at && new Date(draft.saved_at) > new Date(row.updated_at)) {
              restored[row.id] = {
                saving: false,
                savedAt: draft.saved_at,
                restored: true,
              };
              return { ...row, title: draft.title, content_md: draft.content_md };
            }
          } catch {
            // ignore
          }
          return row;
        }),
      );
      if (!cancelled) {
        setRows(finalRows);
        setDraftState(restored);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Aufräumen bei Unmount ────────────────────────────────────────────────
  useEffect(() => {
    const timers = draftTimers.current;
    return () => {
      for (const t of Object.values(timers)) clearTimeout(t);
    };
  }, []);

  async function createEntry() {
    const title = `Eintrag ${new Date().toLocaleDateString()}`;
    const res = await fetch("/api/journal/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content_md: "# Neuer Eintrag\n\n" }),
    });
    const json = await res.json();
    if (json?.ok && json.data) {
      setRows((r) => [json.data, ...r]);
    }
  }

  function pushDraft(row: Row) {
    setDraftState((s) => ({
      ...s,
      [row.id]: { saving: true, savedAt: s[row.id]?.savedAt ?? null, restored: false },
    }));
    fetch("/api/journal/draft", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entryId: row.id,
        title: row.title,
        content_md: row.content_md,
      }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (json?.ok) {
          setDraftState((s) => ({
            ...s,
            [row.id]: { saving: false, savedAt: json.data.saved_at, restored: false },
          }));
        } else {
          setDraftState((s) => ({
            ...s,
            [row.id]: { saving: false, savedAt: s[row.id]?.savedAt ?? null, restored: false },
          }));
        }
      })
      .catch(() => {
        setDraftState((s) => ({
          ...s,
          [row.id]: { saving: false, savedAt: s[row.id]?.savedAt ?? null, restored: false },
        }));
      });
  }

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((all) => {
      const next = all.map((r) => (r.id === id ? { ...r, ...patch } : r));
      const updated = next.find((r) => r.id === id);
      if (updated) {
        // Debounced Draft-Push nach Tipp-Pause
        if (draftTimers.current[id]) clearTimeout(draftTimers.current[id]);
        draftTimers.current[id] = setTimeout(() => pushDraft(updated), DRAFT_DEBOUNCE_MS);
      }
      return next;
    });
  }

  async function saveRow(row: Row) {
    // Pending Draft-Save abbrechen — wir gehen direkt in die DB
    if (draftTimers.current[row.id]) {
      clearTimeout(draftTimers.current[row.id]);
      delete draftTimers.current[row.id];
    }
    startSaving(async () => {
      const res = await fetch(`/api/journal/entries/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: row.title, content_md: row.content_md }),
      });
      const json = await res.json();
      if (json?.ok) {
        // Draft entfernen — DB ist nun die Wahrheit
        await fetch(`/api/journal/draft?entryId=${row.id}`, { method: "DELETE" }).catch(() => {});
        setDraftState((s) => {
          const { [row.id]: _, ...rest } = s;
          void _;
          return rest;
        });
      }
    });
  }

  if (!userId) {
    return (
      <section className="p-6">
        <div className="text-sm text-zinc-400">Bitte anmelden.</div>
      </section>
    );
  }

  if (isPreview) {
    return (
      <section className="p-6">
        <PreviewPlaceholder
          title="Journal (Preview)"
          description="In der Preview können keine echten Journal-Einträge geladen oder gespeichert werden."
          fields={["Einträge", "Editor-Inhalte", "Speicheraktionen"]}
        />
      </section>
    );
  }

  return (
    <section className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">Journal</h1>
        <button
          onClick={createEntry}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-900"
        >
          Neuer Eintrag
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-400">Lade…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-zinc-400">Noch keine Einträge.</div>
      ) : (
        <div className="grid gap-4">
          {rows.map((r) => {
            const d = draftState[r.id];
            return (
              <div key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                {d?.restored && (
                  <div className="mb-2 rounded-md border border-amber-700/40 bg-amber-900/20 px-2 py-1 text-[11px] text-amber-200">
                    Nicht gespeicherter Entwurf wiederhergestellt — beim Verlassen des Feldes
                    wird in die DB übernommen.
                  </div>
                )}
                <input
                  value={r.title}
                  onChange={(e) => updateRow(r.id, { title: e.target.value })}
                  onBlur={() => saveRow(r)}
                  className="w-full bg-transparent text-zinc-100 font-medium outline-none"
                />
                <textarea
                  value={r.content_md}
                  onChange={(e) => updateRow(r.id, { content_md: e.target.value })}
                  onBlur={() => saveRow(r)}
                  className="mt-2 w-full min-h-[160px] bg-transparent text-sm text-zinc-200 outline-none"
                  placeholder="Markdown…"
                />
                <div className="mt-2 text-[11px] text-zinc-500">
                  {saving
                    ? "Speichere in DB…"
                    : d?.saving
                      ? "Entwurf wird gesichert…"
                      : d?.savedAt
                        ? `Entwurf gesichert ${formatRelative(d.savedAt)}`
                        : "Auto-Save beim Verlassen des Feldes"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  if (diff < 5_000) return "gerade eben";
  if (diff < 60_000) return `vor ${Math.floor(diff / 1000)} s`;
  if (diff < 60 * 60_000) return `vor ${Math.floor(diff / 60_000)} min`;
  return new Date(iso).toLocaleTimeString();
}
