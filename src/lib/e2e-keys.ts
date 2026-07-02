"use client";
// Client-seitige Verwaltung des E2E-Schlüsselpaars für /tools/messages.
// Der private Schlüssel verlässt nie den Browser (localStorage); der
// öffentliche Teil wird unter user_keys veröffentlicht, damit andere
// Nutzer Nachrichten verschlüsseln können – auch an Personen, die das
// Nachrichten-Tool selbst noch nie geöffnet haben (siehe
// MessagingKeyBootstrap, das ensureKeyPublished() global beim App-Start
// für jeden eingeloggten Nutzer anstößt).
import { generateRSA } from "@/lib/crypto";

const PRIVATE_KEY_STORAGE_KEY = "e2e_private_pem";
const PUBLIC_KEY_STORAGE_KEY = "e2e_public_pem";

export function getLocalPrivateKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PRIVATE_KEY_STORAGE_KEY);
}

export type EnsureKeyResult = { ok: boolean; privPEM: string };

/**
 * Erzeugt bei Bedarf ein Schlüsselpaar (einmalig, lokal) und veröffentlicht
 * den öffentlichen Teil beim Server – idempotent, kann gefahrlos mehrfach
 * aufgerufen werden (z. B. bei jedem App-Start), holt eine zuvor
 * fehlgeschlagene Veröffentlichung automatisch nach.
 */
export async function ensureKeyPublished(): Promise<EnsureKeyResult> {
  let priv = localStorage.getItem(PRIVATE_KEY_STORAGE_KEY);
  let pub = localStorage.getItem(PUBLIC_KEY_STORAGE_KEY);
  if (!priv || !pub) {
    const kp = await generateRSA();
    priv = kp.privatePEM;
    pub = kp.publicPEM;
    localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, priv);
    localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, pub);
  }

  try {
    const res = await fetch("/api/keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_key_pem: pub }),
    });
    const json = await res.json();
    return { ok: Boolean(json?.ok), privPEM: priv };
  } catch {
    return { ok: false, privPEM: priv };
  }
}
