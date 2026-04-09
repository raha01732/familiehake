// src/app/loading.tsx
export default function GlobalLoading() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/40 backdrop-blur-[1px]">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-300/30 border-t-zinc-100" aria-label="Seite lädt" />
    </div>
  );
}
