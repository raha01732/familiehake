"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  console.error(error);
  return (
    <html>
      <body className="p-8">
        <div className="card p-6">
          <h2 className="text-zinc-100 text-xl font-semibold mb-2">Es ist ein Fehler aufgetreten</h2>
          <p className="text-zinc-400 text-sm mb-4">Bitte versuche es erneut. Der Fehler wurde protokolliert.</p>
          <button onClick={reset} className="rounded-xl border border-zinc-700 text-zinc-200 text-sm px-3 py-2">
            Neu laden
          </button>
        </div>
      </body>
    </html>
  );
}
