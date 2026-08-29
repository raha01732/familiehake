// src/app/tools/family-storage/page.tsx
// Geteilter Familien-Storage: voll geteilt wie tools/tasks - keine
// Eigentuemerschaftspruefung, jeder mit Zugriff auf den Family-Bereich
// sieht/verwaltet dieselben Ordner & Dateien. Bewusst (noch) ohne externe
// Freigabe-Links (anders als das persoenliche Dateien-Tool) - das waere
// ein eigener, deutlich groesserer Schritt.
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import RoleGate from "@/components/RoleGate";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { isPreviewEnvironment } from "@/lib/env";
import { PreviewPlaceholder } from "@/components/PreviewNotice";
import { getSessionInfo } from "@/lib/auth";
import { getToolGate } from "@/lib/workspace-locks";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";

export const metadata = { title: "Geteilter Storage" };

/** --- Types --- */
type FileRow = {
  id: string;
  folder_id: string | null;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  deleted_at: string | null;
  created_at: string;
  created_by: string;
};

type FolderRow = {
  id: string;
  parent_id: string | null;
  name: string;
  deleted_at: string | null;
  created_at: string;
  created_by: string;
};

function fmtSize(n: number | null) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/* ======================== Data helpers ======================== */

async function getFolder(folderId: string) {
  const sb = createAdminClient();
  const { data } = await sb
    .from("family_folders")
    .select("id,name,parent_id,deleted_at,created_at,created_by")
    .eq("id", folderId)
    .is("deleted_at", null)
    .single();
  return (data ?? null) as FolderRow | null;
}

async function getBreadcrumb(folderId: string | null) {
  if (!folderId) return [];
  const trail: FolderRow[] = [];
  let current = await getFolder(folderId);
  while (current) {
    trail.unshift(current);
    if (!current.parent_id) break;
    current = await getFolder(current.parent_id);
  }
  return trail;
}

async function listFolders(parentId: string | null) {
  const sb = createAdminClient();
  let q = sb
    .from("family_folders")
    .select("id,name,parent_id,deleted_at,created_at,created_by")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
  const { data } = await q;
  return (data ?? []) as FolderRow[];
}

async function listFiles(folderId: string | null) {
  const sb = createAdminClient();
  let q = sb
    .from("family_files_meta")
    .select("id,folder_id,storage_path,file_name,file_size,mime_type,deleted_at,created_at,created_by")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  q = folderId ? q.eq("folder_id", folderId) : q.is("folder_id", null);
  const { data } = await q;
  return (data ?? []) as FileRow[];
}

/* ======================== Server Actions ======================== */

async function createFolderAction(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) return;
  const name = (formData.get("name") as string)?.trim();
  const parentId = (formData.get("parentId") as string) || null;
  if (!name) return;

  const sb = createAdminClient();
  await sb.from("family_folders").insert({ name, parent_id: parentId, created_by: userId });

  try {
    await logAudit({ action: "folder_create", actorUserId: userId, actorEmail: null, target: name, detail: { parentId, scope: "family" } });
  } catch (e) { void e; }
  revalidatePath("/tools/family-storage");
}

async function renameFolderAction(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) return;
  const folderId = String(formData.get("folderId") || "");
  const name = (formData.get("name") as string)?.trim();
  if (!folderId || !name) return;

  const sb = createAdminClient();
  await sb.from("family_folders").update({ name }).eq("id", folderId);
  try {
    await logAudit({ action: "folder_rename", actorUserId: userId, actorEmail: null, target: folderId, detail: { name, scope: "family" } });
  } catch (e) { void e; }
  revalidatePath("/tools/family-storage");
}

async function moveFolderAction(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) return;
  const folderId = String(formData.get("folderId") || "");
  const destId = (String(formData.get("destId") || "") || null) as string | null;
  if (!folderId) return;

  const sb = createAdminClient();
  await sb.from("family_folders").update({ parent_id: destId }).eq("id", folderId);
  try {
    await logAudit({ action: "folder_move", actorUserId: userId, actorEmail: null, target: folderId, detail: { destId, scope: "family" } });
  } catch (e) { void e; }
  revalidatePath("/tools/family-storage");
}

