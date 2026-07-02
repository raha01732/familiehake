// /workspace/familiehake/src/components/MessagingKeyBootstrap.tsx
"use client";

import { useEffect } from "react";
import { ensureKeyPublished } from "@/lib/e2e-keys";

/**
 * Unsichtbar (kein UI) global für jeden eingeloggten Nutzer gemountet, damit
 * ein E2E-Schlüsselpaar für /tools/messages bereits existiert, bevor die
 * Person das Tool je geöffnet hat – sonst kann man ihr keine Nachricht
 * schicken, weil kein öffentlicher Schlüssel veröffentlicht ist.
 */
export default function MessagingKeyBootstrap() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_VERCEL_ENV === "preview") return;
    void ensureKeyPublished();
  }, []);

  return null;
}
