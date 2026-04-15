// /workspace/familiehake/src/components/dashboard/WelcomeTileCard.tsx
"use client";

import { useState } from "react";

export type WelcomeTile = {
  title: string;
  body: string;
  titleColor: string;
  bodyColor: string;
  titleSize: number;
  bodySize: number;
};

type Props = {
  tile: WelcomeTile;
  isAdmin: boolean;
   
  onSave: (formData: FormData) => Promise<void>;
};

export default function WelcomeTileCard({ tile, isAdmin, onSave }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [titleColorHint, setTitleColorHint] = useState<string | null>(null);
  const [bodyColorHint, setBodyColorHint] = useState<string | null>(null);

  const isVeryLightColor = (input: string) => {
    const normalized = input.replace("#", "");
    const value =
      normalized.length === 3
        ? normalized
            .split("")
            .map((part) => part + part)
            .join("")
        : normalized;
    if (value.length !== 6) return false;
    const parsed = Number.parseInt(value, 16);
    if (Number.isNaN(parsed)) return false;
    const r = (parsed >> 16) & 255;
    const g = (parsed >> 8) & 255;
    const b = parsed & 255;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.85;
  };

  return (
    <div className="card relative overflow-hidden p-6 flex flex-col gap-4">
      {/* Hintergrund-Akzent */}
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full blur-3xl"
        style={{ background: "hsl(var(--accent) / 0.15)" }}
        aria-hidden
      />

      {/* Titel + Edit-Button */}
      <div className="flex items-start justify-between gap-3">
        <h2
          className="font-semibold leading-tight"
          style={{ color: tile.titleColor, fontSize: `${tile.titleSize}px` }}
        >
          {tile.title}
        </h2>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setIsEditing((v) => !v)}
            className="flex-shrink-0 rounded-lg px-3 py-1 text-[11px] font-semibold transition"
            style={{
              border: "1px solid hsl(var(--border))",
              color: "hsl(var(--muted-foreground))",
              background: "transparent",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "hsl(var(--secondary))";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            {isEditing ? "Schließen" : "Bearbeiten"}
          </button>
        )}
      </div>

      {/* Inhalt */}
      <p
        className="whitespace-pre-wrap leading-relaxed"
        style={{ color: tile.bodyColor, fontSize: `${tile.bodySize}px` }}
      >
        {tile.body}
      </p>

      {/* Edit-Formular */}
      {isAdmin && isEditing && (
        <form
          action={onSave}
          className="mt-1 grid gap-4 rounded-2xl p-4"
          style={{
            background: "hsl(var(--secondary))",
            border: "1px solid hsl(var(--border))",
          }}
        >
          {/* Titel */}
          <div className="grid gap-1.5">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Titel
            </label>
            <input
              name="title"
              defaultValue={tile.title}
              className="input-field"
            />
          </div>

          {/* Text */}
          <div className="grid gap-1.5">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Text
            </label>
            <textarea
              name="body"
              defaultValue={tile.body}
              rows={4}
              className="input-field resize-none"
            />
          </div>

          {/* Größen + Farben */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label
                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                Titel Schriftgröße (px)
              </label>
              <input
                name="titleSize"
                type="number"
                min={14}
                max={40}
                defaultValue={tile.titleSize}
                className="input-field"
              />
            </div>
            <div className="grid gap-1.5">
              <label
                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                Text Schriftgröße (px)
              </label>
              <input
                name="bodySize"
                type="number"
                min={12}
                max={24}
                defaultValue={tile.bodySize}
                className="input-field"
              />
            </div>
            <div className="grid gap-1.5">
              <label
                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                Titel Farbe
              </label>
              <input
                name="titleColor"
                type="color"
                defaultValue={tile.titleColor}
                className="h-10 w-full cursor-pointer rounded-lg"
                style={{ border: "1px solid hsl(var(--border))" }}
                onChange={(e) =>
                  setTitleColorHint(
                    isVeryLightColor(e.target.value)
                      ? "Sehr helle Farben werden aus Lesbarkeitsgründen automatisch korrigiert."
                      : null
                  )
                }
              />
              {titleColorHint && (
                <p className="text-xs text-amber-500">{titleColorHint}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <label
                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                Text Farbe
              </label>
              <input
                name="bodyColor"
                type="color"
                defaultValue={tile.bodyColor}
                className="h-10 w-full cursor-pointer rounded-lg"
                style={{ border: "1px solid hsl(var(--border))" }}
                onChange={(e) =>
                  setBodyColorHint(
                    isVeryLightColor(e.target.value)
                      ? "Sehr helle Farben werden aus Lesbarkeitsgründen automatisch korrigiert."
                      : null
                  )
                }
              />
              {bodyColorHint && (
                <p className="text-xs text-amber-500">{bodyColorHint}</p>
              )}
            </div>
          </div>

          {/* Aktionen */}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-xl px-4 py-2 text-xs font-semibold transition"
              style={{
                background: "hsl(var(--primary))",
                color: "hsl(var(--primary-foreground))",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.filter = "brightness(1.08)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.filter = "";
              }}
            >
              Speichern
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-xl px-4 py-2 text-xs font-semibold transition"
              style={{
                border: "1px solid hsl(var(--border))",
                color: "hsl(var(--muted-foreground))",
                background: "transparent",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "hsl(var(--card))";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
