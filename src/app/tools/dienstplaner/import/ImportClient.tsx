"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  ImportRecord,
  MatchConfidence,
  ParsedAvailabilityRow,
  ParsedScheduleRow,
} from "@/lib/dienstplaner/import-types";
import type { HistoryInsights } from "@/lib/dienstplaner/history-insights";

type EmployeeOption = { id: number; name: string };

type Props = {
  employees: EmployeeOption[];
  recentImports: ImportRecord[];
  insights: HistoryInsights;
  aiFallbackEnabled: boolean;
  confirmScheduleImportAction: (fd: FormData) => Promise<{ written: number }>;
  confirmAvailabilityImportAction: (
    fd: FormData
  ) => Promise<{ written: number; skipped: number }>;
  discardImportAction: (fd: FormData) => Promise<void>;
  applyHistoryWeekdayHeadcountAction: () => Promise<{
    updated: { weekday: number; requiredShifts: number }[];
  }>;
};

type Tab = "pdf" | "xlsx" | "analysis";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "— (leer / verfügbar)" },
  { value: "F", label: "F – Frei" },
  { value: "U", label: "U – Urlaub" },
  { value: "K", label: "K – Krank" },
  { value: "fr", label: "fr – Frühdienst bevorzugt" },
  { value: "sp", label: "sp – Spätdienst bevorzugt" },
  { value: "fix", label: "fix – feste Zeiten" },
];

const WEEKDAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MAX_UPLOAD_MB = 12;

const card =
  "rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4";
const primaryBtn =
  "inline-flex items-center gap-2 rounded-md bg-[hsl(var(--primary))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--primary-foreground))] transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed";
const ghostBtn =
  "inline-flex items-center gap-2 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))] disabled:opacity-50";
const inputCls =
  "rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]";

