// src/lib/mail.ts
import { clerkClient } from "@clerk/nextjs/server";

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
};

export type MailResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; skipped?: boolean };

/**
 * Resolve the primary email address for a Clerk user.
 * Returns null when the user has no verified email or doesn't exist.
 */
export async function resolveUserEmail(userId: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const primaryId = user.primaryEmailAddressId;
    const primary =
      user.emailAddresses.find((e) => e.id === primaryId) ??
      user.emailAddresses[0];
    return primary?.emailAddress ?? null;
  } catch (e) {
    console.error("[mail] resolveUserEmail failed:", e);
    return null;
  }
}

/**
 * Minimal Resend wrapper with a graceful console fallback when
 * either RESEND_API_KEY or NOTIFICATION_EMAIL_FROM is missing.
 * Mail failures never throw — they're logged and returned.
 */
export async function sendEmail(input: SendEmailInput): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_EMAIL_FROM;

  if (!apiKey || !from) {
    console.info(
      `[mail] skipped (no API key / sender configured) → to=${
        Array.isArray(input.to) ? input.to.join(",") : input.to
      } subject="${input.subject}"`
    );
    return { ok: false, skipped: true, error: "mail not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      console.error(`[mail] Resend error ${res.status}: ${errText}`);
      return { ok: false, error: `resend ${res.status}` };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (e) {
    console.error("[mail] send failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

/**
 * Escape HTML entities. Small, dependency-free.
 * Callers that interpolate user content into mail templates should pass
 * each field through this helper.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
