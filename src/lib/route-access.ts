// src/lib/route-access.ts
import { createAdminClient } from "@/lib/supabase/admin";

export const LEVEL_NONE = 0;
export const LEVEL_READ = 1;

export function normalizeRouteKey(key: string) {
  return key.replace(/^\/+/, "").replace(/\/{2,}/g, "/").trim();
}

export async function getAllowedRoutesForRole(role: string) {
  const sb = createAdminClient();
  const { data: perms } = await sb
    .from("access_rules")
    .select("route, allowed")
    .eq("role", role);

  const map = new Map<string, number>();
  for (const r of perms ?? []) {
    const key = normalizeRouteKey(String(r.route));
    const level = r.allowed ? LEVEL_READ : LEVEL_NONE;
    if (!key) continue;
    map.set(key, Math.max(map.get(key) ?? LEVEL_NONE, level));
  }
  return map;
}
