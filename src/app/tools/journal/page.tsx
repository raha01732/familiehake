"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@clerk/nextjs";

type Row = {
  id: string;
  title: string;
  content_md: string;
  created_at: string;
  updated_at: string;
};

export default function JournalPage() {
  const sb = createClient();
  const { userId } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    (async () => {
      const { data } = await sb
        .from("journal_entries")
        .select("id,title,content_md,created_at,updated_at")
        .order("created_at", { ascending: false });
      setRows(data ?? []);
      setLoading(false);
    })();
  }, [sb]);

  async function createEntry() {
    const title = `Eintrag ${new Date().toLocaleDateString()}`;
    const { data, error } = await sb
      .from("journal_entries")
      .insert({ title, content_md: "# Neuer Eintrag\n\n" })
      .select("id,title,content_md,created_at,updated_at")
      .single();
    if (!error && data) {
      setRows((r) => [data, ...r]);
    }
  }

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveRow(row: Row) {
    startSaving(async () => {
      await sb
        .from("journal_entries")
        .update({ title: row.title, content_md: row.content_md })
        .eq("id", row.id);
    });
  }

  if (!userId) {
    return (
      <section className="p-6">
        <div className="text-sm text-zinc-400">Bitte anmelden.</div>
      </section>
    );
  }

  return (
    <section className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">Journal</h1>
        <button onClick={createEntry} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-900">
          Neuer Eintrag
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-400">Lade…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-zinc-400">Noch keine Einträge.</div>
      ) : (
        <div className="grid gap-4">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
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
                {saving ? "Speichere…" : "Auto-Save beim Verlassen des Feldes"}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
