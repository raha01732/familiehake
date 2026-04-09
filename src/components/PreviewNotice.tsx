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
    <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
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
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
        <h2 className="text-base font-semibold text-amber-900">{title}</h2>
        <p className="mt-1 text-sm text-amber-800">{description}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <div key={field} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-slate-500">{field}</div>
            <div className="mt-2 text-sm text-slate-700">
              Preview aktiv: Hier würden echte Daten erscheinen. In dieser Umgebung wird stattdessen ein Hinweis
              angezeigt.
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
