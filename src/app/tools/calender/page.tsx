"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

type Row = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location?: string | null;
  description?: string | null;
};

export default function CalendarPage() {
  const sb = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState<Partial<Row>>({ title: "", starts_at: "", ends_at: "", location: "", description: "" });

  useEffect(() => {
    (async () => {
      const { data } = await sb
        .from("calendar_events")
        .select("id,title,starts_at,ends_at,location,description")
        .order("starts_at", { ascending: true });
      setRows(data ?? []);
    })();
  }, [sb]);

  async function addEvent() {
    if (!form.title || !form.starts_at || !form.ends_at) return;
    const { data } = await sb
      .from("calendar_events")
      .insert({
        title: form.title,
        starts_at: form.starts_at,
        ends_at: form.ends_at,
        location: form.location,
        description: form.description,
      })
      .select("*")
      .single();
    if (data) setRows((r) => [...r, data]);
    setForm({ title: "", starts_at: "", ends_at: "", location: "", description: "" });
  }

  return (
    <section className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">Kalender</h1>
        <Link
          href="/api/calendar/export"
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-900"
        >
          Export (.ics)
        </Link>
      </div>

      <div className="card p-4 flex flex-col gap-2">
        <div className="text-sm text-zinc-400">Neuer Termin</div>
        <input
          placeholder="Titel"
          value={form.title ?? ""}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="rounded bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm"
        />
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            type="datetime-local"
            value={form.starts_at ?? ""}
            onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
            className="rounded bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm"
          />
          <input
            type="datetime-local"
            value={form.ends_at ?? ""}
            onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
            className="rounded bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm"
          />
        </div>
        <input
          placeholder="Ort"
          value={form.location ?? ""}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
          className="rounded bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm"
        />
        <textarea
          placeholder="Beschreibung"
          value={form.description ?? ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="rounded bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm"
        />
        <div>
          <button onClick={addEvent} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-900">
            Speichern
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="font-medium text-zinc-100">{r.title}</div>
            <div className="text-xs text-zinc-400">
              {new Date(r.starts_at).toLocaleString()} – {new Date(r.ends_at).toLocaleString()}
            </div>
            {r.location && <div className="text-xs text-zinc-400 mt-1">{r.location}</div>}
            {r.description && <div className="text-sm text-zinc-300 mt-2 whitespace-pre-wrap">{r.description}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
