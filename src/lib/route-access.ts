// src/lib/route-access.ts
import { createAdminClient } from "@/lib/supabase/admin";

export function normalizeRouteKey(key: string) {
  return key.replace(/^\/+/, "").replace(/\/{2,}/g, "/").trim();
}

export async function getAllowedRoutesForRole(role: string) {
  const sb = createAdminClient();
  const { data: perms } = await sb
    .from("access_rules")
    .select("route, allowed")
    .eq("role", role);

  const map = new Map<string, boolean>();
  for (const r of perms ?? []) {
    const key = normalizeRouteKey(String(r.route));
    if (!key) continue;
    map.set(key, !!r.allowed);
  }
  return map;
}
