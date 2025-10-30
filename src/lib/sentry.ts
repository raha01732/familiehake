import * as Sentry from "@sentry/nextjs";

type Ctx = Record<string, unknown>;

export function reportError(err: unknown, context?: Ctx) {
  // Context als Scope setzen (User, Clerk, Route, Payload etc.)
  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([k, v]) => scope.setContext(k, { value: v as any }));
    }
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
  });
}