async function softDeleteFolderAction(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) return;
  const folderId = String(formData.get("folderId") || "");
  if (!folderId) return;

  const sb = createAdminClient();
  const [{ count: subFolders }, { count: subFiles }] = await Promise.all([
    sb.from("family_folders").select("id", { count: "exact", head: true }).eq("parent_id", folderId).is("deleted_at", null),
    sb.from("family_files_meta").select("id", { count: "exact", head: true }).eq("folder_id", folderId).is("deleted_at", null),
  ]);
  if ((subFolders ?? 0) > 0 || (subFiles ?? 0) > 0) return;

  await sb.from("family_folders").update({ deleted_at: new Date().toISOString() }).eq("id", folderId);
  try {
    await logAudit({ action: "folder_delete", actorUserId: userId, actorEmail: null, target: folderId, detail: { soft: true, scope: "family" } });
  } catch (e) { void e; }
  revalidatePath("/tools/family-storage");
}

async function moveFileAction(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) return;
  const fileId = String(formData.get("fileId") || "");
  const destId = (String(formData.get("destId") || "") || null) as string | null;
  if (!fileId) return;

  const sb = createAdminClient();
  await sb.from("family_files_meta").update({ folder_id: destId }).eq("id", fileId);
  try {
    await logAudit({ action: "file_move", actorUserId: userId, actorEmail: null, target: fileId, detail: { destId, scope: "family" } });
  } catch (e) { void e; }
  revalidatePath("/tools/family-storage");
}

async function softDeleteFileAction(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) return;
  const id = String(formData.get("id") || "");
  if (!id) return;

  const sb = createAdminClient();
  const { data: row } = await sb.from("family_files_meta").select("storage_path,file_name").eq("id", id).single();
  if (!row) return;

  await sb.from("family_files_meta").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  try {
    await logAudit({ action: "file_delete", actorUserId: userId, actorEmail: null, target: row.storage_path, detail: { file: row.file_name, soft: true, scope: "family" } });
  } catch (e) { void e; }
  revalidatePath("/tools/family-storage");
}

async function hardDeleteFileAction(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) return;
  const id = String(formData.get("id") || "");
  if (!id) return;

  const sb = createAdminClient();
  const { data: row } = await sb.from("family_files_meta").select("storage_path,file_name").eq("id", id).single();
  if (!row) return;

  await sb.storage.from("family-files").remove([row.storage_path]);
  await sb.from("family_files_meta").delete().eq("id", id);
  try {
    await logAudit({ action: "file_delete", actorUserId: userId, actorEmail: null, target: row.storage_path, detail: { file: row.file_name, hard: true, scope: "family" } });
  } catch (e) { void e; }
  revalidatePath("/tools/family-storage");
}

/* ======================== Page ======================== */

