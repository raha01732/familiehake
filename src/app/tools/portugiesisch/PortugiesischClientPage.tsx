"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Languages,
  RotateCcw,
  Check,
  X,
  Sparkles,
  BookOpen,
  Loader2,
  ArrowRight,
} from "lucide-react";
import type { PortugueseQueueResponse, PortugueseQueueWord } from "@/app/api/portuguese/queue/route";
import type { PortugueseExercise } from "@/app/api/portuguese/exercises/route";
import { unitTitle } from "@/lib/portuguese/units";

type TabKey = "review" | "new" | "ai";

const TABS: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { key: "review", label: "Karteikarten üben", icon: RotateCcw },
  { key: "new", label: "Neue Vokabeln", icon: BookOpen },
  { key: "ai", label: "KI-Übungen", icon: Sparkles },
];

export default function PortugiesischClientPage() {
  const [tab, setTab] = useState<TabKey>("review");
  const [queue, setQueue] = useState<PortugueseQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/portuguese/queue", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setQueue(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(loadQueue, 0);
    return () => clearTimeout(id);
  }, [loadQueue]);

  return (
    <section className="flex flex-col gap-6 p-4 sm:p-6 animate-fade-up">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Languages size={22} style={{ color: "hsl(var(--primary))" }} aria-hidden />
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">Portugiesisch</span>
          </h1>
        </div>
        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          Vokabeln lernen mit Spaced Repetition & KI-generierten Übungen.
        </p>
      </header>

      <StatsBar queue={queue} loading={loading} />

      <nav className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors"
              style={{
                background: active ? "hsl(var(--primary) / 0.15)" : "hsl(var(--card))",
                color: active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                border: `1px solid ${active ? "hsl(var(--primary) / 0.4)" : "hsl(var(--border))"}`,
              }}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === "review" && (
        <ReviewTab queue={queue} loading={loading} onReviewed={loadQueue} />
      )}
      {tab === "new" && <NewWordsTab queue={queue} loading={loading} onLearned={loadQueue} />}
      {tab === "ai" && <ExercisesTab />}
    </section>
  );
}

// ─── Stats-Leiste ───────────────────────────────────────────────────

function StatsBar({ queue, loading }: { queue: PortugueseQueueResponse | null; loading: boolean }) {
  const stats = queue?.stats;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Fällig heute" value={loading ? "…" : (stats?.dueCount ?? 0)} />
      <StatCard label="Begonnen" value={loading ? "…" : (stats?.started ?? 0)} />
      <StatCard label="Gemeistert" value={loading ? "…" : (stats?.mastered ?? 0)} />
      <StatCard label="Gesamt-Vokabeln" value={loading ? "…" : (stats?.totalWords ?? 0)} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-3.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
        {label}
      </div>
      <div className="mt-1 text-xl font-bold" style={{ color: "hsl(var(--foreground))" }}>
        {value}
      </div>
    </div>
  );
}

// ─── Tab: Karteikarten üben ─────────────────────────────────────────

