// Welche Rollen dürfen welche "Tools"/Unterseiten sehen?
// key = route segment unter / (ohne slash am Anfang)

export type UserRole = "admin" | "member";

export const ACCESS_MAP: Record<string, Array<UserRole>> = {
  dashboard: ["member", "admin"],
  admin: ["admin"],
  settings: ["admin"],
  monitoring: ["admin"]
};
