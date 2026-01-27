// src/app/tools/dienstplaner/SettingsPanelToggle.tsx
"use client";

import { useId, useState } from "react";
import SettingsPanel from "./SettingsPanel";

type DienstplanEmployee = {
  id: number;
  name: string;
  position: string | null;
  monthly_hours: number;
  user_id: string | null;
};

type PauseRule = {
  id: number;
  min_minutes: number;
  pause_minutes: number;
};

type ShiftTrack = {
  track_key: string;
  label: string;
  start_time: string;
  end_time: string;
};

type WeekdayRequirement = {
  weekday: number;
  required_shifts: number;
};

type WeekdayPositionRequirement = {
  id: number;
  weekday: number;
  track_key: string;
  position: string;
  note: string | null;
};

type SettingsPanelToggleProps = {
  employees: DienstplanEmployee[];
  pauseRules: PauseRule[];
  weekdayRequirements: WeekdayRequirement[];
  shiftTracks: ShiftTrack[];
  weekdayPositionRequirements: WeekdayPositionRequirement[];
  isAdmin: boolean;
};

export default function SettingsPanelToggle({
  employees,
  pauseRules,
  weekdayRequirements,
  shiftTracks,
  weekdayPositionRequirements,
  isAdmin,
}: SettingsPanelToggleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-zinc-400">Einstellungen für Regeln & Stammdaten</div>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((current) => !current)}
          className="border border-zinc-700 rounded px-3 py-1 text-sm text-zinc-200 hover:border-zinc-500"
        >
          {isOpen ? "Einstellungen schließen" : "Einstellungen öffnen"}
        </button>
      </div>
      {isOpen ? (
        <div className="fixed inset-0 z-[100]" id={panelId}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative mx-auto mt-16 w-[min(96vw,1120px)] max-w-5xl card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="text-sm font-semibold text-zinc-100">Einstellungen bearbeiten</div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-xs rounded-lg border border-zinc-700 text-zinc-300 px-2 py-1 hover:bg-zinc-800/60"
              >
                Schließen
              </button>
            </div>
            <div className="p-5">
              <SettingsPanel
                employees={employees}
                pauseRules={pauseRules}
                weekdayRequirements={weekdayRequirements}
                shiftTracks={shiftTracks}
                weekdayPositionRequirements={weekdayPositionRequirements}
                isAdmin={isAdmin}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
