"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ChefHat,
  Salad,
  Sparkles,
  Heart,
  Trash2,
  Plus,
  X,
  Loader2,
  Search,
  ExternalLink,
  Clock,
  Users,
  Globe,
} from "lucide-react";
import type { NutritionRecipe } from "@/app/api/nutrition/recipes/route";
import type { NutritionTipResponse } from "@/app/api/nutrition/tips/route";
import type { NutritionFavorite } from "@/app/api/nutrition/favorites/route";
import { DIETS, ALLERGIES } from "@/lib/nutrition/constants";

type TabKey = "search" | "tips" | "favorites";

const TABS: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { key: "search", label: "Zutaten-Suche", icon: ChefHat },
  { key: "tips", label: "Ernährungstipps", icon: Sparkles },
  { key: "favorites", label: "Favoriten", icon: Heart },
];

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function NutritionClientPage() {
  const [tab, setTab] = useState<TabKey>("search");

  // Gemeinsame Präferenzen — werden bei jeder Anfrage verwendet
  const [diet, setDiet] = useState<string>("normal");
  const [allergies, setAllergies] = useState<string[]>([]);

  return (
    <section className="flex flex-col gap-6 p-4 sm:p-6 animate-fade-up">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Salad size={22} style={{ color: "hsl(var(--primary))" }} aria-hidden />
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">Ernährung & Rezepte</span>
          </h1>
        </div>
        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          Zutaten eingeben, passende Rezepte finden, Ernährungstipps bekommen.
        </p>
      </header>

      <PreferenceBar
        diet={diet}
        setDiet={setDiet}
        allergies={allergies}
        setAllergies={setAllergies}
      />

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
                background: active
                  ? "hsl(var(--primary) / 0.15)"
                  : "hsl(var(--card))",
                color: active
                  ? "hsl(var(--primary))"
                  : "hsl(var(--muted-foreground))",
                border: `1px solid ${active ? "hsl(var(--primary) / 0.4)" : "hsl(var(--border))"}`,
              }}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === "search" && <SearchTab diet={diet} allergies={allergies} />}
      {tab === "tips" && <TipsTab diet={diet} allergies={allergies} />}
      {tab === "favorites" && <FavoritesTab />}
    </section>
  );
}

// ─── Shared Präferenzen-Leiste ────────────────────────────────────────────────