export default async function FamilyStoragePage({ searchParams }: { searchParams?: Promise<{ folder?: string }> }) {
  const session = await getSessionInfo();
  const gate = await getToolGate("tools/family-storage", session);
  if (gate.blocked) {
    return <ToolMaintenanceNotice message={gate.message} />;
  }

  if (isPreviewEnvironment()) {
    return (
      <RoleGate routeKey="tools/family-storage">
        <PreviewPlaceholder
          title="Geteilter Storage (Preview)"
          description="Dateien und Ordner sind in Preview nur als Platzhalter sichtbar."
          fields={["Dateiliste", "Ordnerstruktur"]}
        />
      </RoleGate>
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return (
      <RoleGate routeKey="tools/family-storage">
        <section className="p-6">
          <div className="card p-6">Bitte anmelden.</div>
        </section>
      </RoleGate>
    );
  }

  const sp = await searchParams;
  const currentFolderId = sp?.folder || null;
  const [folders, files, breadcrumb] = await Promise.all([
    listFolders(currentFolderId),
    listFiles(currentFolderId),
    getBreadcrumb(currentFolderId),
  ]);
  const moveTargets = await listFolders(null);

  return (
    <RoleGate routeKey="tools/family-storage">
      <section className="grid gap-6 animate-fade-up">
        <div className="card p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                Geteilter Storage
              </h1>
              <p className="mt-1 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                Jeder mit Zugriff auf den Family-Bereich sieht und verwaltet dieselben Dateien.
              </p>
              <nav className="mt-2 text-[12px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                <Link href="/tools/family-storage" className="hover:underline">Root</Link>
                {breadcrumb.map((f) => (
                  <span key={f.id}>
                    <span className="mx-1">/</span>
                    <Link href={`/tools/family-storage?folder=${f.id}`} className="hover:underline">{f.name}</Link>
                  </span>
                ))}
              </nav>
            </div>
            <Link
              href="/tools/family-storage/trash"
              className="rounded-lg border px-2 py-1 text-xs"
              style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
            >
              Papierkorb
            </Link>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <form action={createFolderAction} className="flex flex-1 gap-2">
              <input type="hidden" name="parentId" value={currentFolderId ?? ""} />
              <input
                name="name"
                placeholder="Neuer Ordnername"
                className="input-field flex-1 text-sm"
              />
              <button className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}>
                Ordner erstellen
              </button>
            </form>

            <form action="/api/family-storage/upload" method="post" encType="multipart/form-data" className="flex flex-1 gap-2">
              <input type="hidden" name="folderId" value={currentFolderId ?? ""} />
              <input type="file" name="file" required className="flex-1 text-xs" style={{ color: "hsl(var(--foreground))" }} />
              <button className="brand-button rounded-lg px-3 py-2 text-xs font-semibold">Hochladen</button>
            </form>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="mb-3 text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Ordner</h3>
          {folders.length === 0 ? (
            <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Keine Ordner.</div>
          ) : (
            <div className="grid gap-2">
              {folders.map((fo) => (
                <div
                  key={fo.id}
                  className="flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  style={{ borderColor: "hsl(var(--border))" }}
                >
                  <div className="text-sm" style={{ color: "hsl(var(--foreground))" }}>
                    <Link href={`/tools/family-storage?folder=${fo.id}`} className="hover:underline">{fo.name}</Link>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={renameFolderAction} className="flex items-center gap-2">
                      <input type="hidden" name="folderId" value={fo.id} />
                      <input name="name" placeholder="Neuer Name" className="input-field w-36 text-xs" />
                      <button className="rounded border px-2 py-1 text-[11px]" style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}>
                        Umbenennen
                      </button>
                    </form>
                    <form action={moveFolderAction} className="flex items-center gap-2">
                      <input type="hidden" name="folderId" value={fo.id} />
                      <select name="destId" className="input-field w-36 text-xs" defaultValue="">
                        <option value="">Root</option>
                        {moveTargets.filter((t) => t.id !== fo.id).map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <button className="rounded border px-2 py-1 text-[11px]" style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}>
                        Verschieben
                      </button>
                    </form>
                    <form action={softDeleteFolderAction}>
                      <input type="hidden" name="folderId" value={fo.id} />
                      <button
                        className="rounded border px-2 py-1 text-[11px]"
                        style={{ borderColor: "hsl(27 96% 61% / 0.4)", color: "hsl(27 96% 45%)" }}
                        title="In Papierkorb (nur leere Ordner)"
                      >
                        In Papierkorb
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
          <div className="grid gap-3">
            {files.map((f) => (
              <div key={f.id} className="rounded-xl border p-4" style={{ borderColor: "hsl(var(--border))" }}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>{f.file_name}</div>
                    <div className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {fmtSize(f.file_size)} · {f.mime_type || "—"} · {new Date(f.created_at).toLocaleString("de-DE")}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/api/family-storage/get?path=${encodeURIComponent(f.storage_path)}`}
                      className="rounded-lg border px-2 py-1 text-xs"
                      style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
                    >
                      Download
                    </a>
                    <form action={moveFileAction} className="flex items-center gap-2">
                      <input type="hidden" name="fileId" value={f.id} />
                      <select name="destId" className="input-field text-xs" defaultValue={currentFolderId ?? ""}>
                        <option value="">Root</option>
                        {folders.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <button className="rounded border px-2 py-1 text-[11px]" style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}>
                        Verschieben
                      </button>
                    </form>
                    <form action={softDeleteFileAction}>
                      <input type="hidden" name="id" value={f.id} />
                      <button className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: "hsl(27 96% 61% / 0.4)", color: "hsl(27 96% 45%)" }}>
                        In Papierkorb
                      </button>
                    </form>
                    <form action={hardDeleteFileAction}>
                      <input type="hidden" name="id" value={f.id} />
                      <button
                        className="rounded-lg border px-2 py-1 text-xs"
                        style={{ borderColor: "hsl(0 84% 60% / 0.4)", color: "hsl(0 72% 51%)" }}
                        title="Endgültig löschen (überspringt den Papierkorb)"
                      >
                        Endgültig löschen
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
            {files.length === 0 && (
              <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Keine Dateien im aktuellen Ordner.</div>
            )}
          </div>
        </div>
      </section>
    </RoleGate>
  );
}
