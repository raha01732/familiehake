// src/components/dashboard/WelcomeTileCard.tsx
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

  return (
    <div className="card p-6 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h2
          className="font-semibold text-zinc-100"
          style={{ color: tile.titleColor, fontSize: `${tile.titleSize}px` }}
        >
          {tile.title}
        </h2>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setIsEditing((current) => !current)}
            className="rounded-md border border-zinc-700 px-3 py-1 text-[11px] text-zinc-200 hover:bg-zinc-900"
          >
            {isEditing ? "Schließen" : "Bearbeiten"}
          </button>
        ) : null}
      </div>
      <p
        className="text-zinc-400 leading-relaxed whitespace-pre-wrap"
        style={{ color: tile.bodyColor, fontSize: `${tile.bodySize}px` }}
      >
        {tile.body}
      </p>

      {isAdmin && isEditing ? (
        <form action={onSave} className="mt-2 grid gap-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="grid gap-2">
            <label className="text-xs uppercase tracking-wide text-zinc-500">Titel</label>
            <input
              name="title"
              defaultValue={tile.title}
              className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs uppercase tracking-wide text-zinc-500">Text</label>
            <textarea
              name="body"
              defaultValue={tile.body}
              rows={4}
              className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-xs uppercase tracking-wide text-zinc-500">Titel Schriftgröße (px)</label>
              <input
                name="titleSize"
                type="number"
                min={14}
                max={40}
                defaultValue={tile.titleSize}
                className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs uppercase tracking-wide text-zinc-500">Text Schriftgröße (px)</label>
              <input
                name="bodySize"
                type="number"
                min={12}
                max={24}
                defaultValue={tile.bodySize}
                className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs uppercase tracking-wide text-zinc-500">Titel Farbe</label>
              <input
                name="titleColor"
                type="color"
                defaultValue={tile.titleColor}
                className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-950"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs uppercase tracking-wide text-zinc-500">Text Farbe</label>
              <input
                name="bodyColor"
                type="color"
                defaultValue={tile.bodyColor}
                className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-950"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-md border border-emerald-600 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-900/20"
            >
              Speichern
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900"
            >
              Abbrechen
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
