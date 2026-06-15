// src/lib/system-messages/blocks.ts
//
// Baustein-Modell für Systemnachrichten + reine Renderer.
// Bewusst frei von Server-/Framework-Abhängigkeiten, damit es sowohl im
// Client-Composer (Live-Vorschau) als auch serverseitig (Versand) läuft.
import { trackedClickUrl, trackingPixelUrl, isHttpUrl } from "@/lib/system-messages/tracking";

export type NoticeTone = "info" | "warn" | "success";

/** Optionales Tracking pro Empfänger (nur beim Versand, nicht in der Vorschau). */
export type EmailTracking = { baseUrl: string; token: string; pixel: boolean };

export type SystemMessageBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "button"; label: string; href: string }
  | { type: "divider" }
  | { type: "notice"; tone: NoticeTone; text: string }
  | { type: "image"; src: string; alt?: string };

export type SystemMessageChannel = "email" | "inapp";
export type SystemMessageAudience = "all" | "selected";
export type SystemMessageStatus = "draft" | "scheduled" | "sent" | "failed";

export const BLOCK_TYPES: SystemMessageBlock["type"][] = [
  "heading",
  "paragraph",
  "button",
  "notice",
  "divider",
  "image",
];

/** Erzeugt einen neuen Block mit sinnvollen Defaults (für den Composer). */
export function createBlock(type: SystemMessageBlock["type"]): SystemMessageBlock {
  switch (type) {
    case "heading":
      return { type: "heading", text: "Überschrift" };
    case "paragraph":
      return { type: "paragraph", text: "" };
    case "button":
      return { type: "button", label: "Öffnen", href: "" };
    case "divider":
      return { type: "divider" };
    case "notice":
      return { type: "notice", tone: "info", text: "" };
    case "image":
      return { type: "image", src: "", alt: "" };
  }
}

// ── HTML-Escaping (dependency-frei, client-sicher) ────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

/** Zeilenumbrüche im (escapeten) Text in <br> wandeln. */
function multiline(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

// ── Markenfarben (statisch, für Mail-Kompatibilität) ──────────────────

const BRAND = {
  primary: "#6366f1",
  primaryDark: "#4f46e5",
  text: "#18181b",
  muted: "#52525b",
  faint: "#71717a",
  border: "#e4e4e7",
  bg: "#f4f4f5",
  card: "#ffffff",
};

const NOTICE_STYLES: Record<NoticeTone, { bg: string; border: string; color: string; label: string }> = {
  info: { bg: "#eef2ff", border: "#c7d2fe", color: "#3730a3", label: "Info" },
  warn: { bg: "#fef3c7", border: "#fde68a", color: "#92400e", label: "Achtung" },
  success: { bg: "#dcfce7", border: "#bbf7d0", color: "#166534", label: "Erfolg" },
};

// ── Block → Email-HTML ────────────────────────────────────────────────

function renderBlockHtml(block: SystemMessageBlock, tracking?: EmailTracking): string {
  switch (block.type) {
    case "heading":
      return `<h2 style="margin:24px 0 8px;font-size:19px;line-height:1.3;color:${BRAND.text};font-weight:700">${escapeHtml(
        block.text
      )}</h2>`;
    case "paragraph":
      if (!block.text.trim()) return "";
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.muted}">${multiline(
        block.text
      )}</p>`;
    case "button": {
      const href = block.href.trim();
      if (!href) return "";
      // Klick-Tracking: über Redirect leiten (nur für http(s)-Ziele).
      const finalHref =
        tracking && isHttpUrl(href) ? trackedClickUrl(tracking.baseUrl, tracking.token, href) : href;
      return `<p style="margin:8px 0 20px">
        <a href="${escapeAttr(finalHref)}" style="display:inline-block;background:${BRAND.primary};color:#ffffff;padding:11px 22px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px">${escapeHtml(
        block.label || "Öffnen"
      )}</a>
      </p>`;
    }
    case "divider":
      return `<hr style="border:none;border-top:1px solid ${BRAND.border};margin:24px 0">`;
    case "notice": {
      const s = NOTICE_STYLES[block.tone];
      if (!block.text.trim()) return "";
      return `<div style="margin:0 0 16px;padding:12px 14px;border-radius:10px;background:${s.bg};border:1px solid ${s.border};color:${s.color};font-size:14px;line-height:1.55">${multiline(
        block.text
      )}</div>`;
    }
    case "image": {
      if (!block.src.trim()) return "";
      return `<img src="${escapeAttr(block.src)}" alt="${escapeAttr(
        block.alt ?? ""
      )}" style="display:block;max-width:100%;height:auto;border-radius:10px;margin:0 0 16px" />`;
    }
  }
}

/**
 * Rendert eine komplette, markenkonforme HTML-Mail (inline-CSS, mail-sicher).
 * `appUrl` wird – falls vorhanden – für den Footer-Link verwendet.
 */
