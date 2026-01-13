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

export default function ActivityFeed({
  initial,
  debug = false,
}: {
  initial: AuditRow[];
  debug?: boolean;
}) {
  const [items, setItems] = useState<AuditRow[]>(initial);
  const [rtStatus, setRtStatus] = useState<string>("init");
  const [rtError, setRtError] = useState<string | null>(null);

  const sbRef = useRef<ReturnType<typeof createBrowserClient> | null>(null);

  useEffect(() => {
    // ===================== MINI-DEBUG START =====================
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anon) {
      const msg =
        "Realtime disabled: NEXT_PUBLIC_SUPABASE_URL oder NEXT_PUBLIC_SUPABASE_ANON_KEY fehlt.";
      console.warn("[ActivityFeed MINI-DEBUG]", msg, { url: !!url, anon: !!anon });
      setRtStatus("env_missing");
      setRtError(msg);
      return;
    }

    // Wichtiger als window.WebSocket: globalThis.WebSocket (wird von Libraries oft genutzt)
    const WS: any = (globalThis as any).WebSocket;

    // ✅ Strenger Guard: muss ein echter Constructor sein
    if (typeof WS !== "function") {
      const msg = "Realtime disabled: globalThis.WebSocket is not available.";
      console.warn("[ActivityFeed MINI-DEBUG]", msg, {
        hasWindow: typeof window !== "undefined",
        windowWS: typeof window !== "undefined" ? typeof (window as any).WebSocket : "n/a",
        globalWS: typeof WS,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "n/a",
      });
      setRtStatus("ws_missing");
      setRtError(msg);
      return;
    }
    // ===================== MINI-DEBUG END =====================

    try {
      // ✅ WebSocket explizit an Supabase durchreichen (damit Realtime nicht "raten" muss)
      const sb = createBrowserClient(url, anon, {
        realtime: { WebSocket: WS } as any,
      } as any);

      sbRef.current = sb;

      const channel = sb
        .channel("audit_events_stream")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "audit_events" },
          (payload: any) => {
            try {
              const row = payload.new as AuditRow;
              setItems((prev) => [row, ...prev].slice(0, 100));
            } catch (e: any) {
              console.error("[ActivityFeed] payload handling failed", e);
              setRtError(e?.message ?? "payload_handling_failed");
            }
          }
        );

      channel.subscribe((status) => {
        setRtStatus(String(status));
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[ActivityFeed] realtime subscribe status:", status);
        }
      });

      return () => {
        try {
          channel.unsubscribe();
        } catch (e) {
          console.warn("[ActivityFeed] unsubscribe failed", e);
        }
      };
    } catch (e: any) {
      console.error("[ActivityFeed] createBrowserClient failed", e);
      setRtStatus("client_create_failed");
      setRtError(e?.message ?? "createBrowserClient_failed");
    }
  }, []);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      {debug && (
        <div className="border-b border-zinc-800 bg-zinc-950/40 p-3 text-[11px] text-zinc-300">
          <div>
            <span className="text-zinc-500">Realtime status:</span>{" "}
            <span className="font-mono">{rtStatus}</span>
          </div>
          {rtError && (
            <div className="mt-1 whitespace-pre-wrap text-amber-300">
              <span className="text-zinc-500">Realtime error:</span>{" "}
              <span className="font-mono">{rtError}</span>
            </div>
          )}
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

