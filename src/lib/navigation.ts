// src/lib/navigation.ts
export type NavLink = {
  routeKey: string;
  href: string;
  label: string;
  description?: string;
};

export const TOOL_LINKS: NavLink[] = [
  {
    routeKey: "tools/files",
    href: "/tools/files",
    label: "Dateien",
    description: "Ablage, Ordner, Freigaben & Papierkorb",
  },
  {
    routeKey: "tools/journal",
    href: "/tools/journal",
    label: "Journal",
    description: "Privates Tagebuch mit Markdown & Suche",
  },
  {
    routeKey: "tools/dispoplaner",
    href: "/tools/dispoplaner",
    label: "Dispoplaner",
    description: "Kinovorstellungen Wochenplan",
  },
  {
    routeKey: "tools/dienstplaner",
    href: "/tools/dienstplaner",
    label: "Dienstplaner",
    description: "Schichten, Mitarbeiter & Monatsplanung",
  },
  {
    routeKey: "tools/calender",
    href: "/tools/calender",
    label: "Kalender",
    description: "Termine & Kalenderfreigaben",
  },
  {
    routeKey: "tools/messages",
    href: "/tools/messages",
    label: "Nachrichten",
    description: "Interner Chat & Nachrichten",
  },
  {
    routeKey: "tools/storage",
    href: "/tools/storage",
    label: "Storage",
    description: "Speicher-Insights & Buckets",
  },
  {
    routeKey: "tools/system",
    href: "/tools/system",
    label: "System",
    description: "Systemübersicht & Runtime-Details",
  },
];

export const ADMIN_LINKS: NavLink[] = [
  { routeKey: "admin", href: "/admin", label: "Admin" },
  { routeKey: "admin/users", href: "/admin/users", label: "Benutzer" },
  { routeKey: "admin/settings", href: "/admin/settings", label: "Berechtigungen" },
  { routeKey: "monitoring", href: "/monitoring", label: "Monitoring" },
  { routeKey: "activity", href: "/activity", label: "Activity" },
];
