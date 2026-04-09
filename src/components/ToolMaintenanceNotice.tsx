// /workspace/familiehake/src/components/ToolMaintenanceNotice.tsx
export default function ToolMaintenanceNotice({
  message,
}: {
  message?: string | null;
}) {
  return (
    <section className="p-6">
      <div className="rounded-xl border border-amber-700/40 bg-amber-950/30 p-5">
        <h1 className="text-lg font-semibold text-amber-200">Tool derzeit deaktiviert</h1>
        <p className="mt-2 text-sm text-amber-100/90">
          {message?.trim() || "Wartungsarbeiten laufen aktuell. Bitte versuche es später erneut."}
        </p>
      </div>
    </section>
  );
}
