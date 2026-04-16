"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Employee } from "../utils";
import { EMPLOYMENT_TYPES, getInitials } from "../utils";
import EmployeeModal from "../components/EmployeeModal";
import { Users, UserPlus, Pencil } from "lucide-react";

type Props = {
  initialEmployees: Employee[];
  isAdmin: boolean;
  createAction: (_fd: FormData) => Promise<void>;
  updateAction: (_fd: FormData) => Promise<void>;
  deleteAction: (_fd: FormData) => Promise<void>;
};

export default function MitarbeiterClient({
  initialEmployees,
  isAdmin,
  createAction,
  updateAction,
  deleteAction,
}: Props) {
  const router = useRouter();
  const [modalEmployee, setModalEmployee] = useState<Employee | null | undefined>(undefined);

  async function handleCreate(fd: FormData) { await createAction(fd); router.refresh(); }
  async function handleUpdate(fd: FormData) { await updateAction(fd); router.refresh(); }
  async function handleDelete(fd: FormData) { await deleteAction(fd); router.refresh(); }

  const active = initialEmployees.filter((e) => e.is_active);
  const inactive = initialEmployees.filter((e) => !e.is_active);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-8 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div
            className="shimmer-badge inline-flex w-fit items-center gap-2 rounded-full px-3 py-1"
            style={{ border: "1px solid hsl(var(--primary) / 0.3)" }}
          >
            <Users size={11} style={{ color: "hsl(var(--primary))" }} aria-hidden />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: "hsl(var(--primary))" }}
            >
              Team
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              <span className="gradient-text">Mitarbeiter</span>
            </h1>
            <p className="mt-1 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              {active.length} aktiv{inactive.length > 0 ? `, ${inactive.length} inaktiv` : ""}
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setModalEmployee(null)}
            className="brand-button inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            <UserPlus size={15} aria-hidden />
            Neuer Mitarbeiter
          </button>
        )}
      </div>

      {/* Empty state */}
      {initialEmployees.length === 0 ? (
        <div
          className="feature-card flex flex-col items-center gap-4 py-16 text-center"
        >
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}
          >
            <Users size={28} strokeWidth={1.5} aria-hidden />
          </div>
          <div>
            <p className="font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Noch keine Mitarbeiter
            </p>
            <p className="text-sm mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
              Füge deinen ersten Mitarbeiter hinzu.
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setModalEmployee(null)}
              className="brand-button inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
            >
              <UserPlus size={15} aria-hidden />
              Jetzt anlegen
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <EmployeeSection title="Aktive Mitarbeiter" employees={active} onEdit={setModalEmployee} />
          {inactive.length > 0 && (
            <EmployeeSection title="Inaktive Mitarbeiter" employees={inactive} onEdit={setModalEmployee} muted />
          )}
        </div>
      )}

      {modalEmployee !== undefined && (
        <EmployeeModal
          employee={modalEmployee}
          onClose={() => setModalEmployee(undefined)}
          createAction={handleCreate}
          updateAction={handleUpdate}
          deleteAction={handleDelete}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

function EmployeeSection({
  title, employees, onEdit, muted = false,
}: {
  title: string;
  employees: Employee[];
  onEdit: (_emp: Employee) => void;
  muted?: boolean;
}) {
  if (employees.length === 0) return null;
  return (
    <div>
      <p
        className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em]"
        style={{ color: muted ? "hsl(var(--muted-foreground) / 0.6)" : "hsl(var(--muted-foreground))" }}
      >
        {title} ({employees.length})
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {employees.map((emp) => (
          <EmployeeCard key={emp.id} employee={emp} onEdit={onEdit} muted={muted} />
        ))}
      </div>
    </div>
  );
}

function EmployeeCard({ employee: emp, onEdit, muted }: {
  employee: Employee; onEdit: (emp: Employee) => void; muted: boolean;
}) {
  const empType = EMPLOYMENT_TYPES.find((t) => t.value === emp.employment_type)?.label ?? emp.employment_type;
  return (
    <div
      className="feature-card group relative cursor-pointer overflow-hidden transition-all"
      style={{ opacity: muted ? 0.6 : 1 }}
      onClick={() => onEdit(emp)}
    >
      {/* Colored top bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-[calc(var(--radius)+0.25rem)]"
           style={{ backgroundColor: emp.color }} />

      <div className="p-4 pt-5">
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm"
            style={{ backgroundColor: emp.color }}
          >
            {getInitials(emp.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="font-semibold truncate text-sm"
              style={{ color: "hsl(var(--foreground))" }}
            >
              {emp.name}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {emp.position && (
                <span className="text-xs truncate" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {emp.position}
                </span>
              )}
              {emp.department && emp.position && (
                <span style={{ color: "hsl(var(--border))" }} className="text-xs">·</span>
              )}
              {emp.department && (
                <span className="text-xs truncate" style={{ color: "hsl(var(--muted-foreground) / 0.7)" }}>
                  {emp.department}
                </span>
              )}
            </div>
          </div>
          <Pencil
            size={13}
            className="flex-shrink-0 mt-0.5 transition-colors opacity-0 group-hover:opacity-100"
            style={{ color: "hsl(var(--muted-foreground))" }}
            aria-hidden
          />
        </div>

        <div
          className="mt-3 flex items-center justify-between pt-3"
          style={{ borderTop: "1px solid hsl(var(--border) / 0.6)" }}
        >
          <div className="flex items-center gap-3 text-xs">
            {emp.monthly_hours > 0 && (
              <span>
                <span className="font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                  {emp.monthly_hours}h
                </span>
                <span style={{ color: "hsl(var(--muted-foreground))" }}>/Mo</span>
              </span>
            )}
            {emp.weekly_hours > 0 && (
              <span>
                <span className="font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                  {emp.weekly_hours}h
                </span>
                <span style={{ color: "hsl(var(--muted-foreground))" }}>/Wo</span>
              </span>
            )}
          </div>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              background: "hsl(var(--primary) / 0.08)",
              color: "hsl(var(--primary))",
              border: "1px solid hsl(var(--primary) / 0.15)",
            }}
          >
            {empType}
          </span>
        </div>
      </div>
    </div>
  );
}
