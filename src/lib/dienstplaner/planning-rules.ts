// Globale Planungsregeln des Dienstplaners (Tabelle dienstplan_planning_rules, Singleton-Zeile).
import type { createAdminClient } from "@/lib/supabase/admin";

export type PlanningRules = {
  max_shifts_per_week: number;
  min_rest_hours: number;
  max_consecutive_days: number;
};

export const DEFAULT_PLANNING_RULES: PlanningRules = {
  max_shifts_per_week: 6,
  min_rest_hours: 11,
  max_consecutive_days: 6,
};

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizePlanningRules(input: Partial<Record<keyof PlanningRules, unknown>> | null | undefined): PlanningRules {
  return {
    max_shifts_per_week: Math.round(
      clamp(input?.max_shifts_per_week, 1, 7, DEFAULT_PLANNING_RULES.max_shifts_per_week)
    ),
    min_rest_hours: clamp(input?.min_rest_hours, 0, 24, DEFAULT_PLANNING_RULES.min_rest_hours),
    max_consecutive_days: Math.round(
      clamp(input?.max_consecutive_days, 1, 14, DEFAULT_PLANNING_RULES.max_consecutive_days)
    ),
  };
}

/** Lädt die Regeln; fehlt die Tabelle (Migration noch offen), gelten die Standardwerte. */
export async function loadPlanningRules(sb: ReturnType<typeof createAdminClient>): Promise<PlanningRules> {
  const { data, error } = await sb
    .from("dienstplan_planning_rules")
    .select("max_shifts_per_week, min_rest_hours, max_consecutive_days")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return DEFAULT_PLANNING_RULES;
  return normalizePlanningRules(data);
}
