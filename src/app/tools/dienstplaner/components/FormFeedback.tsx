"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ComponentPropsWithoutRef,
  type FormEvent,
  type ReactNode,
} from "react";

type Props = Omit<ComponentPropsWithoutRef<"form">, "action" | "onSubmit"> & {
  action: (fd: FormData) => Promise<void>;
  children: ReactNode;
  /** Erfolgs-Text. Default: "Gespeichert". */
  successText?: string;
  /** Wie lange das Feedback sichtbar bleibt (Default 5 s). */
  flashMs?: number;
  /** Position des Feedback-Badges innerhalb des form-Containers. */
  feedbackPlacement?: "inline" | "below";
};

/**
 * Drop-in-Ersatz für <form action={serverFn}> mit kurzem Erfolgs-/Fehler-Hinweis.
 * Standardmäßig wird das Feedback inline (am Ende der form-Children) angezeigt
 * und nach 5 Sekunden ausgeblendet.
 */
export default function FormFeedback({
  action,
  children,
  successText = "Gespeichert",
  flashMs = 5000,
  feedbackPlacement = "inline",
  className,
  ...formProps
}: Props) {
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function showFlash(kind: "ok" | "err", msg: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    setFlash({ kind, msg });
    timerRef.current = setTimeout(() => setFlash(null), flashMs);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await action(fd);
        showFlash("ok", successText);
      } catch (err) {
        showFlash("err", err instanceof Error ? err.message : "Fehler beim Speichern");
      }
    });
  }

  const badge = (() => {
    if (pending) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-[hsl(var(--muted-foreground))] whitespace-nowrap">
          <span className="inline-block w-2 h-2 rounded-full bg-[hsl(var(--muted-foreground))] animate-pulse" />
          Speichere…
        </span>
      );
    }
    if (flash) {
      const cls =
        flash.kind === "ok"
          ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
          : "text-red-500 border-red-500/30 bg-red-500/10";
      return (
        <span
          role="status"
          className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap ${cls}`}
        >
          {flash.kind === "ok" ? "✓" : "✕"} {flash.msg}
        </span>
      );
    }
    return null;
  })();

  return (
    <form
      {...formProps}
      className={className}
      onSubmit={handleSubmit}
    >
      {children}
      {feedbackPlacement === "inline" && badge}
      {feedbackPlacement === "below" && (
        <div className="col-span-full flex justify-end pt-1 min-h-[16px]">{badge}</div>
      )}
    </form>
  );
}
