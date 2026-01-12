// src/lib/access-map.ts
export type AccessDefaults = Record<string, boolean>;

export type RouteDescriptor = {
  route: string;
  label: string;
  description?: string;
  defaults?: AccessDefaults;
};

export const ROUTE_DESCRIPTORS: RouteDescriptor[] = [
  {
    route: "dashboard",
    label: "Dashboard",
    description: "Übersicht und Schnellzugriff.",
    defaults: { user: true, admin: true },
  },
  {
    route: "admin",
    label: "Admin",
    description: "Zentrale Verwaltungsoberfläche.",
    defaults: { admin: true },
  },
  {
    route: "admin/users",
    label: "Benutzerverwaltung",
    description: "Nutzerprofile und Rollen verwalten.",
    defaults: { admin: true },
  },
  {
    route: "admin/settings",
    label: "Berechtigungen",
    description: "Rollen & Zugriffe konfigurieren.",
    defaults: { admin: true },
  },
  {
    route: "settings",
    label: "Einstellungen",
    description: "Persönliche Einstellungen.",
    defaults: { admin: true },
  },
  {
    route: "monitoring",
    label: "Monitoring",
    description: "Systemstatus & Telemetrie.",
    defaults: { admin: true },
  },
  {
    route: "activity",
    label: "Activity",
    description: "Live-Audit-Feed.",
    defaults: { admin: true },
  },
  {
    route: "tools",
    label: "Tools-Hub",
    description: "Sammlung aller Module.",
    defaults: { user: true, admin: true },
  },
  {
    route: "tools/files",
    label: "Dateien",
    description: "Dateimanager inkl. Freigaben.",
    defaults: { user: true, admin: true },
  },
  {
    route: "tools/journal",
    label: "Journal",
    description: "Persönliche Notizen.",
    defaults: { user: true, admin: true },
  },
  {
    route: "tools/dispoplaner",
    label: "Dispoplaner",
    description: "Kinovorstellungen planen",
    defaults: { user: true, admin: true },
  },
  {
    route: "tools/calender",
    label: "Kalender",
    description: "Kalender & Termine",
    defaults: { user: true, admin: true },
  },
  {
    route: "tools/messages",
    label: "Nachrichten",
    description: "Interner Chat",
    defaults: { user: true, admin: true },
  },
  {
    route: "tools/calender",
    label: "Kalender",
    description: "Kalender & Termine",
    defaultLevel: PERMISSION_LEVELS.WRITE,
  },
  {
    route: "tools/messages",
    label: "Nachrichten",
    description: "Interner Chat",
    defaultLevel: PERMISSION_LEVELS.WRITE,
  },
  {
    route: "tools/storage",
    label: "Storage-Insights",
    description: "Speichernutzung & Buckets.",
    defaults: { admin: true },
  },
  {
    route: "tools/system",
    label: "Systemübersicht",
    description: "Server- und Runtime-Details.",
    defaults: { admin: true },
  },
];

export function getRouteDescriptor(route: string): RouteDescriptor | undefined {
  return ROUTE_DESCRIPTORS.find((d) => d.route === route);
}

export function getRouteDefaultAccess(route: string, role: string): boolean | undefined {
  const descriptor = getRouteDescriptor(route);
  return descriptor?.defaults?.[role];
}
