"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FinanceTransaction } from "@/app/api/finance/transactions/route";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import { idempotencyHeaders } from "@/lib/idempotency-client";

// ─── Category definitions ────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = [
  { id: "wohnen",       label: "Wohnen",        color: "#3B82F6" },
  { id: "lebensmittel", label: "Lebensmittel",   color: "#10B981" },
  { id: "transport",    label: "Transport",      color: "#F59E0B" },
  { id: "freizeit",     label: "Freizeit",       color: "#EC4899" },
  { id: "gesundheit",   label: "Gesundheit",     color: "#8B5CF6" },
  { id: "kleidung",     label: "Kleidung",       color: "#F97316" },
  { id: "restaurant",   label: "Restaurant",     color: "#84CC16" },
  { id: "abonnements",  label: "Abonnements",    color: "#EF4444" },
  { id: "bildung",      label: "Bildung",        color: "#06B6D4" },
  { id: "sonstiges",    label: "Sonstiges",      color: "#6B7280" },
];

const INCOME_CATEGORIES = [
  { id: "gehalt",       label: "Gehalt",         color: "#34D399" },
  { id: "nebenjob",     label: "Nebenjob",       color: "#A3E635" },
  { id: "kapital",      label: "Kapitalerträge", color: "#60A5FA" },
  { id: "sonstiges",    label: "Sonstiges",      color: "#6B7280" },
];

const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

