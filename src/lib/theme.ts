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
const DEFAULT_PRESET_ID = "dark";
export const THEME_PRESET_COOKIE = "themePreset";

const FALLBACK_PRESETS: ThemePreset[] = [
  {
    id: "dark",
    label: "Dunkel",
    description: "Aktuelles dunkles UI mit kräftigen Akzenten.",
    cssVars: {
      "--background": "222 47% 10%",
      "--foreground": "210 40% 96%",
      "--card": "222 47% 12%",
      "--card-foreground": "210 40% 96%",
      "--popover": "222 47% 12%",
      "--popover-foreground": "210 40% 96%",
      "--primary": "189 94% 43%",
      "--primary-foreground": "210 40% 8%",
      "--secondary": "215 26% 22%",
      "--secondary-foreground": "210 40% 96%",
      "--muted": "218 30% 18%",
      "--muted-foreground": "214 20% 70%",
      "--accent": "199 89% 38%",
      "--accent-foreground": "210 40% 8%",
      "--destructive": "0 84% 63%",
      "--destructive-foreground": "210 40% 98%",
      "--border": "215 25% 25%",
      "--input": "215 25% 25%",
      "--ring": "199 89% 38%",
      "--chart-1": "199 89% 48%",
      "--chart-2": "170 72% 44%",
      "--chart-3": "31 89% 61%",
      "--chart-4": "145 63% 53%",
      "--chart-5": "25 86% 55%",
      "--accent-glow-1": "14 165 233",
      "--accent-glow-2": "56 189 248",
      "--accent-glow-3": "34 211 238",
    },
  },
  {
    id: "light",
    label: "Hell",
    description: "Helles Layout mit klaren Oberflächen und weichen Akzenten.",
    cssVars: {
      "--background": "210 50% 98%",
      "--foreground": "222 40% 10%",
      "--card": "0 0% 100%",
      "--card-foreground": "222 40% 12%",
      "--popover": "210 40% 99%",
      "--popover-foreground": "222 40% 12%",
      "--primary": "196 88% 38%",
      "--primary-foreground": "210 40% 8%",
      "--secondary": "210 24% 90%",
      "--secondary-foreground": "222 40% 12%",
      "--muted": "210 24% 92%",
      "--muted-foreground": "215 20% 32%",
      "--accent": "186 88% 40%",
      "--accent-foreground": "210 40% 10%",
      "--destructive": "0 72% 50%",
      "--destructive-foreground": "0 0% 98%",
      "--border": "214 20% 80%",
      "--input": "214 20% 86%",
      "--ring": "196 88% 38%",
      "--chart-1": "199 89% 48%",
      "--chart-2": "170 72% 44%",
      "--chart-3": "31 89% 61%",
      "--chart-4": "145 63% 53%",
      "--chart-5": "25 86% 55%",
      "--accent-glow-1": "14 165 233",
      "--accent-glow-2": "37 99 235",
      "--accent-glow-3": "99 102 241",
    },
  },
  {
    id: "mid",
    label: "Mittelweg",
    description: "Zwischen hell und dunkel, mit ausgewogenen Kontrasten.",
    cssVars: {
      "--background": "220 28% 16%",
      "--foreground": "210 40% 96%",
      "--card": "220 30% 18%",
      "--card-foreground": "210 40% 96%",
      "--popover": "220 30% 18%",
      "--popover-foreground": "210 40% 96%",
      "--primary": "191 95% 45%",
      "--primary-foreground": "210 40% 8%",
      "--secondary": "220 22% 24%",
      "--secondary-foreground": "210 40% 96%",
      "--muted": "220 22% 22%",
      "--muted-foreground": "214 20% 70%",
      "--accent": "199 85% 42%",
      "--accent-foreground": "210 40% 8%",
      "--destructive": "0 72% 55%",
      "--destructive-foreground": "210 40% 98%",
      "--border": "220 18% 30%",
      "--input": "220 18% 30%",
      "--ring": "199 85% 42%",
      "--chart-1": "199 89% 48%",
      "--chart-2": "170 72% 44%",
      "--chart-3": "31 89% 61%",
      "--chart-4": "145 63% 53%",
      "--chart-5": "25 86% 55%",
      "--accent-glow-1": "14 165 233",
      "--accent-glow-2": "56 189 248",
      "--accent-glow-3": "99 102 241",
    },
  },
];

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
  return FALLBACK_PRESETS.find((preset) => preset.id === id) ?? FALLBACK_PRESETS[0];
}

export async function getThemePresets(): Promise<ThemePreset[]> {
  const cached = await getCachedJson<ThemePreset[]>("theme:presets:v1");
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
    await setCachedJson("theme:presets:v1", resolvedPresets, THEME_CACHE_TTL_SECONDS);
    return resolvedPresets;
  } catch (error) {
    Sentry.captureException(error);
    return FALLBACK_PRESETS;
  }
}

export async function getActiveTheme(userId?: string | null): Promise<ThemePreset> {
  if (!userId) return findFallbackPreset(DEFAULT_PRESET_ID);

  const cached = await getCachedJson<ThemePreset>(`theme:user:${userId}`);
  if (cached) return cached;

  try {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("user_theme_preferences")
      .select("preset_id, theme_presets ( id,label,description,css_vars )")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      Sentry.captureException(error);
      return findFallbackPreset(DEFAULT_PRESET_ID);
    }

    const preset = data?.theme_presets ? coercePreset(data.theme_presets) : null;
    const resolvedPreset = preset ?? findFallbackPreset(data?.preset_id ?? DEFAULT_PRESET_ID);
    await setCachedJson(`theme:user:${userId}`, resolvedPreset, USER_THEME_CACHE_TTL_SECONDS);
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
