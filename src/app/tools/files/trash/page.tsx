/**src/app/tools/files/trash/page.tsx**/

import  RoleGate from "@/components/RoleGate";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import Link from "next/link";

export const metadata = { title: "Papierkorb" };

type FileRow = {
  id: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  deleted_at: string | null;
};

type FolderRow = {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  deleted_at: string | null;
};

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/* ======= Actions ======= */

async function restoreFileAction(formData: FormData) {
  "use server";
  const { userId } = auth();
  if (!userId) return;
  const id = formData.get("id") as string;
  if (!id) return;

  const sb = createAdminClient();
  const { data: row } = await sb.from("files_meta").select("id,user_id").eq("id", id).single();
  if (!row || row.user_id !== userId) return;

  await sb.from("files_meta").update({ deleted_at: null }).eq("id", id);

  try {
    await logAudit({ action: "login_success", actorUserId: userId, actorEmail: null, target: "file_restore", detail: { id } });
  } catch {}

  revalidatePath("/tools/files/trash");
}

async function hardDeleteFileAction(formData: FormData) {
  "use server";
  const { userId } = auth();
  if (!userId) return;
  const id = formData.get("id") as string;
  if (!id) return;

  const sb = createAdminClient();
  const { data: row } = await sb
    .from("files_meta")
    .select("storage_path, user_id, file_name")
    .eq("id", id)
    .single();
  if (!row || row.user_id !== userId) return;

  await sb.storage.from("files").remove([row.storage_path]);
  await sb.from("files_meta").delete().eq("id", id);

  try {
    await logAudit({
      action: "file_delete",
      actorUserId: userId,
      actorEmail: null,
      target: row.storage_path,
      detail: { file: row.file_name, hard: true, from: "trash" },
    });
  } catch {}

  revalidatePath("/tools/files/trash");
}

async function restoreFolderAction(formData: FormData) {
  "use server";
  const { userId } = auth();
  if (!userId) return;
  const folderId = formData.get("folderId") as string;
  if (!folderId) return;

  const sb = createAdminClient();
  const { data: f } = await sb.from("folders").select("id,user_id").eq("id", folderId).single();
  if (!f || f.user_id !== userId) return;

  await sb.from("folders").update({ deleted_at: null }).eq("id", folderId);

  try {
    await logAudit({ action: "login_success", actorUserId: userId, actorEmail: null, target: "folder_restore", detail: { folderId } });
  } catch {}

  revalidatePath("/tools/files/trash");
}

async function hardDeleteFolderAction(formData: FormData) {
  "use server";
  const { userId } = auth();
  if (!userId) return;
  const folderId = formData.get("folderId") as string;
  if (!folderId) return;

  const sb = createAdminClient();

  // Nur leere Ordner endgültig löschen (sonst vorher Inhalte entfernen)
  const [{ count: subFolders }, { count: subFiles }] = await Promise.all([
    sb.from("folders").select("id", { count: "exact", head: true }).eq("parent_id", folderId),
    sb.from("files_meta").select("id", { count: "exact", head: true }).eq("folder_id", folderId),
  ]);
  if ((subFolders ?? 0) > 0 || (subFiles ?? 0) > 0) return;

  const { data: f } = await sb.from("folders").select("id,user_id").eq("id", folderId).single();
  if (!f || f.user_id !== userId) return;

  await sb.from("folders").delete().eq("id", folderId);

  try {
    await logAudit({ action: "login_success", actorUserId: userId, actorEmail: null, target: "folder_hard_delete", detail: { folderId } });
  } catch {}

  revalidatePath("/tools/files/trash");
}

/* ======= Page ======= */

export default async function TrashPage() {
  const { userId } = auth();
  if (!userId) {
    return (
      <RoleGate routeKey="tools/files">
        <div className="card p-6">Bitte anmelden.</div>
      </RoleGate>
    );
  }

  const sb = createAdminClient();

  const [{ data: folders }, { data: files }] = await Promise.all([
    sb
      .from("folders")
      .select("id,user_id,name,parent_id,deleted_at")
      .eq("user_id", userId)
      .not("deleted_at", "is", null)
      .order("name", { ascending: true }),
    sb
      .from("files_meta")
      .select("id,storage_path,file_name,file_size,mime_type,deleted_at")
      .eq("user_id", userId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
  ]);

  const folderRows = (folders ?? []) as FolderRow[];
  const fileRows = (files ?? []) as FileRow[];

  return (
    <RoleGate routeKey="tools/files">
      <section className="grid gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-zinc-100">Papierkorb</h1>
              <p className="text-[12px] text-zinc-500">Gelöschte Dateien und Ordner. Du kannst wiederherstellen oder endgültig löschen.</p>
            </div>
            <Link href="/tools/files" className="rounded-lg border border-zinc-700 text-zinc-200 text-xs px-2 py-1 hover:bg-zinc-800/60">
              Zurück zu Dateien
            </Link>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-zinc-100 mb-3">Ordner</h2>
          {folderRows.length === 0 ? (
            <div className="text-[12px] text-zinc-500">Keine gelöschten Ordner.</div>
          ) : (
            <div className="grid gap-2">
              {folderRows.map((fo) => (
                <div key={fo.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 gap-2">
                  <div className="text-sm text-zinc-200">{fo.name}</div>
                  <div className="flex items-center gap-2">
                    <form action={restoreFolderAction}>
                      <input type="hidden" name="folderId" value={fo.id} />
                      <button className="rounded border border-green-700 text-green-300 text-[11px] px-2 py-1 hover:bg-green-900/30">
                        Wiederherstellen
                      </button>
                    </form>
                    <form action={hardDeleteFolderAction}>
                      <input type="hidden" name="folderId" value={fo.id} />
                      <button className="rounded border border-red-700 text-red-300 text-[11px] px-2 py-1 hover:bg-red-900/30" title="Nur leere Ordner lassen sich endgültig löschen">
                        Endgültig löschen
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-zinc-100 mb-3">Dateien</h2>
          {fileRows.length === 0 ? (
            <div className="text-[12px] text-zinc-500">Keine gelöschten Dateien.</div>
          ) : (
            <div className="grid gap-2">
              {fileRows.map((f) => (
                <div key={f.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 gap-2">
                  <div className="text-sm text-zinc-200">
                    {f.file_name} <span className="text-[11px] text-zinc-500">({fmtSize(f.file_size)})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={restoreFileAction}>
                      <input type="hidden" name="id" value={f.id} />
                      <button className="rounded border border-green-700 text-green-300 text-[11px] px-2 py-1 hover:bg-green-900/30">
                        Wiederherstellen
                      </button>
                    </form>
                    <form action={hardDeleteFileAction}>
                      <input type="hidden" name="id" value={f.id} />
                      <button className="rounded border border-red-700 text-red-300 text-[11px] px-2 py-1 hover:bg-red-900/30">
                        Endgültig löschen
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </RoleGate>
  );
}
