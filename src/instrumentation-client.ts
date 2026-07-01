// /workspace/familiehake/src/instrumentation-client.ts
// This file configures the initialization of Sentry and PostHog on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import { readAnalyticsConsentCookie } from "@/lib/analytics-consent";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "/ph";

// PostHog (Autocapture, Identify, Session Recording) und Sentry Session
// Replay sind nicht technisch notwendig und laufen daher nur nach
// ausdrücklicher Einwilligung über den AnalyticsConsentBanner. Ohne
// Entscheidung/bei Ablehnung bleibt alles deaktiviert (siehe Datenschutz-
// erklärung, Abschnitt „Cookies, Analytics & Session Replay").
const analyticsConsent = readAnalyticsConsentCookie();
const analyticsGranted = analyticsConsent === "granted";

if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    ui_host: "https://eu.posthog.com",
    defaults: "2025-11-30",
    capture_pageview: false,
    autocapture: true,
    opt_out_capturing_by_default: true,
    session_recording: {
      maskAllInputs: true,
      blockClass: "ph-no-capture",
      maskTextClass: "ph-mask",
    },
    loaded: (posthogClient) => {
      posthogClient.register({
        stack: ["Supabase", "Clerk", "Upstash", "Sentry", "Vercel"],
      });
      if (analyticsGranted) {
        posthogClient.opt_in_capturing();
      }
    },
  });
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tunnel: "/api/sentry-tunnel",

  // Add optional integrations for additional features
  integrations: [
    // Session Replay (Bildschirmaufzeichnung) nur nach Einwilligung.
    ...(analyticsGranted ? [Sentry.replayIntegration()] : []),
    Sentry.feedbackIntegration({
      colorScheme: "system",
      triggerLabel: "Einen Fehler melden",
      formTitle: "Einen Fehler melden",
      submitButtonLabel: "Fehlermeldung senden",
      cancelButtonLabel: "Abbrechen",
      confirmButtonLabel: "Bestätigen",
      addScreenshotButtonLabel: "Einen Screenshot anfügen",
      removeScreenshotButtonLabel: "Screenshot entfernen",
      namePlaceholder: "Dein Name",
      emailLabel: "E-mail",
      messageLabel: "Beschreibung",
      messagePlaceholder: "Welcher Fehler ist aufgetreten? Was hast du erwartet?",
      successMessageText: "Danke für deine Meldung!",
      highlightToolText: "Hervorheben",
      hideToolText: "Schwärzen",
      removeHighlightText: "Entfernen",
    }),
  ],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled (nur bei erteilter Einwilligung > 0).
  replaysSessionSampleRate: analyticsGranted ? 0.1 : 0,

  // Define how likely Replay events are sampled when an error occurs (nur bei erteilter Einwilligung).
  replaysOnErrorSampleRate: analyticsGranted ? 1.0 : 0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
