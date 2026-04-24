// src/lib/user-display.ts
// Hilfsfunktionen, um Clerk-User-IDs in lesbare Namen zu verwandeln.

export type ClerkUserLike = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  emailAddresses?: Array<{ emailAddress: string }> | null;
};

export function formatUserDisplayName(u: ClerkUserLike): string {
  const full = [u.firstName ?? "", u.lastName ?? ""].map((s) => s.trim()).filter(Boolean).join(" ");
  if (full) return full;
  if (u.username && u.username.trim()) return u.username.trim();
  const email = u.emailAddresses?.[0]?.emailAddress?.trim();
  if (email) return email;
  return "Unbekannt";
}
