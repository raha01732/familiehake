"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Loader2, Check, X } from "lucide-react";

type Result = "success" | "skipped" | "error" | null;

export default function RunCronButton({ jobName }: { jobName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>(null);

  const run = async () => {
    setPending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/cron/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobName }),
      });
      const json = await res.json();
      const skipped = Boolean(json?.result?.skipped);
      setResult(json.ok ? (skipped ? "skipped" : "success") : "error");
      router.refresh();
    } catch {
      setResult("error");
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={run}
      disabled={pending}
      title={`${jobName} jetzt manuell ausführen`}
      className="inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium transition-colors"
      style={{
        borderColor:
          result === "success"
            ? "hsl(142 71% 45% / 0.4)"
            : result === "error"
              ? "hsl(0 84% 60% / 0.4)"
              : "hsl(var(--border))",
        color:
          result === "success"
            ? "hsl(142 71% 35%)"
            : result === "error"
              ? "hsl(0 72% 51%)"
              : "hsl(var(--muted-foreground))",
        background: "hsl(var(--card))",
      }}
    >
      {pending ? (
        <Loader2 size={11} className="animate-spin" />
      ) : result === "success" ? (
        <Check size={11} />
      ) : result === "error" ? (
        <X size={11} />
      ) : (
        <Play size={11} />
      )}
      {pending
        ? "läuft…"
        : result === "success"
          ? "OK"
          : result === "skipped"
            ? "übersprungen"
            : result === "error"
              ? "Fehler"
              : "Jetzt ausführen"}
    </button>
  );
}
