// Lädt Schichtregeln und Zeiträume; tolerant gegenüber noch nicht ausgeführten Migrationen.
import type { createAdminClient } from "@/lib/supabase/admin";
import type { RulePeriod, ShiftRule } from "@/app/tools/dienstplaner/requirements";

const RULE_COLUMNS = "id, position, require_leader, start_time, end_time, weekdays, required_count, note";

type RuleRow = Omit<ShiftRule, "weekdays"> & { weekdays: (number | string)[] | null };

export type LoadedRules = {
  rules: ShiftRule[];
  periods: RulePeriod[];
  /** false: Tabelle dienstplan_shift_rules fehlt (Migration 1 offen) */
  available: boolean;
  /** false: Zeiträume noch nicht migriert (Migration 2 offen) */
  periodsAvailable: boolean;
  error: string | null;
};

export async function loadShiftRulesAndPeriods(sb: ReturnType<typeof createAdminClient>): Promise<LoadedRules> {
  let periodsAvailable = true;
  let data: unknown[] | null;
  let errorMessage: string | null = null;

  const withPeriods = await sb
    .from("dienstplan_shift_rules")
    .select(`${RULE_COLUMNS}, period_id`)
    .order("start_time")
    .order("id");
  if (!withPeriods.error) {
    data = withPeriods.data;
  } else {
    periodsAvailable = false;
    const plain = await sb.from("dienstplan_shift_rules").select(RULE_COLUMNS).order("start_time").order("id");
    data = plain.data;
    errorMessage = plain.error?.message ?? null;
  }
  if (errorMessage) {
    return { rules: [], periods: [], available: false, periodsAvailable: false, error: errorMessage };
  }

  const rules: ShiftRule[] = ((data ?? []) as RuleRow[]).map((row) => ({
    ...row,
    period_id: row.period_id ?? null,
    start_time: row.start_time.slice(0, 5),
    end_time: row.end_time.slice(0, 5),
    weekdays: (row.weekdays ?? []).map(Number),
  }));

  let periods: RulePeriod[] = [];
  if (periodsAvailable) {
    const periodResult = await sb
      .from("dienstplan_rule_periods")
      .select("id, name, start_date, end_date")
      .order("start_date")
      .order("id");
    if (periodResult.error) periodsAvailable = false;
    else periods = (periodResult.data ?? []) as RulePeriod[];
  }

  return { rules, periods, available: true, periodsAvailable, error: null };
}
