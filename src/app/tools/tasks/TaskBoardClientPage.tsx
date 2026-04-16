"use client";
import React, { useState, useEffect, useCallback } from "react";
import type { Task } from "@/app/api/tasks/route";

// ─── Constants ─────────────────────────────────────────────────────────────────

const COLUMNS: { key: Task["status"]; label: string; color: string }[] = [
  { key: "todo", label: "Offen", color: "hsl(217 91% 60%)" },
  { key: "in_progress", label: "In Arbeit", color: "hsl(32 95% 55%)" },
  { key: "done", label: "Erledigt", color: "hsl(142 70% 45%)" },
];

const PRIORITY_META: Record<
  Task["priority"],
  { label: string; color: string }
> = {
  low: { label: "Niedrig", color: "hsl(142 70% 45%)" },
  medium: { label: "Mittel", color: "hsl(32 95% 55%)" },
  high: { label: "Hoch", color: "hsl(0 72% 55%)" },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function nextStatus(s: Task["status"]): Task["status"] | null {
  if (s === "todo") return "in_progress";
  if (s === "in_progress") return "done";
  return null;
}

function prevStatus(s: Task["status"]): Task["status"] | null {
  if (s === "done") return "in_progress";
  if (s === "in_progress") return "todo";
  return null;
}

function formatDate(d: string | null): string | null {
  if (!d) return null;
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}

function isOverdue(due_date: string | null): boolean {
  if (!due_date) return false;
  return new Date(due_date) < new Date(new Date().toDateString());
}

// ─── Task card ─────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onEdit,
  onMove,
  onDelete,
}: {
  task: Task;
  onEdit: (t: Task) => void;
  onMove: (id: string, status: Task["status"]) => void;
  onDelete: (id: string) => void;
}) {
  const pMeta = PRIORITY_META[task.priority];
  const prev = prevStatus(task.status);
  const next = nextStatus(task.status);
  const overdue = isOverdue(task.due_date);

  return (
    <div
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: 10,
        padding: "0.85rem 0.9rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.45rem",
        cursor: "default",
      }}
    >
      {/* Top row: priority + due date */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
        }}
      >
        <span
          style={{
            background: pMeta.color + "22",
            color: pMeta.color,
            borderRadius: 4,
            padding: "1px 7px",
            fontSize: "0.65rem",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            flexShrink: 0,
          }}
        >
          {pMeta.label}
        </span>
        {task.due_date && (
          <span
            style={{
              fontSize: "0.7rem",
              color: overdue
                ? "hsl(var(--destructive))"
                : "hsl(var(--muted-foreground))",
              fontWeight: overdue ? 700 : 400,
              flexShrink: 0,
            }}
          >
            {overdue ? "⚠ " : ""}
            {formatDate(task.due_date)}
          </span>
        )}
      </div>

      {/* Title */}
      <div
        style={{
          fontWeight: 700,
          fontSize: "0.875rem",
          color: "hsl(var(--foreground))",
          lineHeight: 1.35,
        }}
      >
        {task.title}
      </div>

      {/* Description */}
      {task.description && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "hsl(var(--muted-foreground))",
            lineHeight: 1.5,
            overflow: "hidden",
            maxHeight: "3em",
          }}
        >
          {task.description}
        </div>
      )}

      {/* Footer: assignee + category */}
      {(task.assignee || task.category) && (
        <div
          style={{
            display: "flex",
            gap: "0.4rem",
            flexWrap: "wrap",
            marginTop: "0.1rem",
          }}
        >
          {task.assignee && (
            <span
              style={{
                background: "hsl(var(--muted) / 0.5)",
                borderRadius: 4,
                padding: "1px 6px",
                fontSize: "0.68rem",
                color: "hsl(var(--foreground))",
              }}
            >
              {task.assignee}
            </span>
          )}
          {task.category && (
            <span
              style={{
                background: "hsl(var(--muted) / 0.3)",
                borderRadius: 4,
                padding: "1px 6px",
                fontSize: "0.68rem",
                color: "hsl(var(--muted-foreground))",
              }}
            >
              {task.category}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: "flex",
          gap: "0.35rem",
          marginTop: "0.2rem",
          flexWrap: "wrap",
        }}
      >
        {prev && (
          <button
            onClick={() => onMove(task.id, prev)}
            title={`Zurück zu "${COLUMNS.find((c) => c.key === prev)?.label}"`}
            style={{
              background: "hsl(var(--secondary))",
              border: "none",
              borderRadius: 5,
              color: "hsl(var(--secondary-foreground))",
              padding: "0.25rem 0.5rem",
              fontSize: "0.7rem",
              cursor: "pointer",
            }}
          >
            ← Zurück
          </button>
        )}
        {next && (
          <button
            onClick={() => onMove(task.id, next)}
            title={`Weiter zu "${COLUMNS.find((c) => c.key === next)?.label}"`}
            style={{
              background: "hsl(var(--primary))",
              border: "none",
              borderRadius: 5,
              color: "hsl(var(--primary-foreground))",
              padding: "0.25rem 0.5rem",
              fontSize: "0.7rem",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Weiter →
          </button>
        )}
        <button
          onClick={() => onEdit(task)}
          style={{
            background: "hsl(var(--secondary))",
            border: "none",
            borderRadius: 5,
            color: "hsl(var(--secondary-foreground))",
            padding: "0.25rem 0.5rem",
            fontSize: "0.7rem",
            cursor: "pointer",
          }}
        >
          Bearbeiten
        </button>
        <button
          onClick={() => onDelete(task.id)}
          style={{
            background: "hsl(var(--destructive) / 0.1)",
            border: "none",
            borderRadius: 5,
            color: "hsl(var(--destructive))",
            padding: "0.25rem 0.5rem",
            fontSize: "0.7rem",
            cursor: "pointer",
          }}
        >
          Löschen
        </button>
      </div>
    </div>
  );
}

// ─── Task modal ────────────────────────────────────────────────────────────────

type TaskForm = {
  title: string;
  description: string;
  status: Task["status"];
  priority: Task["priority"];
  assignee: string;
  due_date: string;
  category: string;
};

function TaskModal({
  task,
  defaultStatus,
  onClose,
  onSaved,
}: {
  task: Task | null;
  defaultStatus: Task["status"];
  onClose: () => void;
  onSaved: (t: Task) => void;
}) {
  const isEdit = task !== null;
  const [form, setForm] = useState<TaskForm>(
    task
      ? {
          title: task.title,
          description: task.description ?? "",
          status: task.status,
          priority: task.priority,
          assignee: task.assignee ?? "",
          due_date: task.due_date ?? "",
          category: task.category ?? "",
        }
      : {
          title: "",
          description: "",
          status: defaultStatus,
          priority: "medium",
          assignee: "",
          due_date: "",
          category: "",
        }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof TaskForm>(k: K, v: TaskForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title.trim()) {
      setError("Titel ist erforderlich.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: form.title,
        description: form.description || null,
        status: form.status,
        priority: form.priority,
        assignee: form.assignee || null,
        due_date: form.due_date || null,
        category: form.category || null,
      };
      const res = await fetch(
        isEdit ? `/api/tasks/${task!.id}` : "/api/tasks",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Fehler beim Speichern.");
        return;
      }
      onSaved(json.data);
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "hsl(var(--card) / 0.8)",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    color: "hsl(var(--foreground))",
    padding: "0.55rem 0.75rem",
    fontSize: "0.875rem",
    outline: "none",
    boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "hsl(var(--muted-foreground))",
    marginBottom: "0.25rem",
    display: "block",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "hsl(var(--background) / 0.7)",
          backdropFilter: "blur(6px)",
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 16,
          padding: "1.75rem",
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        <h2
          style={{
            margin: "0 0 1.5rem",
            fontSize: "1.1rem",
            fontWeight: 700,
            color: "hsl(var(--foreground))",
          }}
        >
          {isEdit ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={labelStyle}>Titel *</label>
            <input
              style={inputStyle}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Was ist zu tun?"
              autoFocus
            />
          </div>
          <div>
            <label style={labelStyle}>Beschreibung</label>
            <textarea
              style={{ ...inputStyle, resize: "vertical", minHeight: 72 }}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optionale Details…"
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select
                style={{ ...inputStyle, cursor: "pointer" }}
                value={form.status}
                onChange={(e) => set("status", e.target.value as Task["status"])}
              >
                {COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priorität</label>
              <select
                style={{ ...inputStyle, cursor: "pointer" }}
                value={form.priority}
                onChange={(e) =>
                  set("priority", e.target.value as Task["priority"])
                }
              >
                {Object.entries(PRIORITY_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={labelStyle}>Zugewiesen an</label>
              <input
                style={inputStyle}
                value={form.assignee}
                onChange={(e) => set("assignee", e.target.value)}
                placeholder="Name…"
              />
            </div>
            <div>
              <label style={labelStyle}>Fällig am</label>
              <input
                style={inputStyle}
                type="date"
                value={form.due_date}
                onChange={(e) => set("due_date", e.target.value)}
              />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Kategorie</label>
            <input
              style={inputStyle}
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="z.B. Einkauf, Haushalt, Schule…"
            />
          </div>
        </div>

        {error && (
          <p
            style={{
              margin: "1rem 0 0",
              color: "hsl(var(--destructive))",
              fontSize: "0.82rem",
            }}
          >
            {error}
          </p>
        )}

        <div
          style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}
        >
          <button
            onClick={onClose}
            style={{
              flex: 1,
              background: "hsl(var(--secondary))",
              border: "none",
              borderRadius: 10,
              color: "hsl(var(--secondary-foreground))",
              padding: "0.65rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Abbrechen
          </button>
          <button
            onClick={save}
            disabled={saving}
            style={{
              flex: 2,
              background: "hsl(var(--primary))",
              border: "none",
              borderRadius: 10,
              color: "hsl(var(--primary-foreground))",
              padding: "0.65rem",
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving
              ? "Wird gespeichert…"
              : isEdit
              ? "Speichern"
              : "Aufgabe hinzufügen"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Kanban column ─────────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  tasks,
  onAddTask,
  onEditTask,
  onMoveTask,
  onDeleteTask,
}: {
  column: (typeof COLUMNS)[number];
  tasks: Task[];
  onAddTask: (status: Task["status"]) => void;
  onEditTask: (t: Task) => void;
  onMoveTask: (id: string, status: Task["status"]) => void;
  onDeleteTask: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        minWidth: 0,
      }}
    >
      {/* Column header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.6rem 0.75rem",
          background: column.color + "18",
          borderRadius: 8,
          border: `1px solid ${column.color}33`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: column.color,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontWeight: 700,
              fontSize: "0.85rem",
              color: "hsl(var(--foreground))",
            }}
          >
            {column.label}
          </span>
        </div>
        <span
          style={{
            background: column.color + "33",
            color: column.color,
            borderRadius: 20,
            padding: "1px 8px",
            fontSize: "0.72rem",
            fontWeight: 700,
          }}
        >
          {tasks.length}
        </span>
      </div>

      {/* Task cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onEdit={onEditTask}
            onMove={onMoveTask}
            onDelete={onDeleteTask}
          />
        ))}
      </div>

      {/* Add button */}
      <button
        onClick={() => onAddTask(column.key)}
        style={{
          background: "transparent",
          border: `1px dashed hsl(var(--border))`,
          borderRadius: 8,
          color: "hsl(var(--muted-foreground))",
          padding: "0.5rem",
          fontSize: "0.78rem",
          cursor: "pointer",
          textAlign: "center",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLButtonElement).style.background =
            "hsl(var(--muted) / 0.3)";
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLButtonElement).style.background = "transparent";
        }}
      >
        + Aufgabe hinzufügen
      </button>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function TaskBoardClientPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{
    open: boolean;
    task: Task | null;
    defaultStatus: Task["status"];
  }>({ open: false, task: null, defaultStatus: "todo" });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks");
      const json = await res.json();
      if (json.ok) setTasks(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const openAdd = (status: Task["status"]) =>
    setModal({ open: true, task: null, defaultStatus: status });
  const openEdit = (t: Task) =>
    setModal({ open: true, task: t, defaultStatus: t.status });
  const closeModal = () =>
    setModal((m) => ({ ...m, open: false }));

  const handleSaved = (saved: Task) => {
    closeModal();
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
  };

  const handleMove = async (id: string, status: Task["status"]) => {
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status } : t))
    );
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.ok && json.data) {
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? json.data : t))
        );
      }
    } catch {
      // Revert on error
      fetchTasks();
    }
  };

  const handleDeleteRequest = (id: string) => setDeleteId(id);

  const handleDeleteConfirm = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    } catch {
      fetchTasks();
    }
  };

  const tasksByStatus = (status: Task["status"]) =>
    tasks
      .filter((t) => t.status === status)
      .sort((a, b) => a.position - b.position);

  const totalOpen = tasks.filter((t) => t.status !== "done").length;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "2rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 800,
              color: "hsl(var(--foreground))",
              margin: 0,
              letterSpacing: "-0.03em",
            }}
          >
            Aufgaben-Board
          </h1>
          <p
            style={{
              fontSize: "0.82rem",
              color: "hsl(var(--muted-foreground))",
              margin: "0.25rem 0 0",
            }}
          >
            {totalOpen} offene {totalOpen === 1 ? "Aufgabe" : "Aufgaben"} ·
            Geteilt im Team
          </p>
        </div>
        <button
          onClick={() => openAdd("todo")}
          style={{
            background: "hsl(var(--primary))",
            border: "none",
            borderRadius: 10,
            color: "hsl(var(--primary-foreground))",
            padding: "0.6rem 1.25rem",
            fontWeight: 700,
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          + Neue Aufgabe
        </button>
      </div>

      {/* Board */}
      {loading ? (
        <div
          style={{
            textAlign: "center",
            color: "hsl(var(--muted-foreground))",
            padding: "3rem",
          }}
        >
          Wird geladen…
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "1.25rem",
            alignItems: "start",
          }}
        >
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.key}
              column={col}
              tasks={tasksByStatus(col.key)}
              onAddTask={openAdd}
              onEditTask={openEdit}
              onMoveTask={handleMove}
              onDeleteTask={handleDeleteRequest}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation toast */}
      {deleteId && (
        <div
          style={{
            position: "fixed",
            bottom: "1.5rem",
            left: "50%",
            transform: "translateX(-50%)",
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--destructive))",
            borderRadius: 10,
            padding: "0.75rem 1.25rem",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            zIndex: 40,
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{ color: "hsl(var(--foreground))", fontSize: "0.875rem" }}
          >
            Aufgabe wirklich löschen?
          </span>
          <button
            onClick={handleDeleteConfirm}
            style={{
              background: "hsl(var(--destructive))",
              border: "none",
              borderRadius: 6,
              color: "white",
              padding: "0.35rem 0.75rem",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "0.82rem",
            }}
          >
            Ja, löschen
          </button>
          <button
            onClick={() => setDeleteId(null)}
            style={{
              background: "hsl(var(--secondary))",
              border: "none",
              borderRadius: 6,
              color: "hsl(var(--secondary-foreground))",
              padding: "0.35rem 0.75rem",
              cursor: "pointer",
              fontSize: "0.82rem",
            }}
          >
            Abbrechen
          </button>
        </div>
      )}

      {/* Task modal */}
      {modal.open && (
        <TaskModal
          task={modal.task}
          defaultStatus={modal.defaultStatus}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
