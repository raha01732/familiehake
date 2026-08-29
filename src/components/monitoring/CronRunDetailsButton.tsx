"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Modal } from "@/components/Modal";
import { cronJobLabel } from "@/lib/cron-registry";

export default function CronRunDetailsButton({
  jobName,
  finishedAt,
  details,
}: {
  jobName: string;
  finishedAt: string;
  details: unknown;
}) {
  const [open, setOpen] = useState(false);
  const hasDetails =
    details !== null && details !== undefined && !(typeof details === "object" && Object.keys(details as object).length === 0);

  return (
    <>
      <button
        onClick={() => hasDetails && setOpen(true)}
        disabled={!hasDetails}
        title={hasDetails ? "Details anzeigen" : "Keine Details vorhanden"}
        className="inline-flex items-center justify-center rounded-lg border p-1 transition-colors disabled:opacity-30"
        style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
      >
        <Eye size={13} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`${cronJobLabel(jobName)} · Details`}>
        <p className="mb-3 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          {jobName} · {finishedAt}
        </p>
        <pre
          className="max-h-[60vh] overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap break-all"
          style={{ background: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }}
        >
          {JSON.stringify(details, null, 2)}
        </pre>
      </Modal>
    </>
  );
}
