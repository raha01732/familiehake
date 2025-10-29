import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "./access-map";

// Fallback, falls DB leer oder Fehler
const FALLBACK: Record<string, UserRole[]> = {
  dashboard: ["member", "admin"],
  admin: ["admin"],
  "admin/users": ["admin"],
  settings: ["admin"],
  monitoring: ["admin"]
};

export async function getAccessMapFromDb(): Promise<Record<string, UserRole[]>> {
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from("tools_access")
      .select("route, roles")
      .order("route", { ascending: true });

    if (error || !data || data.length === 0) return FALLBACK;

    const map: Record<string, UserRole[]> = {};
    for (const row of data) {
      map[row.route] = (row.roles as UserRole[]) ?? ["member"];
    }
    return map;
  } catch {
    return FALLBACK;
  }
}

export async function getAllowedRoles(routeKey: string): Promise<UserRole[] | null> {
  const map = await getAccessMapFromDb();
  return map[routeKey] ?? null; // null => jede eingeloggte Rolle erlaubt
}
