// /workspace/familiehake/src/components/PostHogProvider.tsx
"use client";

import { type ReactNode, useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PostHogProvider as PostHogReactProvider } from "posthog-js/react";
import posthog from "posthog-js";
import { useUser } from "@clerk/nextjs";
import { EXPERIMENTS, FUNNELS, trackEvent, trackFunnelStep } from "@/lib/posthog-client";

const stackTools = ["Supabase", "Clerk", "Upstash", "Sentry", "Vercel"] as const;

type PostHogProviderProps = {
  children: ReactNode;
};

function PostHogIdentity() {
  const { isSignedIn, user } = useUser();

  const userProperties = useMemo(() => {
    if (!user) return null;
    const email = user.primaryEmailAddress?.emailAddress ?? null;
    const name = user.fullName ?? user.username ?? null;
    const roles = Array.isArray(user.publicMetadata?.roles) ? user.publicMetadata.roles : null;

    return {
      email,
      name,
      roles,
      tools: stackTools,
      clerk_user_id: user.id,
    };
  }, [user]);

  useEffect(() => {
    if (!isSignedIn || !user || !userProperties) {
      posthog.reset();
      return;
    }

    posthog.identify(user.id, userProperties);
    posthog.register({ tools: stackTools, clerk_user_id: user.id });
    trackEvent("user_identified", { user_id: user.id });
  }, [isSignedIn, user, userProperties]);

  return null;
}

function PostHogFeatureFlags() {
  useEffect(() => {
    posthog.onFeatureFlags((flags) => {
      const experimentAssignments = Object.values(EXPERIMENTS).reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = posthog.getFeatureFlag(key);
        return acc;
      }, {});

      trackEvent("feature_flags_loaded", {
        flags,
        experiments: experimentAssignments,
      });
    });
  }, []);

  return null;
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString();
  const currentUrl = pathname ? (search ? `${pathname}?${search}` : pathname) : null;

  useEffect(() => {
    if (!currentUrl) return;

    posthog.capture("$pageview", {
      $current_url: currentUrl,
    });

    trackFunnelStep(FUNNELS.navigation, "pageview", {
      path: currentUrl,
    });
  }, [currentUrl]);

  return null;
}

export default function PostHogProvider({ children }: PostHogProviderProps) {
  return (
    <PostHogReactProvider client={posthog}>
      <PostHogIdentity />
      <PostHogFeatureFlags />
      <PostHogPageView />
      {children}
    </PostHogReactProvider>
  );
}
