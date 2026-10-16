"use client";

import { useState } from "react";
import { copyRulesToPeriodAction, deleteRulePeriodAction, saveRulePeriodAction } from "./actions";
import FormFeedback from "./components/FormFeedback";
import ShiftRulesEditor from "./ShiftRulesEditor";
import type { RulePeriod, ShiftRule } from "./requirements";

const inputBase =
  "rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground)/0.7)] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.2)] disabled:opacity-60";

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

/** Validierung im Browser: Fehlermeldungen von Server Actions werden in Produktion maskiert. */
async function savePeriod(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const start = String(formData.get("start_date") ?? "");
  const end = String(formData.get("end_date") ?? "");
  if (!name) throw new Error("Bitte einen Namen angeben");
  if (!start || !end) throw new Error("Bitte Beginn und Ende angeben");
  if (end < start) throw new Error("Das Ende liegt vor dem Beginn");
  await saveRulePeriodAction(formData);
}

function PeriodForm({ period, isReadOnly }: { period?: RulePeriod; isReadOnly: boolean }) {
  return (
    <FormFeedback
      action={savePeriod}
      successText={period ? "Zeitraum gespeichert" : "Zeitraum angelegt"}
      className="flex flex-wrap items-end gap-3"
    >
      {period && <input type="hidden" name="id" value={period.id} />}
      <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))] flex-1 min-w-[10rem]">
        Name
        <input
          name="name"
          defaultValue={period?.name ?? ""}
          placeholder="z. B. Sommerferien"
          className={`${inputBase} px-3 py-1.5`}
          required
          disabled={isReadOnly}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
        Von
        <input
          name="start_date"
          type="date"
          defaultValue={period?.start_date ?? ""}
          className={`${inputBase} px-2 py-1.5`}
          required
          disabled={isReadOnly}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
        Bis
        <input
          name="end_date"
          type="date"
          defaultValue={period?.end_date ?? ""}
          className={`${inputBase} px-2 py-1.5`}
          required
          disabled={isReadOnly}
        />
      </label>
      <button
        type="submit"
        className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-1.5 px-4 rounded-lg disabled:opacity-50"
        disabled={isReadOnly}
      >
        {period ? "Speichern" : "+ Zeitraum"}
      </button>
    </FormFeedback>
  );
}

function PeriodCard({
  period,
  rules,
  defaultOpen,
  isReadOnly,
}: {
  period: RulePeriod;
  rules: ShiftRule[];
  defaultOpen: boolean;
  isReadOnly: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ownRules = rules.filter((rule) => rule.period_id === period.id);
  const hasStandardRules = rules.some((rule) => !rule.period_id);

  return (
    <details open={defaultOpen} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.4)]">
      <summary className="cursor-pointer select-none px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{period.name}</span>
        <span className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">
          {formatDate(period.start_date)} – {formatDate(period.end_date)}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            ownRules.length > 0 ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"
          }`}
        >
          {ownRules.length > 0
            ? `${ownRules.length} eigene Regel${ownRules.length === 1 ? "" : "n"}`
            : "noch keine Regeln – Standard gilt"}
        </span>
      </summary>

      <div className="flex flex-col gap-4 border-t border-[hsl(var(--border))] px-4 py-4">
        <PeriodForm period={period} isReadOnly={isReadOnly} />

        {ownRules.length === 0 && hasStandardRules && (
          <FormFeedback
            action={copyRulesToPeriodAction}
            successText="Standardregeln kopiert"
            className="flex items-center gap-3"
          >
            <input type="hidden" name="period_id" value={period.id} />
            <button
              type="submit"
              disabled={isReadOnly}
              className="text-xs px-3 py-1.5 rounded-md bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] disabled:opacity-50"
            >
              Standardregeln als Startpunkt übernehmen
            </button>
            <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
              Danach nur noch ändern, was in diesem Zeitraum anders ist.
            </span>
          </FormFeedback>
        )}

        <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
          Sobald dieser Zeitraum Regeln hat, ersetzen sie an seinen Tagen alle Standardregeln.
        </p>
        <ShiftRulesEditor rules={rules} periodId={period.id} isReadOnly={isReadOnly} bare />

        <div className="border-t border-[hsl(var(--border))] pt-3 flex justify-end">
          {confirmDelete ? (
            <FormFeedback action={deleteRulePeriodAction} successText="Gelöscht" className="flex items-center gap-2">
              <input type="hidden" name="id" value={period.id} />
              <span className="text-xs text-amber-500">Zeitraum samt Regeln löschen?</span>
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
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={isReadOnly}
              className="text-xs font-medium text-amber-500 hover:text-amber-400 disabled:opacity-50"
            >
              Zeitraum löschen
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

export default function PeriodsEditor({
  periods,
  rules,
  isReadOnly,
  month,
  available = true,
  bare = false,
}: {
  periods: RulePeriod[];
  rules: ShiftRule[];
  isReadOnly: boolean;
  /** Monat „YYYY-MM“: Zeiträume, die ihn betreffen, werden aufgeklappt */
  month?: string;
  /** false: Migration noch nicht ausgeführt */
  available?: boolean;
  bare?: boolean;
}) {
  const monthStart = month ? `${month}-01` : null;
  const monthEnd = month ? `${month}-31` : null;
  const touchesMonth = (period: RulePeriod) =>
    monthStart !== null && monthEnd !== null && period.start_date <= monthEnd && period.end_date >= monthStart;

  const body = !available ? (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
      Zeiträume sind noch nicht eingerichtet. Bitte <code>dienstplaner-rule-periods-migration.sql</code> in Supabase
      ausführen.
    </div>
  ) : (
    <>
      <div className="flex flex-col gap-2">
        {periods.length === 0 && (
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            Noch kein Zeitraum angelegt. Lege z. B. „Sommerferien“ an, um dort andere Regeln zu verwenden.
          </div>
        )}
        {periods.map((period) => (
          <PeriodCard
            key={period.id}
            period={period}
            rules={rules}
            defaultOpen={touchesMonth(period)}
            isReadOnly={isReadOnly}
          />
        ))}
      </div>
      <div className="border-t border-[hsl(var(--border))] pt-4">
        <h4 className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">Neuer Zeitraum</h4>
        <PeriodForm isReadOnly={isReadOnly} />
      </div>
    </>
  );

  if (bare) return <div className="flex flex-col gap-4">{body}</div>;

  return (
    <div className="card p-5 flex flex-col gap-5">
      <div>
        <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">Abweichende Zeiträume</h3>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Für Ferien, Festivals oder andere Phasen: In einem Zeitraum gelten eigene Regeln statt der Standardregeln.
          Überschneiden sich Zeiträume, gewinnt der spätere Beginn. Einzelne Tage lassen sich zusätzlich im Monatsplan
          anpassen und haben Vorrang.
        </p>
      </div>
      {body}
    </div>
  );
}
