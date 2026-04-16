"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import type { VaultEntry } from "@/app/api/vault/entries/route";

// ─── Utilities ────────────────────────────────────────────────────────────────

function generatePassword(length = 24): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => chars[b % chars.length])
    .join("");
}

const CATEGORY_COLORS: Record<string, string> = {
  social: "hsl(217 91% 60%)",
  email: "hsl(142 70% 45%)",
  banking: "hsl(32 95% 55%)",
  shopping: "hsl(280 65% 60%)",
  arbeit: "hsl(196 88% 38%)",
  sonstiges: "hsl(215 20% 55%)",
};

function categoryColor(c: string) {
  return CATEGORY_COLORS[c] ?? CATEGORY_COLORS.sonstiges;
}

// ─── Category badge ────────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
  const color = categoryColor(category);
  return (
    <span
      style={{
        background: color + "22",
        color,
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: "0.68rem",
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "capitalize",
        flexShrink: 0,
      }}
    >
      {category}
    </span>
  );
}

// ─── Vault card ────────────────────────────────────────────────────────────────

function VaultCard({
  entry,
  onEdit,
  onDeleteRequest,
}: {
  entry: VaultEntry;
  onEdit: (e: VaultEntry) => void;
  onDeleteRequest: (id: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<"pw" | "user" | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reveal = () => {
    setRevealed(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setRevealed(false), 5000);
  };

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const copy = async (text: string, kind: "pw" | "user") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const btn: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "3px 6px",
    borderRadius: 4,
    fontSize: "0.78rem",
    color: "hsl(var(--muted-foreground))",
    lineHeight: 1,
  };

  return (
    <div
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: 12,
        padding: "1rem 1.1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.55rem",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "0.5rem",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: "0.95rem",
              color: "hsl(var(--foreground))",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {entry.label}
          </div>
          {entry.username && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
                marginTop: 2,
              }}
            >
              <span
                style={{
                  fontSize: "0.78rem",
                  color: "hsl(var(--muted-foreground))",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {entry.username}
              </span>
              <button
                style={btn}
                title="Benutzername kopieren"
                onClick={() => copy(entry.username!, "user")}
              >
                {copied === "user" ? "✓" : "⎘"}
              </button>
            </div>
          )}
        </div>
        <CategoryBadge category={entry.category} />
      </div>

      {/* URL */}
      {entry.url && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "hsl(var(--primary))",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.url.replace(/^https?:\/\//, "")}
        </div>
      )}

      {/* Password row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
          background: "hsl(var(--muted) / 0.4)",
          borderRadius: 6,
          padding: "0.3rem 0.6rem",
        }}
      >
        <span
          style={{
            flex: 1,
            fontFamily: "monospace",
            fontSize: "0.82rem",
            color: "hsl(var(--foreground))",
            letterSpacing: revealed ? "0" : "0.2em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {revealed ? entry.password : "••••••••••••"}
        </span>
        <button
          style={btn}
          title={revealed ? "Verbergen" : "Anzeigen (5s)"}
          onClick={reveal}
        >
          {revealed ? "◎" : "◉"}
        </button>
        <button
          style={{ ...btn, color: copied === "pw" ? "hsl(142 70% 45%)" : "hsl(var(--muted-foreground))" }}
          title="Passwort kopieren"
          onClick={() => copy(entry.password, "pw")}
        >
          {copied === "pw" ? "✓" : "⎘"}
        </button>
      </div>

      {/* Notes */}
      {entry.notes && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "hsl(var(--muted-foreground))",
            fontStyle: "italic",
            overflow: "hidden",
            maxHeight: "2.6em",
            lineHeight: 1.5,
          }}
        >
          {entry.notes}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.1rem" }}>
        <button
          onClick={() => onEdit(entry)}
          style={{
            flex: 1,
            background: "hsl(var(--secondary))",
            border: "none",
            borderRadius: 6,
            color: "hsl(var(--secondary-foreground))",
            padding: "0.35rem",
            fontSize: "0.75rem",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Bearbeiten
        </button>
        <button
          onClick={() => onDeleteRequest(entry.id)}
          style={{
            flex: 1,
            background: "hsl(var(--destructive) / 0.1)",
            border: "none",
            borderRadius: 6,
            color: "hsl(var(--destructive))",
            padding: "0.35rem",
            fontSize: "0.75rem",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Löschen
        </button>
      </div>
    </div>
  );
}

// ─── Entry modal ───────────────────────────────────────────────────────────────

const VAULT_CATEGORIES = ["sonstiges", "social", "email", "banking", "shopping", "arbeit"] as const;

type EntryForm = {
  label: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  category: string;
};

const EMPTY_FORM: EntryForm = {
  label: "",
  username: "",
  password: "",
  url: "",
  notes: "",
  category: "sonstiges",
};

function EntryModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: VaultEntry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = entry !== null;
  const [form, setForm] = useState<EntryForm>(
    entry
      ? {
          label: entry.label,
          username: entry.username ?? "",
          password: entry.password,
          url: entry.url ?? "",
          notes: entry.notes ?? "",
          category: entry.category,
        }
      : EMPTY_FORM
  );
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof EntryForm, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const genPassword = () => {
    set("password", generatePassword(24));
    setShowPw(true);
  };

  const save = async () => {
    if (!form.label.trim()) {
      setError("Bezeichnung ist erforderlich.");
      return;
    }
    if (!form.password) {
      setError("Passwort ist erforderlich.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        label: form.label,
        username: form.username || null,
        password: form.password,
        url: form.url || null,
        notes: form.notes || null,
        category: form.category,
      };
      const res = await fetch(
        isEdit ? `/api/vault/entries/${entry!.id}` : "/api/vault/entries",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Fehler beim Speichern.");
        return;
      }
      onSaved();
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
          {isEdit ? "Eintrag bearbeiten" : "Neuer Eintrag"}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={labelStyle}>Bezeichnung *</label>
            <input
              style={inputStyle}
              value={form.label}
              onChange={(e) => set("label", e.target.value)}
              placeholder="z.B. GitHub, Netflix, Bank…"
            />
          </div>
          <div>
            <label style={labelStyle}>Benutzername / E-Mail</label>
            <input
              style={inputStyle}
              value={form.username}
              onChange={(e) => set("username", e.target.value)}
              placeholder="benutzer@example.com"
              autoComplete="off"
            />
          </div>
          <div>
            <label style={labelStyle}>Passwort *</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                style={{
                  ...inputStyle,
                  flex: 1,
                  fontFamily: showPw ? "inherit" : "monospace",
                  letterSpacing: showPw ? 0 : "0.15em",
                }}
                type={showPw ? "text" : "password"}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                placeholder="Passwort eingeben"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                style={{
                  background: "hsl(var(--secondary))",
                  border: "none",
                  borderRadius: 8,
                  padding: "0 0.75rem",
                  cursor: "pointer",
                  color: "hsl(var(--secondary-foreground))",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {showPw ? "Verbergen" : "Zeigen"}
              </button>
              <button
                type="button"
                onClick={genPassword}
                title="Sicheres Passwort generieren"
                style={{
                  background: "hsl(var(--primary))",
                  border: "none",
                  borderRadius: 8,
                  padding: "0 0.75rem",
                  cursor: "pointer",
                  color: "hsl(var(--primary-foreground))",
                  fontSize: "0.9rem",
                  flexShrink: 0,
                }}
              >
                ⚄
              </button>
            </div>
          </div>
          <div>
            <label style={labelStyle}>URL</label>
            <input
              style={inputStyle}
              value={form.url}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <div>
            <label style={labelStyle}>Kategorie</label>
            <select
              style={{ ...inputStyle, cursor: "pointer" }}
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {VAULT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Notizen</label>
            <textarea
              style={{ ...inputStyle, resize: "vertical", minHeight: 72 }}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Optionale Notizen…"
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
              : "Eintrag hinzufügen"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function VaultClientPage() {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("alle");
  const [modal, setModal] = useState<{ open: boolean; entry: VaultEntry | null }>({
    open: false,
    entry: null,
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vault/entries");
      const json = await res.json();
      if (json.ok) setEntries(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const openAdd = () => setModal({ open: true, entry: null });
  const openEdit = (e: VaultEntry) => setModal({ open: true, entry: e });
  const closeModal = () => setModal({ open: false, entry: null });

  const handleSaved = () => {
    closeModal();
    fetchEntries();
  };

  const handleDeleteRequest = (id: string) => setDeleteId(id);

  const handleDeleteConfirm = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    try {
      await fetch(`/api/vault/entries/${id}`, { method: "DELETE" });
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      /* ignore */
    }
  };

  const usedCategories = Array.from(new Set(entries.map((e) => e.category)));
  const filterCategories = ["alle", ...usedCategories];

  const filtered = entries.filter((e) => {
    const matchCat = activeCategory === "alle" || e.category === activeCategory;
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      e.label.toLowerCase().includes(q) ||
      (e.username ?? "").toLowerCase().includes(q) ||
      (e.url ?? "").toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
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
            Passwort-Safe
          </h1>
          <p
            style={{
              fontSize: "0.82rem",
              color: "hsl(var(--muted-foreground))",
              margin: "0.25rem 0 0",
            }}
          >
            {entries.length} {entries.length === 1 ? "Eintrag" : "Einträge"} ·
            Ende-zu-Ende AES-256-GCM verschlüsselt
          </p>
        </div>
        <button
          onClick={openAdd}
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
          + Neuer Eintrag
        </button>
      </div>

      {/* Search + category filter */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suchen…"
          style={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            color: "hsl(var(--foreground))",
            padding: "0.5rem 0.875rem",
            fontSize: "0.875rem",
            outline: "none",
            minWidth: 220,
          }}
        />
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {filterCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                background:
                  activeCategory === cat
                    ? "hsl(var(--primary))"
                    : "hsl(var(--secondary))",
                border: "none",
                borderRadius: 20,
                color:
                  activeCategory === cat
                    ? "hsl(var(--primary-foreground))"
                    : "hsl(var(--secondary-foreground))",
                padding: "0.3rem 0.75rem",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Card grid */}
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
      ) : filtered.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            color: "hsl(var(--muted-foreground))",
            padding: "3rem",
          }}
        >
          {entries.length === 0
            ? "Noch keine Einträge. Füge deinen ersten Eintrag hinzu!"
            : "Keine Einträge gefunden."}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "1rem",
          }}
        >
          {filtered.map((entry) => (
            <VaultCard
              key={entry.id}
              entry={entry}
              onEdit={openEdit}
              onDeleteRequest={handleDeleteRequest}
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
            Eintrag wirklich löschen?
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

      {/* Entry modal */}
      {modal.open && (
        <EntryModal
          entry={modal.entry}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
