// /workspace/familiehake/src/components/dashboard/ThemeSelectorCard.tsx
import { currentUser } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { getThemePresets, ThemePreset } from "@/lib/theme";
import { setCachedJson } from "@/lib/redis";
import { createAdminClient } from "@/lib/supabase/admin";

type ThemeSelectorCardProps = {
  presets: ThemePreset[];
  activePresetId: string;
};

async function updateThemePreference(formData: FormData) {
  "use server";

  const user = await currentUser();
  if (!user) return;

  const presetId = String(formData.get("presetId") ?? "").trim();
  if (!presetId) return;

  try {
    const presets = await getThemePresets();
    const selectedPreset = presets.find((preset) => preset.id === presetId);
    if (!selectedPreset) return;

    const sb = createAdminClient();
    const { error } = await sb.from("user_theme_preferences").upsert(
      {
        user_id: user.id,
        preset_id: presetId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      Sentry.captureException(error);
      return;
    }

    await setCachedJson(`theme:user:${user.id}`, selectedPreset, 60 * 60 * 12);

    await logAudit({
      action: "theme_preference_update",
      actorUserId: user.id,
      actorEmail: user.emailAddresses?.[0]?.emailAddress ?? null,
      target: `theme:${presetId}`,
      detail: { presetId },
    });

    revalidatePath("/");
    revalidatePath("/dashboard");
  } catch (error) {
    Sentry.captureException(error);
  }
}

export default function ThemeSelectorCard({ presets, activePresetId }: ThemeSelectorCardProps) {
  return (
    <form action={updateThemePreference} className="card flex flex-col gap-5 p-6">
      <header className="space-y-1">
        <h2
          className="text-lg font-semibold"
          style={{ color: "hsl(var(--foreground))" }}
        >
          Farbschema wählen
        </h2>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          Wähle zwischen hellem, dunklem oder ausgewogenem Design. Wird sofort auf alle Seiten angewendet.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {presets.map((preset) => {
          const isActive = preset.id === activePresetId;
          const bg = preset.cssVars["--background"] ?? "210 40% 98%";
          const fg = preset.cssVars["--foreground"] ?? "222 47% 12%";
          const primary = preset.cssVars["--primary"] ?? "221 83% 53%";
          const accent = preset.cssVars["--accent"] ?? "192 74% 37%";
          const card = preset.cssVars["--card"] ?? bg;

          return (
            <label
              key={preset.id}
              className="group flex cursor-pointer flex-col gap-3 rounded-2xl p-4 transition-all"
              style={{
                border: isActive
                  ? "2px solid hsl(var(--primary))"
                  : "1px solid hsl(var(--border))",
                background: isActive
                  ? "hsl(var(--primary) / 0.08)"
                  : "hsl(var(--secondary))",
              }}
            >
              <input
                type="radio"
                name="presetId"
                value={preset.id}
                defaultChecked={isActive}
                className="sr-only"
              />

              {/* Farbvorschau */}
              <div
                className="flex items-center gap-2 rounded-xl p-3"
                style={{ background: `hsl(${bg})` }}
                aria-hidden
              >
                {[card, primary, accent, fg].map((color, i) => (
                  <span
                    key={`${preset.id}-${i}`}
                    className="h-5 w-5 rounded-full ring-1 ring-black/10"
                    style={{ background: `hsl(${color})` }}
                  />
                ))}
              </div>

              {/* Label */}
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-sm font-semibold"
                  style={{ color: "hsl(var(--foreground))" }}
                >
                  {preset.label}
                </span>
                {isActive && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                    style={{
                      background: "hsl(var(--primary) / 0.15)",
                      color: "hsl(var(--primary))",
                    }}
                  >
                    Aktiv
                  </span>
                )}
              </div>

              {preset.description && (
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  {preset.description}
                </p>
              )}
            </label>
          );
        })}
      </div>

      <div>
        <button
          type="submit"
          className="brand-button rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Auswahl speichern
        </button>
      </div>
    </form>
  );
}
