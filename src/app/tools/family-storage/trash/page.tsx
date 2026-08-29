// src/app/tools/family-storage/trash/page.tsx
import RoleGate from "@/components/RoleGate";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import Link from "next/link";
import { isPreviewEnvironment } from "@/lib/env";
import { PreviewPlaceholder } from "@/components/PreviewNotice";

export const metadata = { title: "Papierkorb (Geteilter Storage)" };

type FileRow = {
  id: string;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  deleted_at: string | null;
};

type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  deleted_at: string | null;
};

function fmtSize(bytes: number | null) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/* ======= Actions ======= */

async function restoreFileAction(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) return;
  const id = formData.get("id") as string;
  if (!id) return;

  const sb = createAdminClient();
  await sb.from("family_files_meta").update({ deleted_at: null }).eq("id", id);
  try {
    await logAudit({ action: "file_restore", actorUserId: userId, actorEmail: null, target: id, detail: { scope: "family" } });
  } catch (e) { void e; }
  revalidatePath("/tools/family-storage/trash");
}

async function hardDeleteFileAction(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) return;
  const id = formData.get("id") as string;
  if (!id) return;

  const sb = createAdminClient();
  const { data: row } = await sb.from("family_files_meta").select("storage_path,file_name").eq("id", id).single();
  if (!row) return;

  await sb.storage.from("family-files").remove([row.storage_path]);
  await sb.from("family_files_meta").delete().eq("id", id);
  try {
    await logAudit({ action: "file_delete", actorUserId: userId, actorEmail: null, target: row.storage_path, detail: { file: row.file_name, hard: true, from: "trash", scope: "family" } });
  } catch (e) { void e; }
  revalidatePath("/tools/family-storage/trash");
}

async function restoreFolderAction(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) return;
  const folderId = formData.get("folderId") as string;
  if (!folderId) return;

  const sb = createAdminClient();
  await sb.from("family_folders").update({ deleted_at: null }).eq("id", folderId);
  try {
    await logAudit({ action: "folder_restore", actorUserId: userId, actorEmail: null, target: folderId, detail: { scope: "family" } });
  } catch (e) { void e; }
  revalidatePath("/tools/family-storage/trash");
}

async function hardDeleteFolderAction(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) return;
  const folderId = formData.get("folderId") as string;
  if (!folderId) return;

  const sb = createAdminClient();
  const [{ count: subFolders }, { count: subFiles }] = await Promise.all([
    sb.from("family_folders").select("id", { count: "exact", head: true }).eq("parent_id", folderId),
    sb.from("family_files_meta").select("id", { count: "exact", head: true }).eq("folder_id", folderId),
  ]);
  if ((subFolders ?? 0) > 0 || (subFiles ?? 0) > 0) return;

  await sb.from("family_folders").delete().eq("id", folderId);
  try {
    await logAudit({ action: "folder_delete", actorUserId: userId, actorEmail: null, target: folderId, detail: { hard: true, scope: "family" } });
  } catch (e) { void e; }
  revalidatePath("/tools/family-storage/trash");
}

/* ======= Page ======= */

export default async function FamilyStorageTrashPage() {
  if (isPreviewEnvironment()) {
    return (
      <RoleGate routeKey="tools/family-storage">
        <PreviewPlaceholder
          title="Papierkorb (Preview)"
          description="Gelöschte Dateien und Wiederherstellungen sind in Preview deaktiviert."
          fields={["Gelöschte Dateien", "Gelöschte Ordner", "Wiederherstellungsaktionen"]}
        />
      </RoleGate>
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return (
      <RoleGate routeKey="tools/family-storage">
        <div className="card p-6">Bitte anmelden.</div>
      </RoleGate>
    );
  }

  const sb = createAdminClient();
  const [{ data: folders }, { data: files }] = await Promise.all([
    sb.from("family_folders").select("id,name,parent_id,deleted_at").not("deleted_at", "is", null).order("name", { ascending: true }),
    sb.from("family_files_meta").select("id,storage_path,file_name,file_size,mime_type,deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
  ]);

  const folderRows = (folders ?? []) as FolderRow[];
  const fileRows = (files ?? []) as FileRow[];

  return (
    <RoleGate routeKey="tools/family-storage">
      <section className="grid gap-6 animate-fade-up">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>Papierkorb</h1>
              <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                Gelöschte Dateien und Ordner aus dem geteilten Storage.
              </p>
            </div>
            <Link
              href="/tools/family-storage"
              className="rounded-lg border px-2 py-1 text-xs"
              style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
            >
              Zurück zum Storage
            </Link>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="mb-3 text-lg font-semibold" style={{ color: "hsl(var(--foreground))" }}>Ordner</h2>
          {folderRows.length === 0 ? (
            <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Keine gelöschten Ordner.</div>
          ) : (
            <div className="grid gap-2">
              {folderRows.map((fo) => (
                <div
                  key={fo.id}
                  className="flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  style={{ borderColor: "hsl(var(--border))" }}
                >
                  <div className="text-sm" style={{ color: "hsl(var(--foreground))" }}>{fo.name}</div>
                  <div className="flex items-center gap-2">
                    <form action={restoreFolderAction}>
                      <input type="hidden" name="folderId" value={fo.id} />
                      <button className="rounded border px-2 py-1 text-[11px]" style={{ borderColor: "hsl(142 71% 45% / 0.4)", color: "hsl(142 71% 35%)" }}>
                        Wiederherstellen
                      </button>
                    </form>
                    <form action={hardDeleteFolderAction}>
                      <input type="hidden" name="folderId" value={fo.id} />
                      <button
                        className="rounded border px-2 py-1 text-[11px]"
                        style={{ borderColor: "hsl(0 84% 60% / 0.4)", color: "hsl(0 72% 51%)" }}
                        title="Nur leere Ordner lassen sich endgültig löschen"
                      >
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
          <h2 className="mb-3 text-lg font-semibold" style={{ color: "hsl(var(--foreground))" }}>Dateien</h2>
          {fileRows.length === 0 ? (
            <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Keine gelöschten Dateien.</div>
          ) : (
            <div className="grid gap-2">
              {fileRows.map((f) => (
                <div
                  key={f.id}
                  className="flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  style={{ borderColor: "hsl(var(--border))" }}
                >
                  <div className="text-sm" style={{ color: "hsl(var(--foreground))" }}>
                    {f.file_name} <span className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>({fmtSize(f.file_size)})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={restoreFileAction}>
                      <input type="hidden" name="id" value={f.id} />
                      <button className="rounded border px-2 py-1 text-[11px]" style={{ borderColor: "hsl(142 71% 45% / 0.4)", color: "hsl(142 71% 35%)" }}>
                        Wiederherstellen
                      </button>
                    </form>
                    <form action={hardDeleteFileAction}>
                      <input type="hidden" name="id" value={f.id} />
                      <button className="rounded border px-2 py-1 text-[11px]" style={{ borderColor: "hsl(0 84% 60% / 0.4)", color: "hsl(0 72% 51%)" }}>
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
