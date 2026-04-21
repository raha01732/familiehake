// src/components/ActivityFeed.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type AuditRow = {
  ts: string;
  action: string;
  actor_email: string | null;
  target: string | null;
  detail: any | null;
};

const POLL_INTERVAL_MS = 10_000;

export default function ActivityFeed({
  initial,
  debug = false,
}: {
  initial: AuditRow[];
  debug?: boolean;
}) {
  const [items, setItems] = useState<AuditRow[]>(initial);
  const [pollStatus, setPollStatus] = useState<"idle" | "polling" | "error">("idle");
  const [latestTs, setLatestTs] = useState<string | null>(initial[0]?.ts ?? null);
  const latestTsRef = useRef<string | null>(initial[0]?.ts ?? null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      setPollStatus("polling");
      try {
        const url = latestTsRef.current
          ? `/api/audit/recent?after=${encodeURIComponent(latestTsRef.current)}`
          : "/api/audit/recent";

        const res = await fetch(url);
        if (!res.ok) {
          console.warn("[ActivityFeed] poll failed:", res.status);
          setPollStatus("error");
          return;
        }

        const json = await res.json();
        const newRows: AuditRow[] = json.data ?? [];

        if (newRows.length > 0) {
          latestTsRef.current = newRows[0].ts;
          setLatestTs(newRows[0].ts);
          setItems((prev) => [...newRows, ...prev].slice(0, 100));
        }

        setPollStatus("idle");
      } catch (e) {
        console.error("[ActivityFeed] poll error:", e);
        setPollStatus("error");
      }
    }

    const id = setInterval(() => {
      if (!cancelled) poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      {debug && (
        <div className="border-b border-zinc-800 bg-zinc-950/40 p-3 text-[11px] text-zinc-300">
          <div>
            <span className="text-zinc-500">Poll-Status:</span>{" "}
            <span className="font-mono">{pollStatus}</span>
          </div>
          <div className="mt-1">
            <span className="text-zinc-500">Letzter ts:</span>{" "}
            <span className="font-mono">{latestTs ?? "—"}</span>
          </div>
        </div>
      )}

      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2">Zeit</th>
            <th className="px-3 py-2">Aktion</th>
            <th className="px-3 py-2">Akteur</th>
            <th className="px-3 py-2">Ziel</th>
            <th className="px-3 py-2">Detail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {items.map((e, idx) => (
            <tr key={`${e.ts}-${e.action}-${idx}`} className="hover:bg-zinc-900/40">
              <td className="px-3 py-2 text-zinc-400 text-xs font-mono">{e.ts}</td>
              <td className="px-3 py-2 text-zinc-300 text-xs">{e.action}</td>
              <td className="px-3 py-2 text-zinc-400 text-xs">{e.actor_email ?? "—"}</td>
              <td className="px-3 py-2 text-zinc-400 text-xs">{e.target ?? "—"}</td>
              <td className="px-3 py-2 text-zinc-500 text-[11px]">
                {e.detail ? JSON.stringify(e.detail) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
