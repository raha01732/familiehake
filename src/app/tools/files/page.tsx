import { RoleGate } from "@/components/RoleGate";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export const metadata = { title: "Dateien" };

async function listFiles(userId: string) {
  const sb = createAdminClient();
  const { data } = await sb
    .from("files_meta")
    .select("id, storage_path, file_name, file_size, mime_type, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

async function deleteFile(formData: FormData) {
  "use server";
  const { userId } = auth();
  if (!userId) return;

  const id = formData.get("id") as string;
  const sb = createAdminClient();

  const { data: row } = await sb.from("files_meta").select("storage_path, user_id, file_name").eq("id", id).single();
  if (!row || row.user_id !== userId) return;

  await sb.storage.from("files").remove([row.storage_path]);
  await sb.from("files_meta").delete().eq("id", id);

  await logAudit({
    action: "file_delete",
    actorUserId: userId,
    actorEmail: null,
    target: row.storage_path,
    detail: { file: row.file_name },
  });

  revalidatePath("/tools/files");
}

export default async function FilesPage() {
  const { userId } = auth();
  if (!userId) {
    return (
      <RoleGate routeKey="tools/files">
        <div className="card p-6">Bitte anmelden.</div>
      </RoleGate>
    );
  }

  const files = await listFiles(userId);

  return (
    <RoleGate routeKey="tools/files">
      <section className="grid gap-6">
        <div className="card p-6">
          <h1 className="text-xl font-semibold text-zinc-100 mb-3">Datei hochladen</h1>
          <form action="/api/upload" method="post" encType="multipart/form-data" className="flex items-center gap-3">
            <input
              type="file"
              name="file"
              className="text-sm text-zinc-300"
              required
            />
            <button className="rounded-xl border border-zinc-700 text-zinc-200 text-sm px-3 py-2 hover:bg-zinc-800/60">
              Hochladen
            </button>
          </form>
          <div className="text-[11px] text-zinc-500 mt-2">Max. Größe gemäß Vercel/Supabase Limits.</div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-zinc-100 mb-3">Deine Dateien</h2>
          <div className="grid gap-3">
            {files.map((f: any) => (
              <div key={f.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex items-center justify-between">
                <div>
                  <div className="text-zinc-100 text-sm">{f.file_name}</div>
                  <div className="text-[11px] text-zinc-500">
                    {(f.file_size/1024).toFixed(1)} KB • {f.mime_type || "—"} • {new Date(f.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`/api/files/get?path=${encodeURIComponent(f.storage_path)}`}
                    className="rounded-lg border border-zinc-700 text-zinc-200 text-xs px-2 py-1 hover:bg-zinc-800/60"
                  >
                    Download
                  </a>
                  <form action={deleteFile}>
                    <input type="hidden" name="id" value={f.id} />
                    <button className="rounded-lg border border-red-700 text-red-300 text-xs px-2 py-1 hover:bg-red-900/30">
                      Löschen
                    </button>
                  </form>
                </div>
              </div>
            ))}
            {files.length === 0 && (
              <div className="text-[12px] text-zinc-500">Noch keine Dateien.</div>
            )}
          </div>
        </div>
      </section>
    </RoleGate>
  );
}
