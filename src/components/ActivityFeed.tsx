"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

type AuditRow = {
  ts: string;
  action: string;
  actor_email: string | null;
  target: string | null;
  detail: any | null;
};

export default function ActivityFeed({ initial }: { initial: AuditRow[] }) {
  const [items, setItems] = useState<AuditRow[]>(initial);
  const sbRef = useRef<ReturnType<typeof createBrowserClient> | null>(null);

  useEffect(() => {
    const sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    sbRef.current = sb;

    const sub = sb
      .channel("audit_events_stream")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audit_events" },
        (payload: any) => {
          const row = payload.new as AuditRow;
          setItems((prev) => [row, ...prev].slice(0, 100));
        }
      )
      .subscribe();

    return () => {
      sub.unsubscribe();
    };
  }, []);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2 font-medium">Zeit</th>
            <th className="px-3 py-2 font-medium">Aktion</th>
            <th className="px-3 py-2 font-medium">User</th>
            <th className="px-3 py-2 font-medium">Ziel</th>
            <th className="px-3 py-2 font-medium">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {items.map((e, idx) => (
            <tr key={`${e.ts}-${idx}`}>
              <td className="px-3 py-2 text-zinc-300 text-xs whitespace-nowrap">
                {new Date(e.ts).toLocaleString()}
              </td>
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