function confidenceBadge(c: MatchConfidence) {
  const map: Record<MatchConfidence, { label: string; cls: string }> = {
    exact: { label: "sicher", cls: "bg-emerald-500/15 text-emerald-400" },
    high: { label: "wahrscheinlich", cls: "bg-sky-500/15 text-sky-400" },
    low: { label: "unsicher", cls: "bg-amber-500/15 text-amber-400" },
    none: { label: "keine Zuordnung", cls: "bg-rose-500/15 text-rose-400" },
  };
  const v = map[c];
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${v.cls}`}>{v.label}</span>
  );
}

// ── PDF / Dienstplan-Import ────────────────────────────────────────────────

type ScheduleParseResponse = {
  importId: number;
  fileName: string;
  periodStart: string | null;
  periodEnd: string | null;
  notes: string[];
  employees: EmployeeOption[];
  scheduleRows: ParsedScheduleRow[];
};

type ScheduleDraft = {
  date: string;
  rawName: string;
  position: string;
  startTime: string;
  endTime: string;
  include: boolean;
};

type ScheduleNameMeta = {
  rawName: string;
  confidence: MatchConfidence;
  candidates: EmployeeOption[];
  count: number;
};

function SchedulePanel({
  employees,
  aiFallbackEnabled,
  confirmAction,
  onDone,
}: {
  employees: EmployeeOption[];
  aiFallbackEnabled: boolean;
  confirmAction: Props["confirmScheduleImportAction"];
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ScheduleParseResponse | null>(null);
  const [drafts, setDrafts] = useState<ScheduleDraft[]>([]);
  const [nameMeta, setNameMeta] = useState<ScheduleNameMeta[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, number | null>>({});
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleParse() {
    const file = fileRef.current?.files?.[0];
    setError(null);
    setResult(null);
    if (!file) {
      setError("Bitte zuerst ein PDF auswählen.");
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`Datei zu groß (max. ${MAX_UPLOAD_MB} MB).`);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", "schedule_pdf");
      if (/^\d{4}$/.test(year)) fd.set("month", `${year}-01`);
      const res = await fetch("/api/dienstplaner/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json?.error || `Fehler ${res.status}`);
        return;
      }
      const data = json as ScheduleParseResponse;
      setParsed(data);
      setDrafts(
        data.scheduleRows.map((r) => ({
          date: r.date,
          rawName: r.rawName,
          position: r.position ?? "",
          startTime: r.startTime ?? "",
          endTime: r.endTime ?? "",
          include: true,
        }))
      );

      // Eine Zuordnungs-Entscheidung je eindeutigem Namen statt je Schicht.
      const metaByName = new Map<string, ScheduleNameMeta>();
      const map: Record<string, number | null> = {};
      for (const r of data.scheduleRows) {
        const existing = metaByName.get(r.rawName);
        if (existing) {
          existing.count += 1;
        } else {
          metaByName.set(r.rawName, {
            rawName: r.rawName,
            confidence: r.matchConfidence,
            candidates: r.matchCandidates,
            count: 1,
          });
          map[r.rawName] = r.matchedEmployeeId;
        }
      }
      setNameMeta([...metaByName.values()].sort((a, b) => b.count - a.count));
      setNameMap(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  function updateDraft(idx: number, patch: Partial<ScheduleDraft>) {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }
  function setName(rawName: string, employeeId: number | null) {
    setNameMap((prev) => ({ ...prev, [rawName]: employeeId }));
  }
  function setIncludeForUnresolved(include: boolean) {
    setDrafts((prev) =>
      prev.map((d) => (nameMap[d.rawName] ? d : { ...d, include }))
    );
  }

  const empName = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of employees) m.set(e.id, e.name);
    return m;
  }, [employees]);

  function handleConfirm() {
    if (!parsed) return;
    const payload = drafts.map((d) => ({
      date: d.date,
      employeeId: nameMap[d.rawName] ?? null,
      employeeName: d.rawName,
      position: d.position.trim() || null,
      startTime: d.startTime.trim() || null,
      endTime: d.endTime.trim() || null,
      include: d.include,
    }));
    const fd = new FormData();
    fd.set("import_id", String(parsed.importId));
    fd.set("payload", JSON.stringify(payload));
    setError(null);
    startTransition(async () => {
      try {
        const r = await confirmAction(fd);
        setResult(`${r.written} historische Schicht(en) gespeichert.`);
        setParsed(null);
        setDrafts([]);
        setNameMeta([]);
        setNameMap({});
        if (fileRef.current) fileRef.current.value = "";
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
      }
    });
  }

  const includedCount = drafts.filter((d) => d.include).length;
  const unresolvedNames = nameMeta.filter((m) => !nameMap[m.rawName]).length;
  const unresolvedShifts = drafts.filter((d) => d.include && !nameMap[d.rawName]).length;

  return (
    <div className="flex flex-col gap-4">
      <div className={card}>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Lade einen bereits erstellten Dienstplan als PDF hoch. Pläne mit Textebene
          (Excel-/Software-Export) werden direkt aus den Zellen rekonstruiert. Die
          erkannten Schichten landen als <strong>Analysebasis</strong> (nicht im
          aktuellen Monatsplan) und verbessern KI-Vorschläge und Bedarfsanalyse.
        </p>
        {!aiFallbackEnabled && (
          <p className="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            Hinweis: rein gescannte PDFs ohne Textebene brauchen zusätzlich einen
            GEMINI_API_KEY (hier nicht gesetzt).
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
            PDF-Datei
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="text-sm text-[hsl(var(--foreground))] file:mr-3 file:rounded-md file:border-0 file:bg-[hsl(var(--secondary))] file:px-3 file:py-1.5 file:text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
            Jahr (falls im Plan nicht sichtbar)
            <input
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
              className={`${inputCls} w-24`}
              inputMode="numeric"
            />
          </label>
          <button
            type="button"
            className={primaryBtn}
            onClick={handleParse}
            disabled={busy}
          >
            {busy ? "Wird ausgelesen…" : "PDF auslesen"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-700/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}
      {result && (
        <div className="rounded-md border border-emerald-700/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {result}
        </div>
      )}

      {parsed && (
        <div className={card}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-medium">{parsed.fileName}</span>{" "}
              <span className="text-[hsl(var(--muted-foreground))]">
                {parsed.periodStart && parsed.periodEnd
                  ? `· ${parsed.periodStart} – ${parsed.periodEnd}`
                  : ""}
              </span>
            </div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              {includedCount} von {drafts.length} Schichten · {nameMeta.length} Personen
              {unresolvedNames > 0 && (
                <span className="ml-2 text-amber-400">
                  · {unresolvedNames} ohne Zuordnung
                </span>
              )}
            </div>
          </div>

          {parsed.notes.length > 0 && (
            <ul className="mb-3 list-disc space-y-0.5 pl-5 text-xs text-amber-400">
              {parsed.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}

          {nameMeta.length > 0 && (
            <div className="mb-3 rounded-md border border-[hsl(var(--border))] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Namen zuordnen ({nameMeta.length})
                </h4>
                {unresolvedShifts > 0 && (
                  <button
                    type="button"
                    className="text-xs text-[hsl(var(--muted-foreground))] underline"
                    onClick={() => setIncludeForUnresolved(false)}
                  >
                    Schichten ohne Zuordnung ausschließen
                  </button>
                )}
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {nameMeta.map((m) => {
                  const options = mergeCandidates(
                    m.candidates,
                    employees,
                    nameMap[m.rawName] ?? null
                  );
                  return (
                    <div
                      key={m.rawName}
                      className="flex items-center gap-2 rounded border border-[hsl(var(--border))] px-2 py-1.5 text-sm"
                    >
                      <span className="flex-1 truncate" title={m.rawName}>
                        {m.rawName}
                      </span>
                      <span className="shrink-0 text-[10px] text-[hsl(var(--muted-foreground))]">
                        {m.count}×
                      </span>
                      {confidenceBadge(m.confidence)}
                      <select
                        value={nameMap[m.rawName] ?? ""}
                        onChange={(e) =>
                          setName(m.rawName, e.target.value ? Number(e.target.value) : null)
                        }
                        className={`${inputCls} min-w-[8rem] max-w-[11rem]`}
                      >
                        <option value="">— nicht zuordnen</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="max-h-[420px] overflow-auto rounded-md border border-[hsl(var(--border))]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[hsl(var(--card))] text-left text-xs text-[hsl(var(--muted-foreground))]">
                <tr>
                  <th className="p-2"> </th>
                  <th className="p-2">Datum</th>
                  <th className="p-2">Mitarbeiter</th>
                  <th className="p-2">Position</th>
                  <th className="p-2">Von</th>
                  <th className="p-2">Bis</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d, idx) => {
                  const mappedId = nameMap[d.rawName] ?? null;
                  const shown = mappedId ? empName.get(mappedId) ?? d.rawName : d.rawName;
                  return (
                    <tr
                      key={idx}
                      className={`border-t border-[hsl(var(--border))] ${
                        d.include ? "" : "opacity-45"
                      }`}
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={d.include}
                          onChange={(e) => updateDraft(idx, { include: e.target.checked })}
                        />
                      </td>
                      <td className="whitespace-nowrap p-2 font-mono text-xs">{d.date}</td>
                      <td className="p-2">
                        <span className={mappedId ? "" : "text-amber-400"}>{shown}</span>
                        {!mappedId && (
                          <span
                            className="ml-1 text-[hsl(var(--muted-foreground))]"
                            title="Kein Mitarbeiter zugeordnet — wird ohne Verknüpfung gespeichert"
                          >
                            (roh)
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        <input
                          value={d.position}
                          onChange={(e) => updateDraft(idx, { position: e.target.value })}
                          className={`${inputCls} w-32`}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={d.startTime}
                          placeholder="HH:MM"
                          onChange={(e) => updateDraft(idx, { startTime: e.target.value })}
                          className={`${inputCls} w-20`}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={d.endTime}
                          placeholder="HH:MM"
                          onChange={(e) => updateDraft(idx, { endTime: e.target.value })}
                          className={`${inputCls} w-20`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              className={primaryBtn}
              onClick={handleConfirm}
              disabled={pending || includedCount === 0}
            >
              {pending ? "Speichern…" : `${includedCount} Schicht(en) übernehmen`}
            </button>
            <button
              type="button"
              className={ghostBtn}
              onClick={() => {
                setParsed(null);
                setDrafts([]);
                setNameMeta([]);
                setNameMap({});
              }}
              disabled={pending}
            >
              Verwerfen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Excel / Verfügbarkeits-Import ─────────────────────────────────────────

type AvailabilityParseResponse = {
  importId: number;
  fileName: string;
  periodStart: string | null;
  periodEnd: string | null;
  notes: string[];
  employees: EmployeeOption[];
  availabilityRows: ParsedAvailabilityRow[];
};

type AvailEntryDraft = {
  date: string;
  rawValue: string;
  status: string;
  fixedStart: string;
  fixedEnd: string;
  include: boolean;
  mapped: boolean;
};

type AvailRowDraft = {
  rawName: string;
  employeeId: number | null;
  confidence: MatchConfidence;
  candidates: EmployeeOption[];
  entries: AvailEntryDraft[];
};

function AvailabilityPanel({
  employees,
  confirmAction,
  onDone,
}: {
  employees: EmployeeOption[];
  confirmAction: Props["confirmAvailabilityImportAction"];
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [parsed, setParsed] = useState<AvailabilityParseResponse | null>(null);
  const [rows, setRows] = useState<AvailRowDraft[]>([]);
  const [pending, startTransition] = useTransition();

  async function handleParse() {
    const file = fileRef.current?.files?.[0];
    setError(null);
    setResult(null);
    if (!file) {
      setError("Bitte zuerst eine Excel-Datei auswählen.");
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`Datei zu groß (max. ${MAX_UPLOAD_MB} MB).`);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", "availability_xlsx");
      if (/^\d{4}-\d{2}$/.test(month)) fd.set("month", month);
      const res = await fetch("/api/dienstplaner/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json?.error || `Fehler ${res.status}`);
        return;
      }
      const data = json as AvailabilityParseResponse;
      setParsed(data);
      setRows(
        data.availabilityRows.map((r) => ({
          rawName: r.rawName,
          employeeId: r.matchedEmployeeId,
          confidence: r.matchConfidence,
          candidates: r.matchCandidates,
          entries: r.entries.map((e) => ({
            date: e.date,
            rawValue: e.rawValue,
            status: e.status ?? "",
            fixedStart: e.fixedStart ?? "",
            fixedEnd: e.fixedEnd ?? "",
            include: Boolean(e.mapped && e.status),
            mapped: e.mapped,
          })),
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  function updateRow(idx: number, patch: Partial<AvailRowDraft>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function updateEntry(rowIdx: number, entryIdx: number, patch: Partial<AvailEntryDraft>) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === rowIdx
          ? {
              ...r,
              entries: r.entries.map((e, j) => (j === entryIdx ? { ...e, ...patch } : e)),
            }
          : r
      )
    );
  }
  function setRowIncludeAll(rowIdx: number, include: boolean) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === rowIdx ? { ...r, entries: r.entries.map((e) => ({ ...e, include })) } : r
      )
    );
  }

  function handleConfirm() {
    if (!parsed) return;
    const payload = rows.map((r) => ({
      employeeId: r.employeeId,
      entries: r.entries.map((e) => ({
        date: e.date,
        status: e.status || null,
        fixedStart: e.fixedStart.trim() || null,
        fixedEnd: e.fixedEnd.trim() || null,
        include: e.include,
      })),
    }));
    const fd = new FormData();
    fd.set("import_id", String(parsed.importId));
    fd.set("payload", JSON.stringify(payload));
    fd.set("overwrite", overwrite ? "true" : "false");
    setError(null);
    startTransition(async () => {
      try {
        const r = await confirmAction(fd);
        setResult(
          `${r.written} Verfügbarkeits-Eintrag/-Einträge übernommen` +
            (r.skipped > 0 ? `, ${r.skipped} übersprungen (bereits vorhanden).` : ".")
        );
        setParsed(null);
        setRows([]);
        if (fileRef.current) fileRef.current.value = "";
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
      }
    });
  }

  const includedCount = rows.reduce(
    (n, r) => n + r.entries.filter((e) => e.include).length,
    0
  );
  const unresolvedRows = rows.filter(
    (r) => !r.employeeId && r.entries.some((e) => e.include)
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div className={card}>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Erwartetes Layout: erste Spalte = Mitarbeitername, eine Kopfzeile mit Datums-
          oder Tagesangaben, darunter je Tag eine Zelle. Erkannt werden u.a.{" "}
          <code>U/Urlaub</code>, <code>K/krank</code>, <code>F/frei</code>,{" "}
          <code>fr</code>, <code>sp</code> und Zeitspannen wie <code>9-14</code> (→ feste
          Zeiten). <code>X</code> und <code>–</code> werden als „Frei" gewertet.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
            Excel-Datei
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="text-sm text-[hsl(var(--foreground))] file:mr-3 file:rounded-md file:border-0 file:bg-[hsl(var(--secondary))] file:px-3 file:py-1.5 file:text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
            Monat (bei reinen Tageszahlen)
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className={inputCls}
            />
          </label>
          <button type="button" className={primaryBtn} onClick={handleParse} disabled={busy}>
            {busy ? "Wird ausgelesen…" : "Excel auslesen"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-700/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}
      {result && (
        <div className="rounded-md border border-emerald-700/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {result}
        </div>
      )}

      {parsed && (
        <div className={card}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-medium">{parsed.fileName}</span>{" "}
              <span className="text-[hsl(var(--muted-foreground))]">
                {parsed.periodStart && parsed.periodEnd
                  ? `· ${parsed.periodStart} – ${parsed.periodEnd}`
                  : ""}
              </span>
            </div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              {includedCount} Eintrag/Einträge markiert
              {unresolvedRows > 0 && (
                <span className="ml-2 text-amber-400">
                  · {unresolvedRows} Zeile(n) ohne Mitarbeiter
                </span>
              )}
            </div>
          </div>

          {parsed.notes.length > 0 && (
            <ul className="mb-3 list-disc space-y-0.5 pl-5 text-xs text-amber-400">
              {parsed.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}

          <label className="mb-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            Bereits vorhandene Verfügbarkeits-Einträge überschreiben
          </label>

          <div className="flex max-h-[520px] flex-col gap-3 overflow-auto pr-1">
            {rows.map((row, rowIdx) => {
              const options = mergeCandidates(row.candidates, employees, row.employeeId);
              return (
                <div
                  key={rowIdx}
                  className="rounded-md border border-[hsl(var(--border))] p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-medium">{row.rawName}</span>
                    {confidenceBadge(row.confidence)}
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">→</span>
                    <select
                      value={row.employeeId ?? ""}
                      onChange={(e) =>
                        updateRow(rowIdx, {
                          employeeId: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      className={`${inputCls} min-w-[10rem]`}
                    >
                      <option value="">— nicht zuordnen</option>
                      {options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="text-xs text-[hsl(var(--muted-foreground))] underline"
                      onClick={() => setRowIncludeAll(rowIdx, true)}
                    >
                      alle
                    </button>
                    <button
                      type="button"
                      className="text-xs text-[hsl(var(--muted-foreground))] underline"
                      onClick={() => setRowIncludeAll(rowIdx, false)}
                    >
                      keine
                    </button>
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-1.5">
                    {row.entries.map((entry, entryIdx) => (
                      <div
                        key={entryIdx}
                        className={`flex items-center gap-1.5 rounded border border-[hsl(var(--border))] px-1.5 py-1 text-xs ${
                          entry.include ? "" : "opacity-45"
                        } ${!entry.mapped ? "border-amber-600/50" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={entry.include}
                          onChange={(e) =>
                            updateEntry(rowIdx, entryIdx, { include: e.target.checked })
                          }
                        />
                        <span className="font-mono">{entry.date.slice(5)}</span>
                        <span
                          className="max-w-[3.5rem] shrink-0 truncate text-[hsl(var(--muted-foreground))]"
                          title={entry.rawValue}
                        >
                          {entry.rawValue}
                        </span>
                        <select
                          value={entry.status}
                          onChange={(e) =>
                            updateEntry(rowIdx, entryIdx, { status: e.target.value })
                          }
                          className={`${inputCls} flex-1 !px-1 !py-0.5`}
                        >
                          {STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.value || "—"}
                            </option>
                          ))}
                        </select>
                        {entry.status === "fix" && (
                          <>
                            <input
                              value={entry.fixedStart}
                              placeholder="09:00"
                              onChange={(e) =>
                                updateEntry(rowIdx, entryIdx, { fixedStart: e.target.value })
                              }
                              className={`${inputCls} w-14 !px-1 !py-0.5`}
                            />
                            <input
                              value={entry.fixedEnd}
                              placeholder="14:00"
                              onChange={(e) =>
                                updateEntry(rowIdx, entryIdx, { fixedEnd: e.target.value })
                              }
                              className={`${inputCls} w-14 !px-1 !py-0.5`}
                            />
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              className={primaryBtn}
              onClick={handleConfirm}
              disabled={pending || includedCount === 0}
            >
              {pending ? "Speichern…" : `${includedCount} Eintrag/Einträge übernehmen`}
            </button>
            <button
              type="button"
              className={ghostBtn}
              onClick={() => {
                setParsed(null);
                setRows([]);
              }}
              disabled={pending}
            >
              Verwerfen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Analyse-Tab ───────────────────────────────────────────────────────────

function AnalysisPanel({
  insights,
  applyAction,
}: {
  insights: HistoryInsights;
  applyAction: Props["applyHistoryWeekdayHeadcountAction"];
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (insights.totalShifts === 0) {
    return (
      <div className={card}>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Noch keine bestätigten historischen Schichten. Lade oben einen PDF-Dienstplan
          hoch und übernimm ihn, dann erscheinen hier die Muster.
        </p>
      </div>
    );
  }

  function handleApply() {
    setMsg(null);
    setError(null);
    startTransition(async () => {
      try {
        const r = await applyAction();
        setMsg(
          "Wochentags-Grundbedarf gesetzt: " +
            r.updated
              .map((u) => `${WEEKDAY_LABELS[u.weekday]} ${u.requiredShifts}`)
              .join(", ")
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Übernehmen fehlgeschlagen");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Datenbasis</h3>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {insights.totalShifts} Schichten · {insights.distinctDays} Tage
            {insights.dateRange
              ? ` · ${insights.dateRange.start} – ${insights.dateRange.end}`
              : ""}
          </span>
        </div>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
          Diese Muster fließen automatisch in den KI-Autofüller der offenen Slots ein.
        </p>
      </div>

      <div className={card}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Ø Personen pro Wochentag</h3>
          <button
            type="button"
            className={ghostBtn}
            onClick={handleApply}
            disabled={pending}
          >
            {pending ? "…" : "Als Wochentags-Grundbedarf übernehmen"}
          </button>
        </div>
        {msg && <p className="mb-2 text-xs text-emerald-400">{msg}</p>}
        {error && <p className="mb-2 text-xs text-rose-400">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {insights.weekdayHeadcount.map((w) => (
            <div
              key={w.weekday}
              className="rounded-md border border-[hsl(var(--border))] px-3 py-2 text-center"
            >
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                {w.weekdayLabel}
              </div>
              <div className="text-lg font-semibold">{w.avgHeadcount}</div>
              <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                {w.minHeadcount}–{w.maxHeadcount} · {w.daysObserved} T
              </div>
            </div>
          ))}
        </div>
      </div>

      {insights.weekdayPosition.length > 0 && (
        <div className={card}>
          <h3 className="mb-2 text-sm font-semibold">Position je Wochentag</h3>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[hsl(var(--muted-foreground))]">
                <tr>
                  <th className="p-1.5">Tag</th>
                  <th className="p-1.5">Position</th>
                  <th className="p-1.5">Ø Anzahl</th>
                  <th className="p-1.5">übliche Zeit</th>
                  <th className="p-1.5">Tage</th>
                </tr>
              </thead>
              <tbody>
                {insights.weekdayPosition.map((w, i) => (
                  <tr key={i} className="border-t border-[hsl(var(--border))]">
                    <td className="p-1.5">{w.weekdayLabel}</td>
                    <td className="p-1.5">{w.position}</td>
                    <td className="p-1.5">{w.avgHeadcount}</td>
                    <td className="p-1.5 font-mono text-xs">
                      {w.typicalStart && w.typicalEnd
                        ? `${w.typicalStart}–${w.typicalEnd}`
                        : "—"}
                    </td>
                    <td className="p-1.5">{w.daysObserved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {insights.commonTimes.length > 0 && (
          <div className={card}>
            <h3 className="mb-2 text-sm font-semibold">Häufigste Schichtzeiten</h3>
            <ul className="space-y-1 text-sm">
              {insights.commonTimes.map((t, i) => (
                <li key={i} className="flex justify-between">
                  <span className="font-mono text-xs">
                    {t.start}–{t.end}
                  </span>
                  <span className="text-[hsl(var(--muted-foreground))]">{t.count}×</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {insights.employeeAffinity.length > 0 && (
          <div className={card}>
            <h3 className="mb-2 text-sm font-semibold">Positions-Affinität</h3>
            <ul className="max-h-64 space-y-1 overflow-auto text-sm">
              {insights.employeeAffinity.map((a, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="truncate">
                    {a.employeeName} · {a.position}
                  </span>
                  <span className="text-[hsl(var(--muted-foreground))]">{a.count}×</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────

function mergeCandidates(
  candidates: EmployeeOption[],
  all: EmployeeOption[],
  selectedId: number | null
): EmployeeOption[] {
  const seen = new Set<number>();
  const out: EmployeeOption[] = [];
  for (const c of candidates) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      out.push(c);
    }
  }
  if (selectedId && !seen.has(selectedId)) {
    const hit = all.find((e) => e.id === selectedId);
    if (hit) {
      seen.add(hit.id);
      out.push(hit);
    }
  }
  for (const e of all) {
    if (!seen.has(e.id)) out.push(e);
  }
  return out;
}

function statusLabel(status: ImportRecord["status"]) {
  switch (status) {
    case "confirmed":
      return "übernommen";
    case "discarded":
      return "verworfen";
    case "error":
      return "Fehler";
    default:
      return "geprüft";
  }
}

export default function ImportClient({
  employees,
  recentImports,
  insights,
  aiFallbackEnabled,
  confirmScheduleImportAction,
  confirmAvailabilityImportAction,
  discardImportAction,
  applyHistoryWeekdayHeadcountAction,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pdf");
  const [, startTransition] = useTransition();

  const tabs: { key: Tab; label: string }[] = [
    { key: "pdf", label: "Dienstpläne (PDF)" },
    { key: "xlsx", label: "Verfügbarkeiten (Excel)" },
    { key: "analysis", label: "Analyse" },
  ];

  const historyImports = useMemo(
    () => recentImports.filter((r) => r.status !== "discarded"),
    [recentImports]
  );

  function refresh() {
    startTransition(() => router.refresh());
  }

  function handleDiscard(id: number) {
    const fd = new FormData();
    fd.set("import_id", String(id));
    startTransition(async () => {
      await discardImportAction(fd);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-1 rounded-lg border border-[hsl(var(--border))] p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === t.key
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-medium"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pdf" && (
        <SchedulePanel
          employees={employees}
          aiFallbackEnabled={aiFallbackEnabled}
          confirmAction={confirmScheduleImportAction}
          onDone={refresh}
        />
      )}
      {tab === "xlsx" && (
        <AvailabilityPanel
          employees={employees}
          confirmAction={confirmAvailabilityImportAction}
          onDone={refresh}
        />
      )}
      {tab === "analysis" && (
        <AnalysisPanel
          insights={insights}
          applyAction={applyHistoryWeekdayHeadcountAction}
        />
      )}

      {historyImports.length > 0 && (
        <div className={card}>
          <h3 className="mb-2 text-sm font-semibold">Letzte Importe</h3>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[hsl(var(--muted-foreground))]">
                <tr>
                  <th className="p-1.5">Datei</th>
                  <th className="p-1.5">Art</th>
                  <th className="p-1.5">Zeitraum</th>
                  <th className="p-1.5">Zeilen</th>
                  <th className="p-1.5">Status</th>
                  <th className="p-1.5"> </th>
                </tr>
              </thead>
              <tbody>
                {historyImports.map((imp) => (
                  <tr key={imp.id} className="border-t border-[hsl(var(--border))]">
                    <td className="p-1.5">{imp.file_name}</td>
                    <td className="p-1.5">
                      {imp.kind === "schedule_pdf" ? "PDF-Plan" : "Excel-Verfügb."}
                    </td>
                    <td className="p-1.5 font-mono text-xs">
                      {imp.period_start && imp.period_end
                        ? `${imp.period_start} – ${imp.period_end}`
                        : "—"}
                    </td>
                    <td className="p-1.5">
                      {imp.confirmed_count ?? imp.row_count}
                    </td>
                    <td className="p-1.5">
                      {statusLabel(imp.status)}
                      {imp.status === "error" && imp.error_message && (
                        <span
                          className="ml-1 cursor-help text-rose-400"
                          title={imp.error_message}
                        >
                          ⚠
                        </span>
                      )}
                    </td>
                    <td className="p-1.5 text-right">
                      {imp.status !== "confirmed" && (
                        <button
                          type="button"
                          className="text-xs text-[hsl(var(--muted-foreground))] underline"
                          onClick={() => handleDiscard(imp.id)}
                        >
                          entfernen
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
