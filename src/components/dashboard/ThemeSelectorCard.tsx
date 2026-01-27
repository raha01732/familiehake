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
    <form action={updateThemePreference} className="card flex flex-col gap-4 p-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Farbschema wählen</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Wähle zwischen hellem, dunklem oder ausgewogenem Design. Das Layout bleibt gleich – nur die
          Farben passen sich an.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {presets.map((preset) => {
          const isActive = preset.id === activePresetId;
          const background = preset.cssVars["--background"] ?? "210 40% 98%";
          const foreground = preset.cssVars["--foreground"] ?? "222 47% 12%";
          const primary = preset.cssVars["--primary"] ?? "199 89% 48%";
          const accent = preset.cssVars["--accent"] ?? "189 90% 40%";
          return (
            <label
              key={preset.id}
              className={`group flex cursor-pointer flex-col gap-3 rounded-2xl border p-4 transition ${
                isActive
                  ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.12)]"
                  : "border-white/10 bg-[hsl(var(--background)/0.4)] hover:border-white/30"
              }`}
            >
              <input
                type="radio"
                name="presetId"
                value={preset.id}
                defaultChecked={isActive}
                className="sr-only"
              />
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{preset.label}</span>
                {isActive ? (
                  <span className="rounded-full border border-[hsl(var(--primary)/0.4)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[hsl(var(--primary))]">
                    Aktiv
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {[background, foreground, primary, accent].map((color, index) => (
                  <span
                    key={`${preset.id}-${index}`}
                    className="h-5 w-5 rounded-full border border-white/20"
                    style={{ backgroundColor: `hsl(${color})` }}
                    aria-hidden
                  />
                ))}
              </div>
              {preset.description ? (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{preset.description}</p>
              ) : null}
            </label>
          );
        })}
      </div>

      <div>
        <button type="submit" className="brand-button rounded-xl px-4 py-2 text-sm font-semibold shadow-lg shadow-black/20">
          Auswahl speichern
        </button>
      </div>
    </form>
  );
}
