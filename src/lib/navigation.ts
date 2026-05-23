// src/lib/navigation.ts

/** Gruppierung in der Startseiten-Sidebar. */
export type ToolGroup = "personal" | "family" | "cinema" | "system";

export type NavLink = {
  routeKey: string;
  href: string;
  label: string;
  description?: string;
  /** Sidebar-Gruppe auf der Startseite (Default: "personal"). */
  group?: ToolGroup;
};

/**
 * Platzhalter für noch nicht gebaute Tools. Bewusst getrennt von
 * TOOL_LINKS, damit sie keine echten routeKeys/Berechtigungen erzeugen
 * (TOOL_LINKS wird u. a. in /admin/settings und tool-status iteriert).
 */
export type PlaceholderLink = {
  key: string;
  label: string;
  description?: string;
  group: ToolGroup;
};

export const TOOL_LINKS: NavLink[] = [
  {
    routeKey: "tools/files",
    href: "/tools/files",
    label: "Dateien",
    description: "Ablage, Ordner, Freigaben & Papierkorb",
    group: "personal",
  },
  {
    routeKey: "tools/journal",
    href: "/tools/journal",
    label: "Journal",
    description: "Privates Tagebuch mit Markdown & Suche",
    group: "personal",
  },
  {
    routeKey: "tools/calender",
    href: "/tools/calender",
    label: "Kalender",
    description: "Termine & Kalenderfreigaben",
    group: "personal",
  },
  {
    routeKey: "tools/storage",
    href: "/tools/storage",
    label: "Storage",
    description: "Speicher-Insights & Buckets",
    group: "personal",
  },
  {
    routeKey: "tools/finance",
    href: "/tools/finance",
    label: "Budget",
    description: "Einnahmen, Ausgaben & Kategorien",
    group: "personal",
  },
  {
    routeKey: "tools/vault",
    href: "/tools/vault",
    label: "Passwort-Safe",
    description: "Verschlüsselte Zugangsdaten & Passwörter",
    group: "personal",
  },
  {
    routeKey: "tools/nutrition",
    href: "/tools/nutrition",
    label: "Ernährung",
    description: "Rezepte, Zutaten-Suche & Ernährungstipps",
    group: "personal",
  },
  {
    routeKey: "tools/messages",
    href: "/tools/messages",
    label: "Nachrichten",
    description: "Interner Chat & Nachrichten",
    group: "personal",
  },
  {
    routeKey: "tools/tasks",
    href: "/tools/tasks",
    label: "Aufgaben",
    description: "Gemeinsames Kanban-Board für alle",
    group: "family",
  },
  {
    routeKey: "tools/dispoplaner",
    href: "/tools/dispoplaner",
    label: "Dispoplaner",
    description: "Kinovorstellungen Wochenplan",
    group: "cinema",
  },
  {
    routeKey: "tools/auslassplanung",
    href: "/tools/auslassplanung",
    label: "Auslassplanung",
    description: "Reinigung pro Vorstellung – KI-gestützt",
    group: "cinema",
  },
  {
    routeKey: "tools/dienstplaner",
    href: "/tools/dienstplaner",
    label: "Dienstplaner",
    description: "Schichten, Mitarbeiter & Monatsplanung",
    group: "cinema",
  },
  {
    routeKey: "tools/system",
    href: "/tools/system",
    label: "System",
    description: "Systemübersicht & Runtime-Details",
    group: "system",
  },
];

/** Platzhalter im Family-Bereich – inaktiv, bis das echte Tool existiert. */
export const PLACEHOLDER_LINKS: PlaceholderLink[] = [
  {
    key: "family/calendar",
    label: "Geteilter Kalender",
    description: "Gemeinsamer Familienkalender",
    group: "family",
  },
  {
    key: "family/storage",
    label: "Geteilter Storage",
    description: "Gemeinsam genutzter Speicher",
    group: "family",
  },
];

export const ADMIN_LINKS: NavLink[] = [
  { routeKey: "admin", href: "/admin", label: "Admin", group: "system" },
  { routeKey: "admin/users", href: "/admin/users", label: "Benutzer", group: "system" },
  { routeKey: "admin/settings", href: "/admin/settings", label: "Berechtigungen", group: "system" },
  { routeKey: "monitoring", href: "/monitoring", label: "Monitoring", group: "system" },
  { routeKey: "activity", href: "/activity", label: "Activity", group: "system" },
];
