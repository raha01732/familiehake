// /workspace/familiehake/src/lib/posthog-client.ts
"use client";

import posthog from "posthog-js";

type EventProperties = Record<string, unknown>;
type ErrorContext = {
  source: string;
  severity?: string;
  url?: string | null;
  userAgent?: string | null;
  digest?: string;
  reason?: unknown;
};

export const FEATURE_FLAGS = {
  dashboardRevamp: "ff_dashboard_revamp",
  commandMenuSearch: "ff_command_menu_search",
  adminInsights: "ff_admin_insights",
} as const;

export const EXPERIMENTS = {
  onboardingFlow: "exp_onboarding_flow",
  headerCta: "exp_header_cta",
  toolCardOrder: "exp_tool_card_order",
} as const;

export const FUNNELS = {
  navigation: "funnel_navigation",
  auth: "funnel_auth",
  toolUsage: "funnel_tool_usage",
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];
export type ExperimentKey = (typeof EXPERIMENTS)[keyof typeof EXPERIMENTS];
export type FunnelKey = (typeof FUNNELS)[keyof typeof FUNNELS];

export function trackEvent(eventName: string, properties: EventProperties = {}) {
  if (typeof window === "undefined") return;
  posthog.capture(eventName, properties);
}

export function trackException(error: Error, context: ErrorContext) {
  if (typeof window === "undefined") return;
  posthog.capture("$exception", {
    message: error.message,
    name: error.name,
    stack: error.stack ?? null,
    ...context,
  });
}

export function trackFunnelStep(funnel: FunnelKey, step: string, properties: EventProperties = {}) {
  trackEvent("funnel_step", {
    funnel,
    step,
    ...properties,
  });
}

export function isFeatureEnabled(flagKey: FeatureFlagKey) {
  return posthog.isFeatureEnabled(flagKey);
}

export function getExperimentVariant(experimentKey: ExperimentKey) {
  return posthog.getFeatureFlag(experimentKey);
}