function getCategoryMeta(id: string) {
  return ALL_CATEGORIES.find((c) => c.id === id) ?? { id, label: id, color: "#6B7280" };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "heute";
  if (d.toDateString() === yesterday.toDateString()) return "gestern";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

function toMonthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toMonthLabel(d: Date) {
  return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

// ─── Types ───────────────────────────────────────────────────────────────────

type FormData = {
  type: "income" | "expense";
  amount: string;
  description: string;
  category: string;
  transaction_date: string;
};

const defaultForm = (): FormData => ({
  type: "expense",
  amount: "",
  description: "",
  category: "sonstiges",
  transaction_date: new Date().toISOString().split("T")[0],
});

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FinanceClientPage() {
  const [currentDate, setCurrentDate] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTx, setEditingTx] = useState<FinanceTransaction | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [barsVisible, setBarsVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthKey = toMonthKey(currentDate);
  const monthLabel = toMonthLabel(currentDate);
  const isCurrentMonth = toMonthKey(new Date()) === monthKey;

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchTransactions = useCallback(async (month: string) => {
    setLoading(true);
    setBarsVisible(false);
    setError(null);
    try {
      const res = await fetch(`/api/finance/transactions?month=${month}`);
      const json = await res.json();
      if (json.ok) {
        setTransactions(json.data);
        // Stagger bar animation after data loads
        setTimeout(() => setBarsVisible(true), 80);
      } else {
        setError("Transaktionen konnten nicht geladen werden.");
      }
    } catch {
      setError("Fehler beim Laden der Transaktionen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions(monthKey);
  }, [monthKey, fetchTransactions]);

  // ── Summary ──────────────────────────────────────────────────────────────

  const summary = useMemo(() => {
    const income = transactions
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + t.amount, 0);
    const expenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0);
    return { income, expenses, available: income - expenses };
  }, [transactions]);

  // ── Category breakdown ───────────────────────────────────────────────────

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions.filter((t) => t.type === "expense")) {
      map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
    }
    return Array.from(map.entries())
      .map(([cat, amount]) => ({ ...getCategoryMeta(cat), amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [transactions]);

  // ── Modal helpers ────────────────────────────────────────────────────────

  function openAddModal() {
    setEditingTx(null);
    setForm(defaultForm());
    setShowModal(true);
  }

  function openEditModal(tx: FinanceTransaction) {
    setEditingTx(tx);
    setForm({
      type: tx.type,
      amount: String(tx.amount),
      description: tx.description ?? "",
      category: tx.category,
      transaction_date: tx.transaction_date,
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingTx(null);
    setForm(defaultForm());
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    const amount = parseFloat(form.amount.replace(",", "."));
    if (!form.amount || isNaN(amount) || amount <= 0) return;
    setSaving(true);
    try {
      const body = {
        type: form.type,
        amount,
        description: form.description || null,
        category: form.category,
        transaction_date: form.transaction_date,
      };

      if (editingTx) {
        const res = await fetch(`/api/finance/transactions/${editingTx.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.ok) {
          setError("Buchung konnte nicht gespeichert werden.");
          return;
        }
        const editedMonth = form.transaction_date.slice(0, 7);
        if (editedMonth !== monthKey) {
          // Transaction moved to a different month — remove it from the current view
          setTransactions((prev) => prev.filter((t) => t.id !== editingTx.id));
        } else {
          setTransactions((prev) =>
            prev.map((t) =>
              t.id === editingTx.id ? { ...t, ...body, amount } : t
            )
          );
        }
      } else {
        const res = await fetch("/api/finance/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...idempotencyHeaders() },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.ok) {
          setError("Buchung konnte nicht angelegt werden.");
          return;
        }
        // Only append to list if this transaction falls in the current month view
        const txDate = form.transaction_date.slice(0, 7);
        if (txDate === monthKey) {
          setTransactions((prev) => [json.data, ...prev]);
        }
      }
      closeModal();
    } catch {
      setError("Netzwerkfehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async function handleDelete(id: string): Promise<boolean> {
    setDeleting(id);
    try {
      const res = await fetch(`/api/finance/transactions/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) {
        setTransactions((prev) => prev.filter((t) => t.id !== id));
        return true;
      }
      setError("Buchung konnte nicht gelöscht werden.");
      return false;
    } catch {
      setError("Netzwerkfehler beim Löschen.");
      return false;
    } finally {
      setDeleting(null);
    }
  }

  // ── Month nav ────────────────────────────────────────────────────────────

  function prevMonth() {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function nextMonth() {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  // ── Category auto-select when type changes ───────────────────────────────

  function setFormType(type: "income" | "expense") {
    const cats = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    setForm((f) => ({
      ...f,
      type,
      category: cats[0].id,
    }));
  }

  const currentCats = form.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  // ── Recent transactions (newest first, max 8) ────────────────────────────

  const recent = useMemo(
    () => [...transactions].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8),
    [transactions]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "hsl(var(--background))",
        color: "hsl(var(--foreground))",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        padding: "1.5rem 1rem 4rem",
      }}
    >
      {/* ── Centered container ── */}
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1.5rem",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "1.6rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                margin: 0,
                color: "hsl(var(--foreground))",
              }}
            >
              Mein Budget
            </h1>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: "0.78rem",
                color: "hsl(var(--muted-foreground))",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Persönliche Finanzen
            </p>
          </div>

          {/* Theme toggle + Month navigator */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ThemeToggleButton />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.65rem",
              padding: "0.3rem 0.5rem",
            }}
          >
            <button
              onClick={prevMonth}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "hsl(var(--muted-foreground))",
                display: "flex",
                alignItems: "center",
                padding: "0.2rem 0.4rem",
                borderRadius: "0.4rem",
                fontSize: "1rem",
                lineHeight: 1,
                transition: "color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--foreground))";
                (e.currentTarget as HTMLButtonElement).style.background = "hsl(var(--muted))";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--muted-foreground))";
                (e.currentTarget as HTMLButtonElement).style.background = "none";
              }}
            >
              ‹
            </button>
            <span
              style={{
                fontSize: "0.82rem",
                fontWeight: 600,
                color: "hsl(var(--foreground))",
                minWidth: 90,
                textAlign: "center",
                letterSpacing: "0.01em",
              }}
            >
              {monthLabel}
            </span>
            <button
              onClick={nextMonth}
              disabled={isCurrentMonth}
              style={{
                background: "none",
                border: "none",
                cursor: isCurrentMonth ? "default" : "pointer",
                color: isCurrentMonth ? "hsl(var(--border))" : "hsl(var(--muted-foreground))",
                display: "flex",
                alignItems: "center",
                padding: "0.2rem 0.4rem",
                borderRadius: "0.4rem",
                fontSize: "1rem",
                lineHeight: 1,
                transition: "color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isCurrentMonth) {
                  (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--foreground))";
                  (e.currentTarget as HTMLButtonElement).style.background = "hsl(var(--muted))";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = isCurrentMonth
                  ? "hsl(var(--border))"
                  : "hsl(var(--muted-foreground))";
                (e.currentTarget as HTMLButtonElement).style.background = "none";
              }}
            >
              ›
            </button>
          </div>
          </div>
        </div>

        {/* ── Summary cards ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "0.75rem",
            marginBottom: "1.25rem",
          }}
        >
          <SummaryCard
            label="Einnahmen"
            value={summary.income}
            color="#22c55e"
            accentBg="rgba(34,197,94,0.08)"
            loading={loading}
            sign="+"
          />
          <SummaryCard
            label="Ausgaben"
            value={summary.expenses}
            color="#f87171"
            accentBg="rgba(248,113,113,0.08)"
            loading={loading}
            sign="-"
          />
          <SummaryCard
            label="Verfügbar"
            value={summary.available}
            color={summary.available >= 0 ? "hsl(var(--foreground))" : "#f87171"}
            accentBg="rgba(255,255,255,0.03)"
            loading={loading}
          />
        </div>

        {/* ── Category breakdown ── */}
        {(loading || categoryBreakdown.length > 0) && (
          <Section label="Kategorien">
            {loading ? (
              <SkeletonRows n={4} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                {categoryBreakdown.map((cat, i) => (
                  <CategoryRow
                    key={cat.id}
                    label={cat.label}
                    amount={cat.amount}
                    color={cat.color}
                    percentage={summary.expenses > 0 ? (cat.amount / summary.expenses) * 100 : 0}
                    visible={barsVisible}
                    delay={i * 60}
                  />
                ))}
              </div>
            )}
          </Section>
        )}

        {/* ── Recent transactions ── */}
        <Section label="Letzte Buchungen">
          {loading ? (
            <SkeletonRows n={4} />
          ) : recent.length === 0 ? (
            <div
              style={{
                padding: "2rem 1rem",
                textAlign: "center",
                color: "hsl(var(--muted-foreground))",
                fontSize: "0.85rem",
              }}
            >
              Noch keine Buchungen in diesem Monat.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {recent.map((tx, i) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  isLast={i === recent.length - 1}
                  deleting={deleting === tx.id}
                  onEdit={() => openEditModal(tx)}
                />
              ))}
            </div>
          )}
        </Section>

        {error && (
          <div
            style={{
              color: "#f87171",
              fontSize: "0.82rem",
              textAlign: "center",
              marginTop: "0.5rem",
            }}
          >
            {error}
          </div>
        )}

        {/* ── Add button ── */}
        <button
          onClick={openAddModal}
          style={{
            width: "100%",
            marginTop: "1.25rem",
            padding: "0.85rem",
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "0.75rem",
            color: "hsl(var(--foreground))",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: "0.01em",
            transition: "background 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "hsl(var(--muted))";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--ring))";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "hsl(var(--card))";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--border))";
          }}
        >
          + Buchung hinzufügen
        </button>
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <Modal onClose={closeModal}>
          <div style={{ marginBottom: "1.25rem" }}>
            <h2
              style={{
                margin: "0 0 0.25rem",
                fontSize: "1.1rem",
                fontWeight: 700,
                color: "hsl(var(--foreground))",
              }}
            >
              {editingTx ? "Buchung bearbeiten" : "Neue Buchung"}
            </h2>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "hsl(var(--muted-foreground))" }}>
              Deine Daten werden verschlüsselt gespeichert.
            </p>
          </div>

          {/* Type toggle */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.4rem",
              marginBottom: "1.1rem",
              background: "hsl(var(--muted))",
              borderRadius: "0.6rem",
              padding: "0.25rem",
            }}
          >
            {(["expense", "income"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFormType(t)}
                style={{
                  padding: "0.5rem",
                  borderRadius: "0.4rem",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  letterSpacing: "0.01em",
                  transition: "all 0.15s",
                  background:
                    form.type === t
                      ? t === "expense"
                        ? "rgba(248,113,113,0.18)"
                        : "rgba(34,197,94,0.18)"
                      : "transparent",
                  color:
                    form.type === t
                      ? t === "expense"
                        ? "#f87171"
                        : "#22c55e"
                      : "hsl(var(--muted-foreground))",
                }}
              >
                {t === "expense" ? "Ausgabe" : "Einnahme"}
              </button>
            ))}
          </div>

          {/* Amount */}
          <FormRow label="Betrag (€)">
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0,00"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              style={inputStyle}
              autoFocus
            />
          </FormRow>

          {/* Category */}
          <FormRow label="Kategorie">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
                gap: "0.35rem",
              }}
            >
              {currentCats.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setForm((f) => ({ ...f, category: c.id }))}
                  style={{
                    padding: "0.4rem 0.5rem",
                    borderRadius: "0.45rem",
                    border: `1.5px solid ${form.category === c.id ? c.color : "hsl(var(--border))"}`,
                    background:
                      form.category === c.id
                        ? `${c.color}22`
                        : "hsl(var(--muted))",
                    color:
                      form.category === c.id ? c.color : "hsl(var(--muted-foreground))",
                    fontSize: "0.78rem",
                    fontWeight: form.category === c.id ? 600 : 400,
                    cursor: "pointer",
                    transition: "all 0.12s",
                    textAlign: "center",
                    letterSpacing: "0.01em",
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </FormRow>

          {/* Description */}
          <FormRow label="Beschreibung (optional)">
            <input
              type="text"
              placeholder="z.B. Rewe, Netflix, Miete …"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              style={inputStyle}
              maxLength={200}
            />
          </FormRow>

          {/* Date */}
          <FormRow label="Datum">
            <input
              type="date"
              value={form.transaction_date}
              onChange={(e) => setForm((f) => ({ ...f, transaction_date: e.target.value }))}
              style={inputStyle}
            />
          </FormRow>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              gap: "0.6rem",
              marginTop: "1.4rem",
              alignItems: "center",
            }}
          >
            {editingTx && (
              <button
                onClick={async () => {
                  const ok = await handleDelete(editingTx.id);
                  if (ok) closeModal();
                }}
                style={{
                  padding: "0.6rem 0.9rem",
                  borderRadius: "0.55rem",
                  border: "1px solid rgba(248,113,113,0.3)",
                  background: "rgba(248,113,113,0.08)",
                  color: "#f87171",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Löschen
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={closeModal}
              style={{
                padding: "0.6rem 1.1rem",
                borderRadius: "0.55rem",
                border: "1px solid hsl(var(--border))",
                background: "transparent",
                color: "hsl(var(--muted-foreground))",
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.amount}
              style={{
                padding: "0.6rem 1.4rem",
                borderRadius: "0.55rem",
                border: "none",
                background:
                  form.type === "income"
                    ? "rgba(34,197,94,0.9)"
                    : "hsl(var(--primary))",
                color: form.type === "income" ? "#052e16" : "hsl(var(--primary-foreground))",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: saving || !form.amount ? "not-allowed" : "pointer",
                opacity: saving || !form.amount ? 0.6 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {saving ? "Speichern …" : "Speichern"}
            </button>
          </div>
        </Modal>
      )}

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes barGrow {
          from { width: 0%; }
        }
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  color,
  loading,
  sign,
}: {
  label: string;
  value: number;
  color: string;
  accentBg?: string;
  loading: boolean;
  sign?: string;
}) {
  return (
    <div
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: "0.75rem",
        padding: "0.9rem 1rem",
        animation: "fadeSlideUp 0.4s ease both",
      }}
    >
      <div
        style={{
          fontSize: "0.72rem",
          fontWeight: 500,
          color: "hsl(var(--muted-foreground))",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          marginBottom: "0.5rem",
        }}
      >
        {label}
      </div>
      {loading ? (
        <div style={skeletonStyle(72, 10)} />
      ) : (
        <div
          style={{
            fontSize: "1.45rem",
            fontWeight: 700,
            color,
            letterSpacing: "-0.03em",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {sign === "+" && value > 0 ? "+" : ""}
          {fmt(value)} €
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: "0.75rem",
        padding: "1rem",
        marginBottom: "0.75rem",
        animation: "fadeSlideUp 0.4s ease both",
      }}
    >
      <div
        style={{
          fontSize: "0.68rem",
          fontWeight: 700,
          color: "hsl(var(--muted-foreground))",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: "0.9rem",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function CategoryRow({
  label,
  amount,
  color,
  percentage,
  visible,
  delay,
}: {
  label: string;
  amount: number;
  color: string;
  percentage: number;
  visible: boolean;
  delay: number;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "0.3rem",
          fontSize: "0.82rem",
        }}
      >
        <span style={{ color: "hsl(var(--foreground))", fontWeight: 500 }}>{label}</span>
        <span
          style={{
            color: "hsl(var(--muted-foreground))",
            fontVariantNumeric: "tabular-nums",
            fontSize: "0.8rem",
          }}
        >
          {fmt(amount)} €
        </span>
      </div>
      <div
        style={{
          height: 5,
          background: "hsl(var(--muted))",
          borderRadius: 99,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: visible ? `${Math.min(percentage, 100)}%` : "0%",
            background: color,
            borderRadius: 99,
            transition: `width 0.7s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms`,
            boxShadow: `0 0 6px ${color}66`,
          }}
        />
      </div>
    </div>
  );
}

function TransactionRow({
  tx,
  isLast,
  deleting,
  onEdit,
}: {
  tx: FinanceTransaction;
  isLast: boolean;
  deleting: boolean;
  onEdit: () => void;
}) {
  const meta = getCategoryMeta(tx.category);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.65rem 0",
        borderBottom: isLast ? "none" : "1px solid hsl(var(--border))",
        opacity: deleting ? 0.4 : 1,
        transition: "opacity 0.2s",
        cursor: "pointer",
      }}
      onClick={onEdit}
    >
      {/* Dot */}
      <div
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: meta.color,
          flexShrink: 0,
          boxShadow: `0 0 5px ${meta.color}88`,
        }}
      />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.85rem",
            fontWeight: 500,
            color: "hsl(var(--foreground))",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {tx.description || meta.label}
        </div>
        <div
          style={{
            fontSize: "0.72rem",
            color: "hsl(var(--muted-foreground))",
            marginTop: "1px",
          }}
        >
          {meta.label} · {fmtDate(tx.transaction_date)}
        </div>
      </div>

      {/* Amount */}
      <div
        style={{
          fontSize: "0.88rem",
          fontWeight: 700,
          color: tx.type === "income" ? "#22c55e" : "#f87171",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.01em",
          flexShrink: 0,
        }}
      >
        {tx.type === "income" ? "+" : "-"}
        {fmt(tx.amount)} €
      </div>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        animation: "fadeSlideUp 0.2s ease both",
      }}
    >
      <div
        style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: "1rem",
          padding: "1.5rem",
          width: "100%",
          maxWidth: 440,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
          animation: "fadeSlideUp 0.25s cubic-bezier(0.34,1.2,0.64,1) both",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "0.9rem" }}>
      <label
        style={{
          display: "block",
          fontSize: "0.72rem",
          fontWeight: 600,
          color: "hsl(var(--muted-foreground))",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          marginBottom: "0.4rem",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function SkeletonRows({ n }: { n: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <div style={skeletonStyle(9, 9, "50%")} />
          <div style={{ flex: 1 }}>
            <div style={skeletonStyle(120, 10, "4px")} />
            <div style={{ ...skeletonStyle(70, 8, "4px"), marginTop: 4 }} />
          </div>
          <div style={skeletonStyle(52, 10, "4px")} />
        </div>
      ))}
    </div>
  );
}

function skeletonStyle(width: number | string, height: number, borderRadius?: string): React.CSSProperties {
  return {
    width,
    height,
    borderRadius: borderRadius ?? "4px",
    background: "linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--border)) 50%, hsl(var(--muted)) 75%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.4s infinite",
  };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.75rem",
  background: "hsl(var(--muted))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.5rem",
  color: "hsl(var(--foreground))",
  fontSize: "0.9rem",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};
