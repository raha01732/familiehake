import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Optional
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  PREVIEW_USER: z.string().optional(),
  PREVIEW_PASS: z.string().optional(),
  SENTRY_API_TOKEN: z.string().optional(),
  SENTRY_ORG_SLUG: z.string().optional(),
  SENTRY_PROJECT_SLUG: z.string().optional(),
});

type Env = z.infer<typeof schema>;

let _env: Env | null = null;

export function env() {
  if (_env) return _env;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Schöne Fehlermeldung mit Liste fehlender Vars
    const issues = parsed.error.issues.map(i => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`❌ Environment variables invalid/missing:\n${issues}`);
  }
  _env = parsed.data;
  return _env;
}
