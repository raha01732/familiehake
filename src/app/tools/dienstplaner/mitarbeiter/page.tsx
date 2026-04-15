"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { Employee } from "../utils";
import { EMPLOYMENT_TYPES, getInitials } from "../utils";
import EmployeeModal from "../components/EmployeeModal";
import {
  createEmployeeAction,
  updateEmployeeAction,
  deleteEmployeeAction,
} from "../actions";

export default function MitarbeiterPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalEmployee, setModalEmployee] = useState<Employee | null | undefined>(undefined);
  // undefined = closed, null = new employee, Employee = edit

  function loadEmployees() {
    setLoading(true);
    const sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    sb.from("dienstplan_employees")
      .select("id, name, position, department, monthly_hours, weekly_hours, color, is_active, employment_type, sort_order")
      .order("sort_order")
      .order("id")
      .then(({ data }) => {
        setEmployees((data ?? []) as Employee[]);
        setLoading(false);
      });
  }

  useEffect(() => {
    loadEmployees();
  }, []);

  async function handleCreate(fd: FormData) {
    await createEmployeeAction(fd);
    loadEmployees();
  }

  async function handleUpdate(fd: FormData) {
    await updateEmployeeAction(fd);
    loadEmployees();
  }

  async function handleDelete(fd: FormData) {
    await deleteEmployeeAction(fd);
    loadEmployees();
  }

  const active = employees.filter((e) => e.is_active);
  const inactive = employees.filter((e) => !e.is_active);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Mitarbeiter</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {active.length} aktiv{inactive.length > 0 ? `, ${inactive.length} inaktiv` : ""}
          </p>
        </div>
        <button
          onClick={() => setModalEmployee(null)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Neuer Mitarbeiter
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-zinc-500 text-sm">
          Lade Mitarbeiter …
        </div>
      ) : employees.length === 0 ? (
        <div className="text-center py-24">
          <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-zinc-400 font-medium">Noch keine Mitarbeiter</p>
          <p className="text-zinc-600 text-sm mt-1">Füge deinen ersten Mitarbeiter hinzu.</p>
          <button
            onClick={() => setModalEmployee(null)}
            className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
          >
            Jetzt anlegen
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          <EmployeeSection
            title="Aktive Mitarbeiter"
            employees={active}
            onEdit={(emp) => setModalEmployee(emp)}
          />
          {inactive.length > 0 && (
            <EmployeeSection
              title="Inaktive Mitarbeiter"
              employees={inactive}
              onEdit={(emp) => setModalEmployee(emp)}
              muted
            />
          )}
        </div>
      )}

      {/* Modal */}
      {modalEmployee !== undefined && (
        <EmployeeModal
          employee={modalEmployee}
          onClose={() => setModalEmployee(undefined)}
          createAction={handleCreate}
          updateAction={handleUpdate}
          deleteAction={handleDelete}
          isAdmin={true}
        />
      )}
    </div>
  );
}

function EmployeeSection({
  title,
  employees,
  onEdit,
  muted = false,
}: {
  title: string;
  employees: Employee[];
  onEdit: (emp: Employee) => void;
  muted?: boolean;
}) {
  if (employees.length === 0) return null;

  return (
    <div>
      <h2 className={`text-xs font-semibold uppercase tracking-wide mb-3 ${muted ? "text-zinc-600" : "text-zinc-400"}`}>
        {title} ({employees.length})
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {employees.map((emp) => (
          <EmployeeCard key={emp.id} employee={emp} onEdit={onEdit} muted={muted} />
        ))}
      </div>
    </div>
  );
}

function EmployeeCard({
  employee: emp,
  onEdit,
  muted,
}: {
  employee: Employee;
  onEdit: (emp: Employee) => void;
  muted: boolean;
}) {
  const empType = EMPLOYMENT_TYPES.find((t) => t.value === emp.employment_type)?.label ?? emp.employment_type;

  return (
    <div
      className={`group relative bg-zinc-900 border rounded-xl p-4 transition-all cursor-pointer hover:border-zinc-600 ${
        muted ? "border-zinc-800 opacity-60" : "border-zinc-800"
      }`}
      onClick={() => onEdit(emp)}
    >
      {/* Color stripe */}
      <div
        className="absolute top-0 left-0 right-0 h-1 rounded-t-xl"
        style={{ backgroundColor: emp.color }}
      />

      <div className="flex items-start gap-3 mt-1">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
          style={{ backgroundColor: emp.color }}
        >
          {getInitials(emp.name)}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-zinc-100 truncate">{emp.name}</div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {emp.position && (
              <span className="text-xs text-zinc-400 truncate">{emp.position}</span>
            )}
            {emp.department && (
              <>
                {emp.position && <span className="text-zinc-700 text-xs">·</span>}
                <span className="text-xs text-zinc-500 truncate">{emp.department}</span>
              </>
            )}
          </div>
        </div>

        {/* Edit icon */}
        <svg
          className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0 mt-0.5"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </div>

      {/* Hours & type */}
      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
        <div className="flex items-center gap-3">
          {emp.monthly_hours > 0 && (
            <span>
              <span className="text-zinc-300 font-medium">{emp.monthly_hours}h</span>
              <span className="text-zinc-600">/Monat</span>
            </span>
          )}
          {emp.weekly_hours > 0 && (
            <span>
              <span className="text-zinc-300 font-medium">{emp.weekly_hours}h</span>
              <span className="text-zinc-600">/Woche</span>
            </span>
          )}
        </div>
        <span className="px-2 py-0.5 bg-zinc-800 rounded-full text-zinc-400 text-[10px]">
          {empType}
        </span>
      </div>
    </div>
  );
}