export function renderEmailHtml(params: {
  title: string;
  blocks: SystemMessageBlock[];
  appUrl?: string | null;
  tracking?: EmailTracking;
}): string {
  const { title, blocks, appUrl, tracking } = params;
  const body = blocks.map((b) => renderBlockHtml(b, tracking)).join("\n");
  const footerLink =
    appUrl && appUrl.trim()
      ? `<a href="${escapeAttr(appUrl)}" style="color:${BRAND.primary};text-decoration:none">Hearth öffnen</a> · `
      : "";
  const pixel =
    tracking && tracking.pixel
      ? `<img src="${escapeAttr(trackingPixelUrl(tracking.baseUrl, tracking.token))}" width="1" height="1" alt="" style="display:none;width:1px;height:1px" />`
      : "";

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:${BRAND.bg};margin:0;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:${BRAND.card};border-radius:16px;overflow:hidden;border:1px solid ${BRAND.border}">
    <tr><td style="height:6px;background:linear-gradient(90deg,${BRAND.primary},${BRAND.primaryDark})"></td></tr>
    <tr><td style="padding:28px 28px 8px">
      <p style="margin:0 0 4px;color:${BRAND.faint};font-size:12px;letter-spacing:0.12em;text-transform:uppercase">Hearth</p>
      <h1 style="margin:0;color:${BRAND.text};font-size:22px;line-height:1.25">${escapeHtml(title)}</h1>
    </td></tr>
    <tr><td style="padding:12px 28px 28px">
      ${body}
      ${pixel}
    </td></tr>
    <tr><td style="padding:18px 28px;border-top:1px solid ${BRAND.border};background:#fafafa">
      <p style="margin:0;color:${BRAND.faint};font-size:11px;line-height:1.5">
        ${footerLink}Diese Nachricht wurde von einem Administrator an Mitglieder gesendet.
      </p>
    </td></tr>
  </table>
</body></html>`;
}

// ── Block → Plaintext (Mail-Fallback) ─────────────────────────────────

export function renderPlainText(params: { title: string; blocks: SystemMessageBlock[] }): string {
  const { title, blocks } = params;
  const lines: string[] = [title, "".padEnd(Math.min(title.length, 40), "=")];
  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        lines.push("", block.text.toUpperCase());
        break;
      case "paragraph":
        if (block.text.trim()) lines.push("", block.text);
        break;
      case "notice":
        if (block.text.trim()) lines.push("", `[${NOTICE_STYLES[block.tone].label}] ${block.text}`);
        break;
      case "button":
        if (block.href.trim()) lines.push("", `${block.label || "Öffnen"}: ${block.href}`);
        break;
      case "divider":
        lines.push("", "—".repeat(20));
        break;
      case "image":
        if (block.src.trim()) lines.push("", `[Bild] ${block.alt || block.src}`);
        break;
    }
  }
  return lines.join("\n").trim();
}

// ── Block → In-App-Benachrichtigung ───────────────────────────────────

/**
 * Verdichtet die Bausteine zu einer In-App-Benachrichtigung: ein Textkörper
 * (aus Überschriften/Absätzen/Hinweisen) und – falls vorhanden – der erste
 * Button als Link.
 */
export function renderInApp(blocks: SystemMessageBlock[]): { body: string; link: string | null } {
  const parts: string[] = [];
  let link: string | null = null;
  for (const block of blocks) {
    if (block.type === "heading" && block.text.trim()) parts.push(block.text.trim());
    else if (block.type === "paragraph" && block.text.trim()) parts.push(block.text.trim());
    else if (block.type === "notice" && block.text.trim()) parts.push(block.text.trim());
    else if (block.type === "button" && block.href.trim() && !link) link = block.href.trim();
  }
  return { body: parts.join("\n\n"), link };
}

/** Validiert/normalisiert eine unbekannte Block-Liste (z.B. aus der DB / vom Client). */
export function normalizeBlocks(value: unknown): SystemMessageBlock[] {
  if (!Array.isArray(value)) return [];
  const out: SystemMessageBlock[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as Record<string, unknown>;
    switch (b.type) {
      case "heading":
        out.push({ type: "heading", text: String(b.text ?? "") });
        break;
      case "paragraph":
        out.push({ type: "paragraph", text: String(b.text ?? "") });
        break;
      case "button":
        out.push({ type: "button", label: String(b.label ?? "Öffnen"), href: String(b.href ?? "") });
        break;
      case "divider":
        out.push({ type: "divider" });
        break;
      case "notice": {
        const tone = b.tone === "warn" || b.tone === "success" ? b.tone : "info";
        out.push({ type: "notice", tone, text: String(b.text ?? "") });
        break;
      }
      case "image":
        out.push({ type: "image", src: String(b.src ?? ""), alt: b.alt != null ? String(b.alt) : "" });
        break;
    }
  }
  return out;
}
