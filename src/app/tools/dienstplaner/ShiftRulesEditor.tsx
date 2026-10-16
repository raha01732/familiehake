"use client";

import { useState } from "react";
import { deleteShiftRuleAction, saveShiftRuleAction } from "./actions";
import FormFeedback from "./components/FormFeedback";
import {
  POSITION_KINDS,
  WEEKDAY_ORDER,
  WEEKDAY_SHORT,
  describePosition,
  kindOfPosition,
  type PositionKindValue,
  type ShiftRule,
} from "./requirements";

const inputBase =
  "rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground)/0.7)] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.2)] disabled:opacity-60";

const PRESETS: { label: string; days: number[] }[] = [
  { label: "Mo–Fr", days: [1, 2, 3, 4, 5] },
  { label: "Sa–So", days: [6, 0] },
  { label: "Alle Tage", days: [0, 1, 2, 3, 4, 5, 6] },
];

function formatTime(value: string) {
  return value.slice(0, 5);
}

/** Validierung im Browser: Fehlermeldungen von Server Actions werden in Produktion maskiert. */
async function saveWithValidation(formData: FormData) {
  if (formData.getAll("weekdays").length === 0) throw new Error("Bitte mindestens einen Wochentag wählen");
  if (!formData.get("start_time") || !formData.get("end_time")) throw new Error("Bitte Beginn und Ende angeben");
  if (formData.get("start_time") === formData.get("end_time")) throw new Error("Beginn und Ende sind gleich");
  await saveShiftRuleAction(formData);
}

function RuleForm({
  rule,
  periodId,
  isReadOnly,
  onDone,
}: {
  rule?: ShiftRule;
  periodId?: number | null;
  isReadOnly: boolean;
  onDone?: () => void;
}) {
  const initialKind = rule ? kindOfPosition(rule.position, rule.require_leader) : { kind: "serviceleitung" as PositionKindValue, custom: "" };
  const [kind, setKind] = useState<PositionKindValue>(initialKind.kind);
  const [days, setDays] = useState<number[]>(rule?.weekdays ?? [1, 2, 3, 4, 5]);

  function toggleDay(day: number) {
    setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]));
  }

  async function submit(formData: FormData) {
    await saveWithValidation(formData);
    onDone?.();
  }

  return (
    <FormFeedback
      action={submit}
      successText={rule ? "Regel gespeichert" : "Regel angelegt"}
      className="flex flex-col gap-3"
    >
      {rule && <input type="hidden" name="id" value={rule.id} />}
      {!rule && periodId ? <input type="hidden" name="period_id" value={periodId} /> : null}

      <div className="grid grid-cols-1 sm:grid-cols-[minmax(14rem,1.4fr)_auto_auto_auto] gap-3 items-end">
        <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
          Position
          <select
            name="position_kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as PositionKindValue)}
            className={`${inputBase} px-2 py-1.5`}
            disabled={isReadOnly}
          >
            {POSITION_KINDS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
            <option value="custom">Andere Position …</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
          Von
          <input
            name="start_time"
            type="time"
            defaultValue={rule ? formatTime(rule.start_time) : ""}
            className={`${inputBase} px-2 py-1.5 w-28`}
            required
            disabled={isReadOnly}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
          Bis
          <input
            name="end_time"
            type="time"
            defaultValue={rule ? formatTime(rule.end_time) : ""}
            className={`${inputBase} px-2 py-1.5 w-28`}
            required
            disabled={isReadOnly}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
          Personen
          <input
            name="required_count"
            type="number"
            min={1}
            max={10}
            defaultValue={rule?.required_count ?? 1}
            className={`${inputBase} px-2 py-1.5 w-20`}
            disabled={isReadOnly}
          />
        </label>
      </div>

      {kind === "custom" && (
        <input
          name="position_custom"
          defaultValue={initialKind.custom}
          placeholder="Bezeichnung der Position"
          className={`${inputBase} px-3 py-1.5 max-w-sm`}
          required
          disabled={isReadOnly}
        />
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-[hsl(var(--muted-foreground))]">An diesen Tagen</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {WEEKDAY_ORDER.map((day) => {
            const active = days.includes(day);
            return (
              <label key={day} className="cursor-pointer select-none">
                <input
                  type="checkbox"
                  name="weekdays"
                  value={day}
                  checked={active}
                  onChange={() => toggleDay(day)}
                  className="sr-only peer"
                  disabled={isReadOnly}
                />
                <span
                  className={`inline-flex h-8 w-10 items-center justify-center rounded-lg border text-xs font-medium transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[hsl(var(--ring))] ${
                    active
                      ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-400"
                      : "border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"
                  }`}
                >
                  {WEEKDAY_SHORT[day]}
                </span>
              </label>
            );
          })}
          <span className="mx-1 h-5 w-px bg-[hsl(var(--border))]" aria-hidden />
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setDays(preset.days)}
              disabled={isReadOnly}
              className="rounded-md px-2 py-1 text-[11px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))] disabled:opacity-50"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <input
          name="note"
          defaultValue={rule?.note ?? ""}
          placeholder="Bemerkung (optional)"
          className={`${inputBase} px-3 py-1.5 flex-1 min-w-[12rem]`}
          disabled={isReadOnly}
        />
        <button
          type="submit"
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-1.5 px-4 rounded-lg disabled:opacity-50"
          disabled={isReadOnly}
        >
          {rule ? "Speichern" : "+ Regel hinzufügen"}
        </button>
        {rule && onDone && (
          <button
            type="button"
            onClick={onDone}
            className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] px-2 py-2"
          >
            Abbrechen
          </button>
        )}
      </div>
    </FormFeedback>
  );
}

