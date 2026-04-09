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
  // eslint-disable-next-line no-unused-vars
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
      <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-cyan-100/80 blur-2xl" />
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold leading-tight text-slate-900" style={{ color: tile.titleColor, fontSize: `${tile.titleSize}px` }}>
          {tile.title}
        </h2>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setIsEditing((current) => !current)}
            className="rounded-lg border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {isEditing ? "Schließen" : "Bearbeiten"}
          </button>
        ) : null}
      </div>
      <p className="whitespace-pre-wrap leading-relaxed text-slate-700" style={{ color: tile.bodyColor, fontSize: `${tile.bodySize}px` }}>
        {tile.body}
      </p>

      {isAdmin && isEditing ? (
        <form action={onSave} className="mt-2 grid gap-4 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="grid gap-2">
            <label className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Titel</label>
            <input
              name="title"
              defaultValue={tile.title}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Text</label>
            <textarea
              name="body"
              defaultValue={tile.body}
              rows={4}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Titel Schriftgröße (px)</label>
              <input
                name="titleSize"
                type="number"
                min={14}
                max={40}
                defaultValue={tile.titleSize}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Text Schriftgröße (px)</label>
              <input
                name="bodySize"
                type="number"
                min={12}
                max={24}
                defaultValue={tile.bodySize}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Titel Farbe</label>
              <input
                name="titleColor"
                type="color"
                defaultValue={tile.titleColor}
                className="h-10 w-full rounded-md border border-slate-300 bg-white"
                onChange={(event) =>
                  setTitleColorHint(
                    isVeryLightColor(event.target.value)
                      ? "Sehr helle Farben werden aus Lesbarkeitsgründen automatisch auf eine dunklere Variante gesetzt."
                      : null
                  )
                }
              />
              {titleColorHint ? <p className="text-xs text-amber-700">{titleColorHint}</p> : null}
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Text Farbe</label>
              <input
                name="bodyColor"
                type="color"
                defaultValue={tile.bodyColor}
                className="h-10 w-full rounded-md border border-slate-300 bg-white"
                onChange={(event) =>
                  setBodyColorHint(
                    isVeryLightColor(event.target.value)
                      ? "Sehr helle Farben werden aus Lesbarkeitsgründen automatisch auf eine dunklere Variante gesetzt."
                      : null
                  )
                }
              />
              {bodyColorHint ? <p className="text-xs text-amber-700">{bodyColorHint}</p> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              Speichern
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Abbrechen
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
