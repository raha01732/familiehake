import { PERMISSION_LEVELS, type PermissionLevel } from "@/lib/rbac";

export type RouteDescriptor = {
  route: string;
  label: string;
  description?: string;
  defaultLevel: PermissionLevel;
};

export const ROUTE_DESCRIPTORS: RouteDescriptor[] = [
  {
    route: "dashboard",
    label: "Dashboard",
    description: "Übersicht und Schnellzugriff.",
    defaultLevel: PERMISSION_LEVELS.READ,
  },
  {
    route: "admin",
    label: "Admin",
    description: "Zentrale Verwaltungsoberfläche.",
    defaultLevel: PERMISSION_LEVELS.READ,
  },
  {
    route: "admin/users",
    label: "Benutzerverwaltung",
    description: "Nutzerprofile und Rollen verwalten.",
    defaultLevel: PERMISSION_LEVELS.READ,
  },
  {
    route: "admin/settings",
    label: "Berechtigungen",
    description: "Rollen & Zugriffe konfigurieren.",
    defaultLevel: PERMISSION_LEVELS.ADMIN,
  },
  {
    route: "settings",
    label: "Einstellungen",
    description: "Persönliche Einstellungen.",
    defaultLevel: PERMISSION_LEVELS.READ,
  },
  {
    route: "monitoring",
    label: "Monitoring",
    description: "Systemstatus & Telemetrie.",
    defaultLevel: PERMISSION_LEVELS.READ,
  },
  {
    route: "activity",
    label: "Activity",
    description: "Live-Audit-Feed.",
    defaultLevel: PERMISSION_LEVELS.READ,
  },
  {
    route: "tools",
    label: "Tools-Hub",
    description: "Sammlung aller Module.",
    defaultLevel: PERMISSION_LEVELS.READ,
  },
  {
    route: "tools/files",
    label: "Dateien",
    description: "Dateimanager inkl. Freigaben.",
    defaultLevel: PERMISSION_LEVELS.WRITE,
  },
  {
    route: "tools/journal",
    label: "Journal",
    description: "Persönliche Notizen.",
    defaultLevel: PERMISSION_LEVELS.WRITE,
  },
  {
    route: "tools/storage",
    label: "Storage-Insights",
    description: "Speichernutzung & Buckets.",
    defaultLevel: PERMISSION_LEVELS.READ,
  },
  {
    route: "tools/system",
    label: "Systemübersicht",
    description: "Server- und Runtime-Details.",
    defaultLevel: PERMISSION_LEVELS.READ,
  },
];

export function getRouteDescriptor(route: string): RouteDescriptor | undefined {
  return ROUTE_DESCRIPTORS.find((d) => d.route === route);
}
