// /workspace/familiehake/src/components/PreviewNotice.tsx
import { isPreviewEnvironment } from "@/lib/env";

type PreviewPlaceholderProps = {
  title?: string;
  description?: string;
  fields?: string[];
};

export function PreviewTopBanner() {
  if (!isPreviewEnvironment()) return null;

  return (
    <div className="mb-4 rounded-xl border border-amber-500/50 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
      <strong className="mr-1">Preview-Umgebung:</strong>
      Diese Version zeigt absichtlich reduzierte Inhalte. Externe Tools (z. B. Datenbank/Upstash/Sentry) liefern hier
      keine echten Daten.
    </div>
  );
}

export function PreviewPlaceholder({
  title = "Preview-Version",
  description = "In der Preview werden keine produktiven Daten geladen.",
  fields = ["Datenquellen", "Externe Tools", "Live-Auswertungen"],
}: PreviewPlaceholderProps) {
  if (!isPreviewEnvironment()) return null;

  return (
    <section className="grid gap-4">
      <div className="rounded-xl border border-amber-500/50 bg-amber-400/10 p-4">
        <h2 className="text-base font-semibold text-amber-100">{title}</h2>
        <p className="mt-1 text-sm text-amber-50/90">{description}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <div key={field} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{field}</div>
            <div className="mt-2 text-sm text-zinc-300">
              Preview aktiv: Hier würden echte Daten erscheinen. In dieser Umgebung wird stattdessen ein Hinweis
              angezeigt.
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
