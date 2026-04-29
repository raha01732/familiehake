// /workspace/familiehake/src/app/tools/calender/CalendarClientPage.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PreviewPlaceholder } from "@/components/PreviewNotice";

type Row = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location?: string | null;
  description?: string | null;
};

export default function CalendarPage() {
  const isPreview = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState<Partial<Row>>({ title: "", starts_at: "", ends_at: "", location: "", description: "" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/calendar/events");
      const json = await res.json();
      if (!cancelled && json?.ok) setRows(json.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function addEvent() {
    if (!form.title || !form.starts_at || !form.ends_at) return;
    const res = await fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        starts_at: form.starts_at,
        ends_at: form.ends_at,
        location: form.location ?? null,
        description: form.description ?? null,
      }),
    });
    const json = await res.json();
    if (json?.ok && json.data) setRows((r) => [...r, json.data]);
    setForm({ title: "", starts_at: "", ends_at: "", location: "", description: "" });
  }

  if (isPreview) {
    return (
      <section className="p-6">
        <PreviewPlaceholder
          title="Kalender (Preview)"
          description="Kalendertermine werden in der Preview nicht aus externen Datenquellen geladen."
          fields={["Termine", "Exportdaten", "Kalender-Integrationen"]}
        />
      </section>
    );
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
