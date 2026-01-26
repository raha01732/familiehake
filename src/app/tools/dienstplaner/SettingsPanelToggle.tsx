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

type WeekdayRequirement = {
  weekday: number;
  required_shifts: number;
};

type SettingsPanelToggleProps = {
  employees: DienstplanEmployee[];
  pauseRules: PauseRule[];
  weekdayRequirements: WeekdayRequirement[];
  isAdmin: boolean;
};

export default function SettingsPanelToggle({
  employees,
  pauseRules,
  weekdayRequirements,
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
      {isOpen && (
        <div id={panelId}>
          <SettingsPanel
            employees={employees}
            pauseRules={pauseRules}
            weekdayRequirements={weekdayRequirements}
            isAdmin={isAdmin}
          />
        </div>
      )}
    </div>
  );
}
