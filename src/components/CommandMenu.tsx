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

  // ⌘K / Ctrl+K zum Öffnen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      // ESC schließt
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
      {/* unsichtbarer Hotkey-Helfer */}
      <button
        aria-hidden
        tabIndex={-1}
        style={{ position: "fixed", inset: "-1000px" }}
        onClick={() => setOpen(true)}
      />
      {/* Trigger-Button unten rechts */}
      <div className="fixed right-4 bottom-4 z-40">
        <button
          onClick={() => setOpen(true)}
          className="rounded-xl border border-zinc-700 bg-zinc-900/70 backdrop-blur px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800/70"
          title="Befehlspalette (⌘K / Ctrl+K)"
        >
          ⌘K
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="mx-auto mt-24 w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-zinc-800 p-3">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Suchen oder springen…"
                className="w-full bg-transparent text-zinc-100 placeholder-zinc-500 outline-none text-sm"
              />
            </div>
            <div className="max-h-80 overflow-auto p-2">
              {items.length === 0 ? (
                <div className="p-4 text-center text-sm text-zinc-500">Nichts gefunden.</div>
              ) : (
                <ul className="grid gap-1">
                  {items.map((it, idx) => (
                    <li key={idx}>
                      <button
                        onClick={() => onAction(it)}
                        className="w-full text-left rounded-lg px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900/70 flex items-center justify-between"
                      >
                        <span>{it.label}</span>
                        {it.kbd && (
                          <span className="text-[10px] text-zinc-500 border border-zinc-800 rounded px-1 py-0.5">
                            {it.kbd}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-zinc-800 px-3 py-2">
              <div className="text-[11px] text-zinc-500">Enter: Öffnen · Esc: Schließen</div>
              <div className="text-[11px] text-zinc-600">Befehlspalette</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
