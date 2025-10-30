import { RoleGate } from "@/components/RoleGate";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export const metadata = { title: "Journal" };

async function listEntries(userId: string) {
  const sb = createAdminClient();
  const { data } = await sb
    .from("journal_entries")
    .select("id, title, content, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

async function createEntry(formData: FormData) {
  "use server";
  const { userId, sessionId } = auth();
  if (!userId) return;

  const title = (formData.get("title") as string)?.trim().slice(0, 160) || "Ohne Titel";
  const content = (formData.get("content") as string)?.trim() || "";

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("journal_entries")
    .insert({ user_id: userId, title, content })
    .select("id")
    .single();

  await logAudit({
    action: "journal_create",
    actorUserId: userId,
    actorEmail: null,
    target: data?.id ?? null,
    detail: { title },
  });

  revalidatePath("/tools/journal");
}

async function deleteEntry(formData: FormData) {
  "use server";
  const { userId } = auth();
  if (!userId) return;

  const id = formData.get("id") as string;
  const sb = createAdminClient();

  // Ownership prüfen (serverseitig)
  const { data: row } = await sb.from("journal_entries").select("user_id, title").eq("id", id).single();
  if (!row || row.user_id !== userId) return;

  await sb.from("journal_entries").delete().eq("id", id);
  await logAudit({
    action: "journal_delete",
    actorUserId: userId,
    actorEmail: null,
    target: id,
    detail: { title: row.title },
  });

  revalidatePath("/tools/journal");
}

export default async function JournalPage() {
  const { userId } = auth();
  if (!userId) {
    return (
      <RoleGate routeKey="tools/journal">
        <div className="card p-6">Bitte anmelden.</div>
      </RoleGate>
    );
  }

  const entries = await listEntries(userId);

  return (
    <RoleGate routeKey="tools/journal">
      <section className="grid gap-6">
        <div className="card p-6">
          <h1 className="text-xl font-semibold text-zinc-100 mb-3">Neuer Eintrag</h1>
          <form action={createEntry} className="grid gap-3">
            <input
              name="title"
              placeholder="Titel"
              className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
            />
            <textarea
              name="content"
              rows={6}
              placeholder="Was möchtest du festhalten?"
              className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
            />
            <div>
              <button className="rounded-xl border border-zinc-700 text-zinc-200 text-sm px-3 py-2 hover:bg-zinc-800/60">
                Speichern
              </button>
            </div>
          </form>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-zinc-100 mb-3">Deine Einträge</h2>
          <div className="grid gap-3">
            {entries.map((e: any) => (
              <div key={e.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-zinc-100 font-medium">{e.title}</div>
                    <div className="text-[11px] text-zinc-500">
                      {new Date(e.created_at).toLocaleString()}
                    </div>
                  </div>
                  <form action={deleteEntry}>
                    <input type="hidden" name="id" value={e.id} />
                    <button className="rounded-lg border border-red-700 text-red-300 text-xs px-2 py-1 hover:bg-red-900/30">
                      Löschen
                    </button>
                  </form>
                </div>
                <div className="text-sm text-zinc-300 mt-3 whitespace-pre-wrap">{e.content}</div>
              </div>
            ))}
            {entries.length === 0 && (
              <div className="text-[12px] text-zinc-500">Noch keine Einträge.</div>
            )}
          </div>
        </div>
      </section>
    </RoleGate>
  );
}
