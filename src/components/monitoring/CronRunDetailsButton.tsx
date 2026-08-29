"use client";

import { useState, type ReactNode } from "react";
import { Eye } from "lucide-react";
import { Modal } from "@/components/Modal";
import { cronJobLabel } from "@/lib/cron-registry";

type Props = {
  jobName: string;
  runDay: string;
  trigger: string | null;
  success: boolean;
  skipped: boolean;
  durationMs: number | null;
  errorMessage: string | null;
  finishedAt: string;
  details: unknown;
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2 text-xs last:border-b-0" style={{ borderColor: "hsl(var(--border))" }}>
      <span style={{ color: "hsl(var(--muted-foreground))" }}>{label}</span>
      <span className="text-right" style={{ color: "hsl(var(--foreground))" }}>{children}</span>
    </div>
  );
}

export default function CronRunDetailsButton(props: Props) {
  const [open, setOpen] = useState(false);
  const hasDetailsJson =
    props.details !== null &&
    props.details !== undefined &&
    !(typeof props.details === "object" && Object.keys(props.details as object).length === 0);

  const statusLabel = props.skipped ? "Übersprungen" : props.success ? "Erfolgreich" : "Fehler";
  const statusColor = props.skipped
    ? "hsl(var(--muted-foreground))"
    : props.success
      ? "hsl(142 71% 35%)"
      : "hsl(0 72% 51%)";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Lauf-Details anzeigen"
        className="inline-flex items-center justify-center rounded-lg border p-1 transition-colors"
        style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
      >
        <Eye size={13} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`${cronJobLabel(props.jobName)} · Lauf-Details`}>
        <div className="flex flex-col">
          <Row label="Job">
            {cronJobLabel(props.jobName)}{" "}
            <span className="font-mono text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
              ({props.jobName})
            </span>
          </Row>
          <Row label="Status">
            <span style={{ color: statusColor, fontWeight: 600 }}>{statusLabel}</span>
          </Row>
          <Row label="Trigger">{props.trigger ?? "—"}</Row>
          <Row label="Tag">{props.runDay}</Row>
          <Row label="Abgeschlossen">{props.finishedAt}</Row>
          <Row label="Dauer">{props.durationMs != null ? `${props.durationMs} ms` : "—"}</Row>
          {props.errorMessage && (
            <Row label="Fehler">
              <span style={{ color: "hsl(0 72% 51%)" }}>{props.errorMessage}</span>
            </Row>
          )}
        </div>

        <p className="mb-1 mt-4 text-xs font-semibold" style={{ color: "hsl(var(--foreground))" }}>
          Details (JSON)
        </p>
        {hasDetailsJson ? (
          <pre
            className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-all rounded-lg p-3 text-xs"
            style={{ background: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }}
          >
            {JSON.stringify(props.details, null, 2)}
          </pre>
        ) : (
          <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            Keine zusätzlichen Details für diesen Lauf gespeichert.
          </p>
        )}
      </Modal>
    </>
  );
}