function ReviewTab({
  queue,
  loading,
  onReviewed,
}: {
  queue: PortugueseQueueResponse | null;
  loading: boolean;
  onReviewed: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const due = queue?.due ?? [];
  const current = due[0];

  const submit = async (correct: boolean) => {
    if (!current || submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/portuguese/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wordId: current.id, correct }),
      });
      setRevealed(false);
      onReviewed();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <EmptyState icon={Loader2} text="Lade Karteikarten…" spin />;

  if (!current) {
    return (
      <EmptyState
        icon={Check}
        text="Keine Wiederholungen fällig. Schau gerne unter „Neue Vokabeln“ vorbei oder komm später wieder."
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
        Einheit {current.unit} · {unitTitle(current.unit)} · noch {due.length} fällig
      </p>

      <div
        className="card flex min-h-[220px] w-full max-w-md flex-col items-center justify-center gap-3 p-8 text-center"
        onClick={() => !revealed && setRevealed(true)}
        style={{ cursor: revealed ? "default" : "pointer" }}
      >
        <p className="text-2xl font-bold" style={{ color: "hsl(var(--foreground))" }}>
          {current.term_pt}
        </p>
        {!revealed ? (
          <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            Zum Umdrehen tippen
          </p>
        ) : (
          <>
            <p className="text-lg font-semibold" style={{ color: "hsl(var(--primary))" }}>
              {current.term_de}
            </p>
            {current.example_pt && (
              <div className="mt-2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                <p>{current.example_pt}</p>
                <p className="italic">{current.example_de}</p>
              </div>
            )}
          </>
        )}
      </div>

      {revealed && (
        <div className="flex gap-3">
          <button
            onClick={() => submit(false)}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
            style={{
              background: "hsl(0 84% 60% / 0.1)",
              color: "hsl(0 72% 51%)",
              border: "1px solid hsl(0 84% 60% / 0.3)",
            }}
          >
            <X size={15} /> Nochmal üben
          </button>
          <button
            onClick={() => submit(true)}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
            style={{
              background: "hsl(142 71% 45% / 0.12)",
              color: "hsl(142 71% 35%)",
              border: "1px solid hsl(142 71% 45% / 0.35)",
            }}
          >
            <Check size={15} /> Wusste ich
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Neue Vokabeln ─────────────────────────────────────────────

function NewWordsTab({
  queue,
  loading,
  onLearned,
}: {
  queue: PortugueseQueueResponse | null;
  loading: boolean;
  onLearned: () => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const words = queue?.new ?? [];

  const markLearned = async (word: PortugueseQueueWord) => {
    setPendingId(word.id);
    try {
      await fetch("/api/portuguese/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wordId: word.id, correct: true }),
      });
      onLearned();
    } finally {
      setPendingId(null);
    }
  };

  if (loading) return <EmptyState icon={Loader2} text="Lade neue Vokabeln…" spin />;

  if (words.length === 0) {
    return (
      <EmptyState
        icon={Check}
        text="Du hast alle verfügbaren Vokabeln bereits ins Training aufgenommen. Schau bei „Karteikarten üben“ vorbei."
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {words.map((w) => (
        <div key={w.id} className="card flex flex-col gap-2 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
            Einheit {w.unit} · {unitTitle(w.unit)}
          </p>
          <p className="text-lg font-bold" style={{ color: "hsl(var(--foreground))" }}>{w.term_pt}</p>
          <p className="text-sm font-medium" style={{ color: "hsl(var(--primary))" }}>{w.term_de}</p>
          {w.example_pt && (
            <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              <p>{w.example_pt}</p>
              <p className="italic">{w.example_de}</p>
            </div>
          )}
          <button
            onClick={() => markLearned(w)}
            disabled={pendingId === w.id}
            className="mt-1 inline-flex w-fit items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold"
            style={{
              background: "hsl(var(--primary) / 0.12)",
              color: "hsl(var(--primary))",
              border: "1px solid hsl(var(--primary) / 0.3)",
            }}
          >
            {pendingId === w.id ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
            Ins Training aufnehmen
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Tab: KI-Übungen ────────────────────────────────────────────────

function ExercisesTab() {
  const [exercises, setExercises] = useState<PortugueseExercise[] | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setExercises(null);
    setIndex(0);
    setSelected(null);
    setScore(0);
    try {
      const res = await fetch("/api/portuguese/exercises", { method: "POST" });
      const json = await res.json();
      if (!json.ok) {
        setError(
          res.status === 422
            ? `Lerne zuerst mindestens ${json.minWords ?? 5} Vokabeln, bevor KI-Übungen verfügbar sind.`
            : "Übungen konnten gerade nicht erstellt werden. Versuch's gleich nochmal.",
        );
        return;
      }
      setExercises(json.data);
    } catch {
      setError("Übungen konnten gerade nicht erstellt werden. Versuch's gleich nochmal.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <EmptyState icon={Loader2} text="KI generiert Übungen…" spin />;

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3">
        <EmptyState icon={Sparkles} text={error} />
        <button onClick={generate} className="text-xs font-medium underline" style={{ color: "hsl(var(--primary))" }}>
          Erneut versuchen
        </button>
      </div>
    );
  }

  if (!exercises) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <p className="max-w-sm text-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          Die KI erstellt kurze Übungen aus den Vokabeln, die du bereits ins Training aufgenommen hast.
        </p>
        <button
          onClick={generate}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
        >
          <Sparkles size={15} /> Übungen generieren
        </button>
      </div>
    );
  }

  if (index >= exercises.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <p className="text-lg font-semibold" style={{ color: "hsl(var(--foreground))" }}>
          {score} / {exercises.length} richtig
        </p>
        <button
          onClick={generate}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
        >
          <Sparkles size={15} /> Neue Übungen generieren
        </button>
      </div>
    );
  }

  const current = exercises[index];
  const answered = selected !== null;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
        Frage {index + 1} / {exercises.length}
      </p>
      <div className="card p-5">
        <p className="mb-4 font-semibold" style={{ color: "hsl(var(--foreground))" }}>{current.question}</p>
        <div className="flex flex-col gap-2">
          {current.choices.map((choice, i) => {
            const isCorrect = i === current.correctIndex;
            const isSelected = i === selected;
            const showState = answered && (isSelected || isCorrect);
            return (
              <button
                key={i}
                disabled={answered}
                onClick={() => {
                  setSelected(i);
                  if (i === current.correctIndex) setScore((s) => s + 1);
                }}
                className="rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors"
                style={{
                  borderColor: showState
                    ? isCorrect
                      ? "hsl(142 71% 45% / 0.5)"
                      : "hsl(0 84% 60% / 0.5)"
                    : "hsl(var(--border))",
                  background: showState
                    ? isCorrect
                      ? "hsl(142 71% 45% / 0.1)"
                      : "hsl(0 84% 60% / 0.08)"
                    : "hsl(var(--card))",
                  color: "hsl(var(--foreground))",
                }}
              >
                {choice}
              </button>
            );
          })}
        </div>
        {answered && (
          <p className="mt-3 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            {current.explanation}
          </p>
        )}
      </div>
      {answered && (
        <button
          onClick={() => {
            setIndex((i) => i + 1);
            setSelected(null);
          }}
          className="inline-flex w-fit items-center gap-2 self-end rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
        >
          Weiter <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}

// ─── Shared ─────────────────────────────────────────────────────────

function EmptyState({
  icon: Icon,
  text,
  spin = false,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  text: string;
  spin?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <Icon size={26} className={spin ? "animate-spin" : undefined} />
      <p className="max-w-sm text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>{text}</p>
    </div>
  );
}
