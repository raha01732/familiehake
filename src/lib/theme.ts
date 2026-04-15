// /workspace/familiehake/src/lib/theme.ts
import * as Sentry from "@sentry/nextjs";
import { getCachedJson, setCachedJson } from "@/lib/redis";
import { createAdminClient } from "@/lib/supabase/admin";

export type ThemePreset = {
  id: string;
  label: string;
  description: string | null;
  cssVars: Record<string, string>;
};

const THEME_CACHE_TTL_SECONDS = 60 * 60 * 6;
const USER_THEME_CACHE_TTL_SECONDS = 60 * 60 * 12;
const DEFAULT_PRESET_ID = "light";
const THEME_PRESETS_CACHE_KEY = "theme:presets:v2";
const USER_THEME_CACHE_KEY_PREFIX = "theme:user:";

const FALLBACK_PRESETS: ThemePreset[] = [
  {
    id: "light",
    label: "Hell",
    description: "Klare, helle Oberflächen – ideal bei Tageslicht.",
    cssVars: {
      "--background": "0 0% 97%",
      "--foreground": "222 47% 11%",
      "--card": "0 0% 100%",
      "--card-foreground": "222 47% 11%",
      "--popover": "0 0% 100%",
      "--popover-foreground": "222 47% 11%",
      "--primary": "221 83% 53%",
      "--primary-foreground": "0 0% 100%",
      "--secondary": "220 14% 96%",
      "--secondary-foreground": "222 47% 11%",
      "--muted": "220 14% 96%",
      "--muted-foreground": "220 9% 46%",
      "--accent": "192 74% 37%",
      "--accent-foreground": "0 0% 100%",
      "--destructive": "0 84% 57%",
      "--destructive-foreground": "0 0% 100%",
      "--border": "220 13% 91%",
      "--input": "220 13% 91%",
      "--ring": "221 83% 53%",
      "--header-bg": "0 0% 100%",
      "--header-border": "220 13% 91%",
      "--chart-1": "221 83% 53%",
      "--chart-2": "192 74% 37%",
      "--chart-3": "262 83% 58%",
      "--chart-4": "27 96% 61%",
      "--chart-5": "142 71% 45%",
      "--accent-glow-1": "37 99 235",
      "--accent-glow-2": "8 145 178",
      "--accent-glow-3": "99 102 241",
      "--legacy-text-strong": "222 47% 11%",
      "--legacy-text-default": "222 33% 17%",
      "--legacy-text-muted": "215 20% 31%",
      "--legacy-text-soft": "215 16% 42%",
      "--legacy-panel-bg": "0 0% 97%",
      "--legacy-panel-bg-strong": "0 0% 100%",
      "--legacy-panel-border": "220 13% 88%",
    },
  },
  {
    id: "dark",
    label: "Dunkel",
    description: "Tiefes Nachtblau – augenschonend und modern.",
    cssVars: {
      "--background": "222 50% 8%",
      "--foreground": "210 40% 96%",
      "--card": "222 44% 12%",
      "--card-foreground": "210 40% 96%",
      "--popover": "222 44% 12%",
      "--popover-foreground": "210 40% 96%",
      "--primary": "217 91% 68%",
      "--primary-foreground": "222 47% 8%",
      "--secondary": "218 36% 18%",
      "--secondary-foreground": "210 40% 96%",
      "--muted": "218 36% 18%",
      "--muted-foreground": "218 14% 63%",
      "--accent": "188 83% 53%",
      "--accent-foreground": "222 47% 8%",
      "--destructive": "0 72% 57%",
      "--destructive-foreground": "210 40% 96%",
      "--border": "218 36% 20%",
      "--input": "218 36% 20%",
      "--ring": "217 91% 68%",
      "--header-bg": "222 44% 11%",
      "--header-border": "218 36% 20%",
      "--chart-1": "217 91% 68%",
      "--chart-2": "188 83% 53%",
      "--chart-3": "262 83% 66%",
      "--chart-4": "27 96% 68%",
      "--chart-5": "142 71% 51%",
      "--accent-glow-1": "37 99 235",
      "--accent-glow-2": "20 184 166",
      "--accent-glow-3": "99 102 241",
      "--legacy-text-strong": "210 40% 96%",
      "--legacy-text-default": "210 30% 85%",
      "--legacy-text-muted": "214 20% 70%",
      "--legacy-text-soft": "214 16% 58%",
      "--legacy-panel-bg": "222 50% 8%",
      "--legacy-panel-bg-strong": "222 44% 12%",
      "--legacy-panel-border": "218 36% 20%",
    },
  },
  {
    id: "mid",
    label: "Mittelweg",
    description: "Weiches Schiefergrau – ausgewogen zwischen hell und dunkel.",
    cssVars: {
      "--background": "220 26% 14%",
      "--foreground": "210 40% 95%",
      "--card": "220 28% 17%",
      "--card-foreground": "210 40% 95%",
      "--popover": "220 28% 17%",
      "--popover-foreground": "210 40% 95%",
      "--primary": "191 95% 48%",
      "--primary-foreground": "220 26% 10%",
      "--secondary": "220 22% 22%",
      "--secondary-foreground": "210 40% 95%",
      "--muted": "220 22% 20%",
      "--muted-foreground": "214 16% 64%",
      "--accent": "199 85% 45%",
      "--accent-foreground": "220 26% 10%",
      "--destructive": "0 72% 55%",
      "--destructive-foreground": "210 40% 98%",
      "--border": "220 18% 26%",
      "--input": "220 18% 26%",
      "--ring": "191 95% 48%",
      "--header-bg": "220 28% 16%",
      "--header-border": "220 18% 26%",
      "--chart-1": "191 95% 48%",
      "--chart-2": "170 72% 44%",
      "--chart-3": "262 83% 66%",
      "--chart-4": "27 96% 61%",
      "--chart-5": "142 71% 48%",
      "--accent-glow-1": "14 165 233",
      "--accent-glow-2": "56 189 248",
      "--accent-glow-3": "99 102 241",
      "--legacy-text-strong": "210 40% 95%",
      "--legacy-text-default": "210 30% 83%",
      "--legacy-text-muted": "214 20% 68%",
      "--legacy-text-soft": "214 16% 56%",
      "--legacy-panel-bg": "220 26% 14%",
      "--legacy-panel-bg-strong": "220 28% 17%",
      "--legacy-panel-border": "220 18% 26%",
    },
  },
];

