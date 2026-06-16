// src/lib/workspaces.ts
//
// Zentrale Registry der "Workspaces". Ein Workspace bündelt mehrere Tools
// (Routen) unter einer freischaltbaren Rolle. Das verallgemeinert den
// bisherigen Kino-Workspace (Rolle "cinema"): Wer die Workspace-Rolle
// zugewiesen bekommt, sieht die zugehörigen Tools. Zusätzlich können
// Workspaces pro Rolle gesperrt werden (siehe workspace-locks.ts).
//
// Single Source of Truth für: Admin-Settings (Sperr-Matrix), Sidebar-Badges,
// Tool-Gate und die Rollen-Allowlist im Benutzer-Modal.

import { TOOL_LINKS, type ToolGroup } from "@/lib/navigation";

export type WorkspaceKey = "personal" | "family" | "cinema";

export type Workspace = {
  key: WorkspaceKey;
  label: string;
  /** Passende Sidebar-Gruppe aus navigation.ts. */
  group: ToolGroup;
  /** Rolle, deren Zuweisung diesen Workspace freischaltet. */
  unlockRole: string;
  /** Tools (routeKeys), die zu diesem Workspace gehören. */
  routeKeys: string[];
};

function routesForGroup(group: ToolGroup): string[] {
  return TOOL_LINKS.filter((link) => (link.group ?? "personal") === group).map(
    (link) => link.routeKey
  );
}

// "system" ist bewusst KEIN per-Benutzer-Workspace – diese Tools bleiben
// admin-gesteuert.
export const WORKSPACES: Workspace[] = [
  {
    key: "personal",
    label: "Personal-Workspace",
    group: "personal",
    unlockRole: "personal",
    routeKeys: routesForGroup("personal"),
  },
  {
    key: "family",
    label: "Family-Bereich",
    group: "family",
    unlockRole: "family",
    routeKeys: routesForGroup("family"),
  },
  {
    key: "cinema",
    label: "Kino-Workspace",
    group: "cinema",
    unlockRole: "cinema",
    routeKeys: routesForGroup("cinema"),
  },
];

const ROUTE_TO_WORKSPACE = new Map<string, Workspace>();
for (const ws of WORKSPACES) {
  for (const routeKey of ws.routeKeys) {
    ROUTE_TO_WORKSPACE.set(routeKey, ws);
  }
}

/** Workspace, zu dem eine Tool-Route gehört (oder undefined, z. B. System-Tools). */
export function getWorkspaceForRoute(routeKey: string): Workspace | undefined {
  return ROUTE_TO_WORKSPACE.get(routeKey);
}

export function getWorkspaceByKey(key: string): Workspace | undefined {
  return WORKSPACES.find((ws) => ws.key === key);
}

/** Namen aller Rollen, die einen Workspace freischalten (z. B. für die Modal-Allowlist). */
export function getUnlockRoleNames(): string[] {
  return WORKSPACES.map((ws) => ws.unlockRole);
}

/** True, wenn der Rollenname eine Workspace-Freischaltungs-Rolle ist. */
export function isWorkspaceUnlockRole(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return WORKSPACES.some((ws) => ws.unlockRole === normalized);
}
