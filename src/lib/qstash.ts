// src/lib/qstash.ts
// Dünner Wrapper um Upstash QStash für den zeitgenauen Versand geplanter
// Systemnachrichten. Alles ist „best effort": fehlt die Konfiguration oder
// schlägt ein Aufruf fehl, fällt das System auf den täglichen Vercel-Cron
// (dispatch-system-messages) zurück.
import { Client, Receiver } from "@upstash/qstash";

function appUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  return raw ? raw.replace(/\/$/, "") : null;
}

/** QStash kann Jobs publishen (Token + App-URL vorhanden). */
export function qstashEnabled(): boolean {
  return Boolean(process.env.QSTASH_TOKEN && appUrl());
}

/** Signaturprüfung möglich (Signing-Keys vorhanden). */
export function qstashVerifyEnabled(): boolean {
  return Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY);
}

function dispatchUrl(): string | null {
  const base = appUrl();
  return base ? `${base}/api/qstash/dispatch` : null;
}

function client(): Client | null {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return null;
  return new Client({ token });
}

/**
 * Plant den Versand einer Systemnachricht zum gewünschten Zeitpunkt.
 * Gibt die QStash-Message-ID zurück (für späteres Stornieren) oder null,
 * wenn QStash nicht konfiguriert ist bzw. der Aufruf fehlschlägt.
 */
export async function scheduleSystemMessageJob(
  messageId: string,
  scheduledAtIso: string
): Promise<string | null> {
  const c = client();
  const url = dispatchUrl();
  if (!c || !url) return null;

  const notBefore = Math.floor(new Date(scheduledAtIso).getTime() / 1000);
  if (!Number.isFinite(notBefore)) return null;

  try {
    const res = await c.publishJSON({
      url,
      body: { id: messageId },
      notBefore,
    });
    const first = Array.isArray(res) ? res[0] : res;
    return (first as { messageId?: string } | undefined)?.messageId ?? null;
  } catch (e) {
    console.error("[qstash] schedule failed:", e);
    return null;
  }
}

/** Storniert einen geplanten QStash-Job (z. B. bei Bearbeiten/Löschen). */
export async function cancelSystemMessageJob(qstashMessageId: string | null | undefined): Promise<void> {
  if (!qstashMessageId) return;
  const c = client();
  if (!c) return;
  try {
    await c.messages.delete(qstashMessageId);
  } catch (e) {
    // 404 = bereits zugestellt/storniert — kein Problem.
    console.warn("[qstash] cancel failed (ignored):", e instanceof Error ? e.message : e);
  }
}

/** Verifiziert die QStash-Signatur eines eingehenden Requests. */
export async function verifyQStashSignature(params: {
  signature: string | null;
  body: string;
}): Promise<boolean> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!params.signature || !currentSigningKey || !nextSigningKey) return false;

  try {
    const receiver = new Receiver({ currentSigningKey, nextSigningKey });
    return await receiver.verify({ signature: params.signature, body: params.body });
  } catch (e) {
    console.warn("[qstash] signature verification failed:", e instanceof Error ? e.message : e);
    return false;
  }
}