const FALLBACK_PRESET_BY_ID = new Map(FALLBACK_PRESETS.map((preset) => [preset.id, preset]));

function coercePreset(raw: any): ThemePreset | null {
  if (!raw?.id || !raw?.label || !raw?.css_vars) return null;
  const cssVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw.css_vars as Record<string, unknown>)) {
    if (typeof value === "string") {
      cssVars[key] = value;
    }
  }
  if (Object.keys(cssVars).length === 0) return null;
  return {
    id: String(raw.id),
    label: String(raw.label),
    description: raw.description ? String(raw.description) : null,
    cssVars,
  };
}

function findFallbackPreset(id?: string | null) {
  const resolvedId = id ?? DEFAULT_PRESET_ID;
  return (
    FALLBACK_PRESET_BY_ID.get(resolvedId) ??
    FALLBACK_PRESET_BY_ID.get(DEFAULT_PRESET_ID) ??
    FALLBACK_PRESETS[0]
  );
}

function buildPresetLookup(presets: ThemePreset[]) {
  return new Map(presets.map((preset) => [preset.id, preset]));
}

export async function getThemePresets(): Promise<ThemePreset[]> {
  const cached = await getCachedJson<ThemePreset[]>(THEME_PRESETS_CACHE_KEY);
  if (cached?.length) return cached;

  try {
    const sb = createAdminClient();
    const { data, error } = await sb.from("theme_presets").select("id,label,description,css_vars").order("id");
    if (error) {
      Sentry.captureException(error);
      return FALLBACK_PRESETS;
    }
    const presets = (data ?? []).map(coercePreset).filter(Boolean) as ThemePreset[];
    const resolvedPresets = presets.length ? presets : FALLBACK_PRESETS;
    await setCachedJson(THEME_PRESETS_CACHE_KEY, resolvedPresets, THEME_CACHE_TTL_SECONDS);
    return resolvedPresets;
  } catch (error) {
    Sentry.captureException(error);
    return FALLBACK_PRESETS;
  }
}

export async function getActiveTheme(userId?: string | null): Promise<ThemePreset> {
  if (!userId) return findFallbackPreset(DEFAULT_PRESET_ID);

  const userThemeCacheKey = `${USER_THEME_CACHE_KEY_PREFIX}${userId}`;
  const cached = await getCachedJson<ThemePreset>(userThemeCacheKey);
  if (cached) return cached;

  try {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("user_theme_preferences")
      .select("preset_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      Sentry.captureException(error);
      return findFallbackPreset(DEFAULT_PRESET_ID);
    }

    const presets = await getThemePresets();
    const presetById = buildPresetLookup(presets);
    const resolvedPreset =
      (data?.preset_id ? presetById.get(data.preset_id) : null) ??
      findFallbackPreset(data?.preset_id ?? DEFAULT_PRESET_ID);
    await setCachedJson(userThemeCacheKey, resolvedPreset, USER_THEME_CACHE_TTL_SECONDS);
    return resolvedPreset;
  } catch (error) {
    Sentry.captureException(error);
    return findFallbackPreset(DEFAULT_PRESET_ID);
  }
}

export function getThemeCssVars(preset: ThemePreset) {
  return preset.cssVars;
}

export function getThemeValue(preset: ThemePreset, key: string, fallback: string) {
  return preset.cssVars[key] ?? fallback;
}

export function getThemePresetById(presetId?: string | null) {
  if (!presetId) return null;
  return FALLBACK_PRESETS.find((preset) => preset.id === presetId) ?? null;
}