function PreferenceBar({
  diet,
  setDiet,
  allergies,
  setAllergies,
}: {
  diet: string;
  setDiet: (v: string) => void;
  allergies: string[];
  setAllergies: (v: string[]) => void;
}) {
  const toggleAllergy = (id: string) => {
    setAllergies(
      allergies.includes(id) ? allergies.filter((a) => a !== id) : [...allergies, id],
    );
  };

  return (
    <div
      className="flex flex-col gap-3 rounded-xl p-4"
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
          Ernährungsweise
        </span>
        <div className="flex flex-wrap gap-1.5">
          {DIETS.map((d) => {
            const active = diet === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setDiet(d.id)}
                className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  background: active ? "hsl(var(--primary) / 0.15)" : "hsl(var(--muted))",
                  color: active ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                  border: `1px solid ${active ? "hsl(var(--primary) / 0.4)" : "transparent"}`,
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
          Allergien / Unverträglichkeiten
        </span>
        <div className="flex flex-wrap gap-1.5">
          {ALLERGIES.map((a) => {
            const active = allergies.includes(a.id);
            return (
              <button
                key={a.id}
                onClick={() => toggleAllergy(a.id)}
                className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  background: active ? "hsl(0 72% 55% / 0.15)" : "hsl(var(--muted))",
                  color: active ? "hsl(0 72% 55%)" : "hsl(var(--foreground))",
                  border: `1px solid ${active ? "hsl(0 72% 55% / 0.4)" : "transparent"}`,
                }}
              >
                {a.label}
              </button>
            );
          })}
          {allergies.length > 0 && (
            <button
              onClick={() => setAllergies([])}
              className="rounded-full px-2.5 py-1 text-xs"
              style={{ color: "hsl(var(--muted-foreground))" }}
              title="Alle entfernen"
            >
              zurücksetzen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab 1: Zutaten-Suche ─────────────────────────────────────────────────────

function SearchTab({ diet, allergies }: { diet: string; allergies: string[] }) {
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [recipes, setRecipes] = useState<NutritionRecipe[]>([]);
  const [source, setSource] = useState<"spoonacular" | "ai" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const addIngredient = () => {
    const v = input.trim().toLowerCase();
    if (!v || ingredients.includes(v)) {
      setInput("");
      return;
    }
    setIngredients([...ingredients, v]);
    setInput("");
  };

  const removeIngredient = (i: string) => {
    setIngredients(ingredients.filter((x) => x !== i));
  };

  const search = async () => {
    if (ingredients.length === 0) return;
    setLoading(true);
    setError(null);
    setRecipes([]);
    setSource(null);
    try {
      const params = new URLSearchParams({
        ingredients: ingredients.join(","),
        diet,
      });
      if (allergies.length > 0) params.set("allergies", allergies.join(","));
      const res = await fetch(`/api/nutrition/recipes?${params}`);
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Suche fehlgeschlagen.");
        return;
      }
      setRecipes(json.data ?? []);
      setSource(json.source);
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const saveFavorite = async (r: NutritionRecipe) => {
    try {
      const res = await fetch("/api/nutrition/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: r.source,
          external_id: r.externalId,
          title: r.title,
          image_url: r.image,
          summary: r.summary,
          ingredients: r.ingredients,
          instructions: r.instructions,
          ready_in_minutes: r.readyInMinutes,
          servings: r.servings,
          diet,
          source_url: r.sourceUrl,
        }),
      });
      const json = await res.json();
      if (!json.ok && json.error !== "already saved") {
        alert("Konnte nicht gespeichert werden: " + (json.error || ""));
      }
    } catch {
      alert("Netzwerkfehler beim Speichern.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex flex-col gap-3 rounded-xl p-4"
        style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
      >
        <label className="text-sm font-medium">Zutaten hinzufügen</label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="z. B. Tomaten"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addIngredient();
              }
            }}
            className="flex-1 rounded-lg px-3 py-2 text-sm"
            style={{
              background: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              color: "hsl(var(--foreground))",
            }}
          />
          <button
            onClick={addIngredient}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium"
            style={{
              background: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
            }}
          >
            <Plus size={15} /> Hinzu
          </button>
        </div>
        {ingredients.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {ingredients.map((i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  background: "hsl(var(--primary) / 0.12)",
                  color: "hsl(var(--primary))",
                }}
              >
                {i}
                <button
                  onClick={() => removeIngredient(i)}
                  className="-mr-1 rounded-full p-0.5 hover:bg-black/10"
                  aria-label={`${i} entfernen`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <button
          onClick={search}
          disabled={ingredients.length === 0 || loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{
            background: "hsl(var(--primary))",
            color: "hsl(var(--primary-foreground))",
          }}
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          Rezepte finden
        </button>
      </div>

      {error && <ErrorBox message={error} />}

      {source && (
        <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          Quelle:{" "}
          {source === "spoonacular"
            ? "Spoonacular-Datenbank"
            : "KI-generiert — bitte vor dem Kochen auf Plausibilität prüfen"}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {recipes.map((r, idx) => {
          const key = r.externalId ?? `${r.source}-${idx}`;
          const isOpen = expanded.has(key);
          return (
            <article
              key={key}
              className="flex flex-col gap-3 rounded-xl p-4"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
            >
              {r.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.image}
                  alt=""
                  className="h-36 w-full rounded-lg object-cover"
                />
              )}
              <h3 className="text-sm font-semibold leading-snug">{r.title}</h3>

              <div className="flex flex-wrap gap-2 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                {r.readyInMinutes != null && (
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} /> {r.readyInMinutes} min
                  </span>
                )}
                {r.servings != null && (
                  <span className="inline-flex items-center gap-1">
                    <Users size={12} /> {r.servings}
                  </span>
                )}
              </div>

              {r.summary && (
                <p className="line-clamp-3 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {r.summary}
                </p>
              )}

              {isOpen && (
                <div className="flex flex-col gap-2 border-t pt-2" style={{ borderColor: "hsl(var(--border))" }}>
                  {r.ingredients.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs font-semibold">Zutaten</div>
                      <ul className="ml-4 list-disc text-xs" style={{ color: "hsl(var(--foreground))" }}>
                        {r.ingredients.map((ing, i) => (
                          <li key={i}>{ing}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {r.instructions && (
                    <div>
                      <div className="mb-1 text-xs font-semibold">Zubereitung</div>
                      <p className="whitespace-pre-line text-xs">{r.instructions}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-auto flex gap-2">
                <button
                  onClick={() => toggleExpand(key)}
                  className="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium"
                  style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}
                >
                  {isOpen ? "Weniger" : "Details"}
                </button>
                <button
                  onClick={() => saveFavorite(r)}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium"
                  style={{ background: "hsl(0 72% 55% / 0.12)", color: "hsl(0 72% 55%)" }}
                  title="Als Favorit speichern"
                >
                  <Heart size={12} /> Speichern
                </button>
                {r.sourceUrl && (
                  <a
                    href={r.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}
                    title="Original-Quelle"
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {!loading && recipes.length === 0 && !error && (
        <EmptyState
          icon={ChefHat}
          title="Noch keine Rezepte"
          description="Füge ein paar Zutaten hinzu und starte die Suche."
        />
      )}
    </div>
  );
}

// ─── Tab 2: Ernährungstipps ───────────────────────────────────────────────────

function TipsTab({ diet, allergies }: { diet: string; allergies: string[] }) {
  const [question, setQuestion] = useState("");
  const [useWeb, setUseWeb] = useState(true);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<NutritionTipResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suggestions = [
    "Ideen für ein ausgewogenes Familienfrühstück",
    "Wie komme ich auf meine 30 g Ballaststoffe pro Tag?",
    "Gesunde Snacks für nachmittags",
    "Abends leicht essen — was eignet sich?",
  ];

  const ask = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text) return;
    setQuestion(text);
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/nutrition/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, diet, allergies, useWeb }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Antwort konnte nicht geladen werden.");
        return;
      }
      setAnswer(json.data);
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex flex-col gap-3 rounded-xl p-4"
        style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
      >
        <label className="text-sm font-medium">Deine Frage</label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="z. B. Welche eiweißreichen Frühstücksideen passen zu meiner Ernährung?"
          className="w-full resize-y rounded-lg px-3 py-2 text-sm"
          style={{
            background: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            color: "hsl(var(--foreground))",
          }}
        />
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              disabled={loading}
              className="rounded-full px-3 py-1 text-xs disabled:opacity-50"
              style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <label className="inline-flex items-center gap-2 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            <input
              type="checkbox"
              checked={useWeb}
              onChange={(e) => setUseWeb(e.target.checked)}
            />
            <Globe size={12} /> Aktuelle Websuche einbeziehen
          </label>
          <button
            onClick={() => ask()}
            disabled={loading || !question.trim()}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{
              background: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
            }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Fragen
          </button>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {answer && (
        <div
          className="flex flex-col gap-3 rounded-xl p-4"
          style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={14} style={{ color: "hsl(var(--primary))" }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
              Antwort
            </span>
            {answer.usedWebSearch && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: "hsl(var(--primary) / 0.15)", color: "hsl(var(--primary))" }}
              >
                <Globe size={10} /> mit Websuche
              </span>
            )}
          </div>
          <div className="whitespace-pre-line text-sm leading-relaxed">{answer.answer}</div>
          {answer.sources.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t pt-3" style={{ borderColor: "hsl(var(--border))" }}>
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
                Quellen
              </div>
              <ol className="flex flex-col gap-1 text-xs">
                {answer.sources.map((s, i) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:underline"
                      style={{ color: "hsl(var(--primary))" }}
                    >
                      [{i + 1}] {s.title || s.url}
                      <ExternalLink size={10} />
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: Favoriten ─────────────────────────────────────────────────────────

function FavoritesTab() {
  const [items, setItems] = useState<NutritionFavorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/nutrition/favorites");
      const json = await res.json();
      if (json.ok) setItems(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm("Favorit wirklich löschen?")) return;
    const res = await fetch(`/api/nutrition/favorites/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading) return <div className="p-6 text-center text-sm">Lade …</div>;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="Keine Favoriten"
        description="Speichere Rezepte aus der Zutaten-Suche, damit sie hier auftauchen."
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((f) => {
        const isOpen = expanded.has(f.id);
        return (
          <article
            key={f.id}
            className="flex flex-col gap-3 rounded-xl p-4"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
          >
            {f.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.image_url} alt="" className="h-36 w-full rounded-lg object-cover" />
            )}
            <h3 className="text-sm font-semibold">{f.title}</h3>
            <div className="flex flex-wrap gap-2 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              {f.ready_in_minutes != null && (
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} /> {f.ready_in_minutes} min
                </span>
              )}
              {f.servings != null && (
                <span className="inline-flex items-center gap-1">
                  <Users size={12} /> {f.servings}
                </span>
              )}
              <span
                className="rounded-full px-2 py-0.5"
                style={{ background: "hsl(var(--muted))" }}
              >
                {f.source === "spoonacular" ? "Datenbank" : "KI"}
              </span>
            </div>
            {f.summary && (
              <p className="line-clamp-3 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                {f.summary}
              </p>
            )}
            {isOpen && (
              <div className="flex flex-col gap-2 border-t pt-2" style={{ borderColor: "hsl(var(--border))" }}>
                {f.ingredients.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs font-semibold">Zutaten</div>
                    <ul className="ml-4 list-disc text-xs">
                      {f.ingredients.map((ing, i) => (
                        <li key={i}>{ing}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {f.instructions && (
                  <div>
                    <div className="mb-1 text-xs font-semibold">Zubereitung</div>
                    <p className="whitespace-pre-line text-xs">{f.instructions}</p>
                  </div>
                )}
              </div>
            )}
            <div className="mt-auto flex gap-2">
              <button
                onClick={() => toggle(f.id)}
                className="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}
              >
                {isOpen ? "Weniger" : "Details"}
              </button>
              {f.source_url && (
                <a
                  href={f.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium"
                  style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}
                >
                  <ExternalLink size={12} />
                </a>
              )}
              <button
                onClick={() => remove(f.id)}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{ background: "hsl(0 72% 55% / 0.12)", color: "hsl(0 72% 55%)" }}
                title="Löschen"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ─── Shared UI-Bausteine ──────────────────────────────────────────────────────

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl p-3 text-sm"
      style={{
        background: "hsl(0 72% 55% / 0.08)",
        border: "1px solid hsl(0 72% 55% / 0.3)",
        color: "hsl(0 72% 55%)",
      }}
    >
      {message}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  description: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-xl p-10 text-center"
      style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
    >
      <div
        className="flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
      >
        <Icon size={20} />
      </div>
      <div className="font-semibold">{title}</div>
      <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
        {description}
      </div>
    </div>
  );
}
