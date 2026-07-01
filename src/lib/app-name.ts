// src/lib/app-name.ts
// Zentraler Anzeigename der Anwendung, per NEXT_PUBLIC_APP_NAME überschreibbar.
// Bewusst framework-frei (kein Import von env.ts), damit dies auch in
// Client-Komponenten und in framework-unabhängigen Modulen (z.B.
// system-messages/blocks.ts) ohne Bundling-Nebenwirkungen nutzbar ist.
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Hearth";

/** Für Kontexte ohne Leerzeichen/Sonderzeichen, z.B. HTTP-Header oder ICS-IDs. */
export const APP_NAME_SLUG = APP_NAME.replace(/[^a-zA-Z0-9]+/g, "") || "App";

/** Kontakt-E-Mail des Betreibers, u.a. für Nutzungsbedingungen & Datenschutzerklärung. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "ralf@familiehake.de";
