// /workspace/familiehake/src/app/tools/auslassplanung/utils.ts

export type CleaningPreference = "preferred" | "backup";
export type ShowIntensity = "light" | "standard" | "intense";
export type ShowPlanStatus = "open" | "planned" | "completed" | "cancelled";

export type CleaningStaff = {
  id: number;
  name: string;
  preference: CleaningPreference;
  color: string;
  is_active: boolean;
  user_id: string | null;
  notes: string | null;
  sort_order: number;
};

export type CleaningShow = {
  id: number;
  show_date: string;
  hall_number: number;
  hall_label: string | null;
  end_time: string;
  attendees: number;
  cleanup_minutes: number;
  intensity: ShowIntensity;
  movie_title: string | null;
  notes: string | null;
  plan_status: ShowPlanStatus;
  ai_recommended_staff_count: number | null;
  ai_notes: string | null;
};

export type CleaningAssignment = {
  id: number;
  show_id: number;
  staff_id: number;
  assigned_by: "manual" | "ai" | "override";
  reason: string | null;
  created_at: string;
};

export type CleaningFeedback = {
  show_id: number;
  actual_staff_count: number;
  actual_duration_minutes: number | null;
  rating: number | null;
  notes: string | null;
  recorded_at: string;
};

export const INTENSITY_OPTIONS: { value: ShowIntensity; label: string; description: string }[] = [
  {
    value: "light",
    label: "Leicht",
    description: "z. B. Vormittagsvorstellung ohne Snacks — weniger Aufwand",
  },
  {
    value: "standard",
    label: "Standard",
    description: "Normale Vorstellung — durchschnittlicher Aufwand",
  },
  {
    value: "intense",
    label: "Intensiv",
    description: "Familienfilm, 3D oder Erlebnis-Vorstellung — viel Müll",
  },
];

export const PREFERENCE_OPTIONS: { value: CleaningPreference; label: string; description: string }[] = [
  {
    value: "preferred",
    label: "Bevorzugt",
    description: "Wird primär eingeteilt",
  },
  {
    value: "backup",
    label: "Im Zweifelsfall",
    description: "Nur ergänzend / wenn bevorzugte MA nicht reichen",
  },
];

export const STAFF_COLORS = [
  "#06b6d4",
  "#22c55e",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#eab308",
  "#ef4444",
  "#14b8a6",
  "#6366f1",
  "#f43f5e",
];

export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatTimeRange(end: string, cleanupMinutes: number): string {
  const [hStr, mStr] = end.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return `${end} (+${cleanupMinutes}m)`;
  let totalMins = h * 60 + m + cleanupMinutes;
  totalMins = ((totalMins % (24 * 60)) + 24 * 60) % (24 * 60);
  const cleanH = Math.floor(totalMins / 60);
  const cleanM = totalMins % 60;
  const target = `${String(cleanH).padStart(2, "0")}:${String(cleanM).padStart(2, "0")}`;
  return `${end.slice(0, 5)} → fertig bis ${target}`;
}

/**
 * Heuristik-Fallback, wenn die KI nicht erreichbar ist:
 * Personalbedarf je nach Besucher × Intensität.
 */
export function recommendStaffCount(attendees: number, intensity: ShowIntensity): number {
  const factor = intensity === "intense" ? 1.5 : intensity === "light" ? 0.7 : 1;
  const base = attendees <= 50 ? 1 : attendees <= 150 ? 2 : 3;
  return Math.max(1, Math.round(base * factor));
}
