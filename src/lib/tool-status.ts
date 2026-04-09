// /workspace/familiehake/src/lib/tool-status.ts
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { TOOL_LINKS } from "@/lib/navigation";

export type ToolStatus = {
  routeKey: string;
  enabled: boolean;
  maintenanceMessage: string | null;
  updatedAt: string | null;
};

export type ToolStatusMap = Record<string, ToolStatus>;

function getDefaultToolStatusMap(): ToolStatusMap {
  return Object.fromEntries(
    TOOL_LINKS.map((link) => [
      link.routeKey,
      {
        routeKey: link.routeKey,
        enabled: true,
        maintenanceMessage: null,
        updatedAt: null,
      },
    ])
  );
}

const getToolStatusMapCached = cache(async (): Promise<ToolStatusMap> => {
  const fallback = getDefaultToolStatusMap();

  try {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("tool_status")
      .select("route_key, enabled, maintenance_message, updated_at")
      .in(
        "route_key",
        TOOL_LINKS.map((link) => link.routeKey)
      );

    if (error) {
      console.error("[tool-status] failed to load tool_status", error);
      return fallback;
    }

    const result: ToolStatusMap = { ...fallback };
    for (const row of data ?? []) {
      const routeKey = row.route_key as string;
      result[routeKey] = {
        routeKey,
        enabled: typeof row.enabled === "boolean" ? row.enabled : true,
        maintenanceMessage:
          typeof row.maintenance_message === "string" ? row.maintenance_message : null,
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
      };
    }

    return result;
  } catch (error) {
    console.error("[tool-status] unexpected error", error);
    return fallback;
  }
});

export async function getToolStatusMap(): Promise<ToolStatusMap> {
  return getToolStatusMapCached();
}
