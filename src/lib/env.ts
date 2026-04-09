// /workspace/familiehake/src/lib/env.ts
import { z } from "zod";

const baseSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  PRIMARY_SUPERADMIN_ID: z.string().min(1).optional(),
  // Optional
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  PREVIEW_USER: z.string().optional(),
  PREVIEW_PASS: z.string().optional(),
  SENTRY_API_TOKEN: z.string().optional(),
  SENTRY_ORG_SLUG: z.string().optional(),
  SENTRY_PROJECT_SLUG: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
});

const requiredInProduction = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRIMARY_SUPERADMIN_ID",
] as const;

type Env = z.infer<typeof baseSchema> &
  Partial<Record<(typeof requiredInProduction)[number], string>>;

let _env: Env | null = null;

export function isPreviewEnvironment() {
  return process.env.VERCEL_ENV === "preview";
}

export function isProductionEnvironment() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

export function env() {
  if (_env) return _env;
  const parsed = baseSchema.safeParse(process.env);
  if (!parsed.success) {
    // Schöne Fehlermeldung mit Liste fehlender Vars
    const issues = parsed.error.issues.map(i => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`❌ Environment variables invalid/missing:\n${issues}`);
  }
  const data = parsed.data as Record<string, string | undefined>;
  const isProduction = isProductionEnvironment();

  const missingRequired = requiredInProduction.filter((key) => !data[key]);
  if (isProduction && missingRequired.length > 0) {
    const issues = missingRequired
      .map((key) => `- ${key}: Missing in production environment`)
      .join("\n");
    throw new Error(`❌ Environment variables invalid/missing:\n${issues}`);
  }

  if (!isProduction && missingRequired.length > 0) {
    console.warn(
      `⚠️ Missing env vars in local/preview mode: ${missingRequired.join(", ")}. Features depending on them are disabled.`
    );
  }

  const hasPublishableKey = Boolean(data.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const hasSecretKey = Boolean(data.CLERK_SECRET_KEY);

  if (hasPublishableKey !== hasSecretKey) {
    throw new Error(
      "❌ Clerk-Konfiguration unvollständig: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY und CLERK_SECRET_KEY müssen entweder beide gesetzt oder beide leer sein."
    );
  }

  _env = data as Env;
  return _env;
}
