# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**FamilieHake** — a private family/team planner built with Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS, and Shadcn/ui. Hosted on Vercel. Primary features include a scheduling/duty-planner (Dienstplaner), dashboard tiles, share links, and role-based access control.

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # ESLint (flat config, no type-aware rules)
npm run typecheck    # tsc --noEmit
npm run test         # Node.js native test runner with TypeScript loader
npm run ci:build     # lint + typecheck + build (full CI pipeline)
npm run deadcode     # ts-prune dead code detection
npm run depcheck     # Check for unused/missing dependencies
```

Run a single test file:
```bash
node --import ./tests/ts-loader.mjs --test tests/<file>.test.ts
```

## Architecture

### Routing & Pages (`src/app/`)
Next.js App Router. Server Components by default; `"use client"` for interactive components. Key routes:
- `/dashboard` — main app surface with configurable tiles
- `/admin` — user management, invites, settings (admin-only)
- `/s/[token]` — public share preview pages
- `/monitoring` — cron job and system health dashboard
- `/api/cron/*` — Vercel cron job handlers (audit rollup, cache warmup, force-logout, heartbeat)
- `/api/shares`, `/api/upload` — REST endpoints

### Auth & RBAC (`src/lib/`)
Three-layer auth stack:
1. **Clerk** (`auth.ts`) — handles authentication; optional (can be disabled for local dev via `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`)
2. **Supabase roles** — `user_roles` and `access_rules` tables store RBAC data; loaded and cached per-request via React `cache()`
3. **Permissions** (`rbac.ts`, `access-map.ts`, `clerk-role.ts`) — computed from Supabase rules; `PRIMARY_SUPERADMIN_ID` env var grants unconditional superadmin

Auth state is resolved in `src/lib/auth.ts` and accessed via `getAuth()` (cached per request).

### Database (`src/lib/supabase/`)
PostgreSQL via Supabase. Three client types:
- `createAdminClient()` — service role, for server-side mutations and cron jobs
- `createServerClient()` — for Server Components (uses cookies)
- `createBrowserClient()` — for Client Components

Schema lives in `db/schema.sql`. Key tables: `roles`, `user_roles`, `access_rules`, `cron_job_runs`, `cron_job_daily_claims`, `dashboard_tiles`, `theme_presets`.

### Infrastructure
- **Redis** (`src/lib/redis.ts`) — Upstash Redis for rate limiting and caching
- **Cron jobs** — secured with Bearer token; per-run logging in `cron_job_runs`; daily claim deduplication in `cron_job_daily_claims` to prevent parallel runs
- **Sentry** — error tracking + cron monitors; config in `sentry.*.config.ts`
- **PostHog** — analytics; proxied through `/api/ingest` rewrites in `next.config.mjs`

### Middleware (`src/middleware.ts`)
Runs on every request. Handles: preview-environment basic auth, IP blocklist, CSP headers, locale cookie, Clerk auth (optional). Public routes: `/`, `/sign-in`, `/sign-up`, `/api/health`, `/api/keepalive`, `/api/sentry-tunnel`.

### UI System
Shadcn/ui (New York style) + Tailwind with CSS variable theming. Dark mode via `.dark` class. Theme presets stored in database (`theme_presets`, `user_theme_preferences`). Import path alias: `@/*` maps to `src/*`.

### Environment Validation
All environment variables are validated at startup via Zod in `src/lib/env.ts`. Add new env vars there before using them.

### Testing
Node.js native test runner (`--test` flag). TypeScript executed via custom ESM loader at `tests/ts-loader.mjs`. Tests live in `tests/`. No external test framework — uses Node's built-in `assert`.