function RuleCard({ rule, isReadOnly }: { rule: ShiftRule; isReadOnly: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (editing) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-[hsl(var(--secondary)/0.4)] px-4 py-3">
        <RuleForm rule={rule} isReadOnly={isReadOnly} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.4)] px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-[11rem]">
        <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
          {describePosition(rule.position, rule.require_leader)}
          {rule.required_count > 1 && (
            <span className="rounded bg-[hsl(var(--secondary))] px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--muted-foreground))]">
              ×{rule.required_count}
            </span>
          )}
        </div>
        <div className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">
          {formatTime(rule.start_time)}–{formatTime(rule.end_time)} Uhr
        </div>
      </div>

      <div className="flex flex-wrap gap-1" aria-label="Wochentage">
        {WEEKDAY_ORDER.map((day) => (
          <span
            key={day}
            className={`inline-flex h-6 w-8 items-center justify-center rounded-md text-[11px] font-medium ${
              rule.weekdays.includes(day)
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground)/0.5)]"
            }`}
          >
            {WEEKDAY_SHORT[day]}
          </span>
        ))}
      </div>

      {rule.note && <span className="text-xs text-[hsl(var(--muted-foreground))]">{rule.note}</span>}

      <div className="ml-auto flex items-center gap-1">
        {confirmDelete ? (
          <FormFeedback action={deleteShiftRuleAction} successText="Gelöscht" className="flex items-center gap-2">
            <input type="hidden" name="id" value={rule.id} />
            <span className="text-xs text-amber-500">Regel löschen?</span>
            <button type="submit" className="text-xs font-medium text-red-500 hover:text-red-400" disabled={isReadOnly}>
              Ja
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              Nein
            </button>
          </FormFeedback>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={isReadOnly}
              className="rounded-md px-2 py-1 text-xs font-medium text-emerald-500 hover:bg-[hsl(var(--secondary))] disabled:opacity-50"
            >
              Bearbeiten
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={isReadOnly}
              className="rounded-md px-2 py-1 text-xs font-medium text-amber-500 hover:bg-[hsl(var(--secondary))] disabled:opacity-50"
            >
              Löschen
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function ShiftRulesEditor({
  rules,
  isReadOnly,
  periodId = null,
  bare = false,
  heading = "Schichtanforderungen",
  description,
}: {
  rules: ShiftRule[];
  isReadOnly: boolean;
  /** Regeln gehören zu diesem Zeitraum (sonst: Standardregeln) */
  periodId?: number | null;
  /** ohne Karten-Rahmen und Überschrift, z. B. im Dialog */
  bare?: boolean;
  heading?: string;
  description?: string;
}) {
  const shown = rules.filter((rule) => (rule.period_id ?? null) === periodId);

  const body = (
    <>
      <div className="flex flex-col gap-2">
        {shown.length === 0 && (
          <div className="text-xs text-amber-500">
            {periodId ? "Noch keine Regel in diesem Zeitraum – bis dahin gelten die Standardregeln." : "Noch keine Regel angelegt. Lege unten die erste an."}
          </div>
        )}
        {shown.map((rule) => (
          <RuleCard key={rule.id} rule={rule} isReadOnly={isReadOnly} />
        ))}
      </div>

      <div className="border-t border-[hsl(var(--border))] pt-4">
        <h4 className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">Neue Regel</h4>
        <RuleForm periodId={periodId} isReadOnly={isReadOnly} />
      </div>
    </>
  );

  if (bare) return <div className="flex flex-col gap-4">{body}</div>;

  return (
    <div className="card p-5 flex flex-col gap-5">
      <div>
        <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">{heading}</h3>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {description ??
            "Eine Regel legt fest, wer wann gebraucht wird: Position, Uhrzeit und die Wochentage, an denen sie gilt. Bei „Projektion“ zählt die Projektionsleitung gleichwertig mit; mit „nur Projektionsleitung“ muss es die Leitung sein. Die Regeln wirken bei „1. Vorplanung“. Abweichungen für einzelne Tage stellst du im Monatsplan per Klick auf den Tag ein."}
        </p>
      </div>
      {body}
    </div>
  );
}
