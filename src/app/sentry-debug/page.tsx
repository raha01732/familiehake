"use client";

export default function SentryDebugPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl text-zinc-100 font-semibold mb-2">Sentry Debug</h1>
      <button
        className="rounded-xl border border-zinc-700 text-zinc-200 text-sm px-3 py-2 hover:bg-zinc-800/60"
        onClick={() => {
          // absichtlich ein Fehler im Client
          // @ts-expect-error
          window.__boom.bang = 1;
        }}
      >
        Client Error werfen
      </button>
    </div>
  );
}
