// src/components/CommandMenu.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Item = {
  label: string;
  href?: string;
  action?: () => void;
  kbd?: string;
};

const ROUTES: Item[] = [
  { label: "Dashboard", href: "/dashboard", kbd: "G D" },
  { label: "Admin – Übersicht", href: "/admin", kbd: "G A" },
  { label: "Admin – Einstellungen", href: "/admin/settings" },
  { label: "Admin – Benutzer", href: "/admin/users" },
  { label: "Monitoring", href: "/monitoring" },
  { label: "Dateien", href: "/tools/files" },
  { label: "Aktivitäten", href: "/activity" },
];

export default function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();

  // ⌘K / Ctrl+K zum Öffnen/Schließen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return ROUTES;
    return ROUTES.filter((i) => i.label.toLowerCase().includes(term) || i.href?.includes(term));
  }, [q]);

  const onAction = (it: Item) => {
    setOpen(false);
    if (it.href) router.push(it.href);
    else it.action?.();
  };

  return (
    <>
      {/* Kleiner Trigger-Button unten rechts (kannst du auskommentieren, wenn nur Shortcut gewünscht) */}
      <div className="fixed right-4 bottom-4 z-40">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl border border-slate-200 bg-white/90 backdrop-blur px-3 py-2 text-xs font-medium text-slate-800 shadow-md transition hover:-translate-y-[1px] hover:border-sky-200 hover:bg-sky-50"
          title="Befehlspalette (⌘K / Ctrl+K)"
        >
          ⌘K
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-modal="true"
          role="dialog"
        >
          <div
            className="mx-auto mt-24 w-full max-w-xl rounded-2xl border border-slate-200 bg-white/95 shadow-2xl"
            onClick={(e) => e.stopPropagation()} // Klicks im Panel nicht schließen lassen
          >
            <div className="border-b border-slate-200 p-3">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Suchen oder springen…"
                className="w-full bg-transparent text-slate-900 placeholder-slate-400 outline-none text-sm"
              />
            </div>
            <div className="max-h-80 overflow-auto p-2">
              {items.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-500">Nichts gefunden.</div>
              ) : (
                <ul className="grid gap-1">
                  {items.map((it, idx) => (
                    <li key={idx}>
                      <button
                        type="button"
                        onClick={() => onAction(it)}
                        className="w-full text-left rounded-lg px-3 py-2 text-sm text-slate-900 hover:bg-sky-50 flex items-center justify-between"
                      >
                        <span>{it.label}</span>
                        {it.kbd && (
                          <span className="text-[10px] text-slate-500 border border-slate-200 rounded px-1 py-0.5 bg-white/60">
                            {it.kbd}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2">
              <div className="text-[11px] text-slate-500">Enter: Öffnen · Esc: Schließen</div>
              <div className="text-[11px] text-slate-600">Befehlspalette</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
