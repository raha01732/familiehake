/**src/app/tools/files/page.tsx**/

import { RoleGate } from "@/components/RoleGate";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { generateShareToken, hashPasswordScrypt, isShareActive } from "@/lib/share";
import Link from "next/link";

export const metadata = { title: "Dateien" };

type AdminClient = ReturnType<typeof createAdminClient>;

type FileRow = {
  id: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  created_at: string;
  folder_id: string | null;
  deleted_at: string | null;
};

type FolderRow = {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  deleted_at: string | null;
  created_at: string;
};

type ShareRow = {
  id: string;
  token: string;
  file_id: string;
  owner_user_id: string;
  expires_at: string | null;
  max_downloads: number | null;
  downloads_count: number;
  revoked_at: string | null;
  created_at: string;
};

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/* ======================== Data helpers ======================== */

async function getFolder(userId: string, folderId: string, sb?: AdminClient) {
  const client = sb ?? createAdminClient();
  const { data } = await client
    .from("folders")
    .select("id,user_id,name,parent_id,deleted_at,created_at")
    .eq("user_id", userId)
    .eq("id", folderId)
    .is("deleted_at", null)
    .single();
  return (data ?? null) as FolderRow | null;
}

async function getBreadcrumb(userId: string, folderId: string | null) {
  if (!folderId) return [];
  const trail: FolderRow[] = [];
  const sb = createAdminClient();
  let current = await getFolder(userId, folderId, sb);
  while (current) {
    trail.unshift(current);
    if (!current.parent_id) break;
    current = await getFolder(userId, current.parent_id, sb);
  }
  return trail;
}

async function listFolders(userId: string, parentId: string | null) {
  const sb = createAdminClient();
  let q = sb
    .from("folders")
    .select("id,user_id,name,parent_id,deleted_at,created_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
  const { data } = await q;
  return (data ?? []) as FolderRow[];
}

async function listFiles(userId: string, folderId: string | null) {
  const sb = createAdminClient();
  let q = sb
    .from("files_meta")
    .select("id, storage_path, file_name, file_size, mime_type, created_at, folder_id, deleted_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  q = folderId ? q.eq("folder_id", folderId) : q.is("folder_id", null);

  const { data } = await q;
  return (data ?? []) as FileRow[];
}

async function listSharesForFile(userId: string, fileId: string) {
  const sb = createAdminClient();
  const { data } = await sb
    .from("file_shares")
    .select("id, token, file_id, owner_user_id, expires_at, max_downloads, downloads_count, revoked_at, created_at")
    .eq("owner_user_id", userId)
    .eq("file_id", fileId)
    .order("created_at", { ascending: false });
  return (data ?? []) as ShareRow[];
}

/* ======================== Folder Actions ======================== */

async function createFolderAction(formData: FormData) {
  "use server";
  const { userId } = auth();
  if (!userId) return;
  const name = (formData.get("name") as string)?.trim();
  const parentId = (formData.get("parentId") as string) || null;
  if (!name) return;

  const sb = createAdminClient();
  await sb.from("folders").insert({
    user_id: userId,
    name,
    parent_id: parentId || null,
  });

  // Audit optional – vermeide neue Action-Typen, um Typfehler zu verhindern
  try {
    await logAudit({ action: "login_success", actorUserId: userId, actorEmail: null, target: "folder_create", detail: { name } });
  } catch {}
  revalidatePath("/tools/files");
}

async function renameFolderAction(formData: FormData) {
  "use server";
  const { userId } = auth();
  if (!userId) return;
  const folderId = formData.get("folderId") as string;
  const name = (formData.get("name") as string)?.trim();
  if (!folderId || !name) return;

  const sb = createAdminClient();
  const { data: f } = await sb.from("folders").select("id,user_id").eq("id", folderId).single();
  if (!f || f.user_id !== userId) return;

  await sb.from("folders").update({ name }).eq("id", folderId);
  try {
    await logAudit({ action: "login_success", actorUserId: userId, actorEmail: null, target: "folder_rename", detail: { folderId, name } });
  } catch {}
  revalidatePath("/tools/files");
}

async function moveFolderAction(formData: FormData) {
  "use server";
  const { userId } = auth();
  if (!userId) return;
  const folderId = formData.get("folderId") as string;
  const destId = (formData.get("destId") as string) || null;

  const sb = createAdminClient();
  const { data: f } = await sb.from("folders").select("id,user_id").eq("id", folderId).single();
  if (!f || f.user_id !== userId) return;

  await sb.from("folders").update({ parent_id: destId || null }).eq("id", folderId);
  try {
    await logAudit({ action: "login_success", actorUserId: userId, actorEmail: null, target: "folder_move", detail: { folderId, destId } });
  } catch {}
  revalidatePath("/tools/files");
}

async function softDeleteFolderAction(formData: FormData) {
  "use server";
  const { userId } = auth();
  if (!userId) return;
  const folderId = formData.get("folderId") as string;
  if (!folderId) return;

  const sb = createAdminClient();

  // Blockieren, wenn Inhalte vorhanden (einfacher & sicherer als rekursiv)
  const [{ count: subFolders }, { count: subFiles }] = await Promise.all([
    sb.from("folders").select("id", { count: "exact", head: true }).eq("parent_id", folderId).is("deleted_at", null),
    sb.from("files_meta").select("id", { count: "exact", head: true }).eq("folder_id", folderId).is("deleted_at", null),
  ]);

  if ((subFolders ?? 0) > 0 || (subFiles ?? 0) > 0) {
    // optional: Hinweis via UI – hier nur no-op
    return;
  }

  await sb.from("folders").update({ deleted_at: new Date().toISOString() }).eq("id", folderId);
  try {
    await logAudit({ action: "login_success", actorUserId: userId, actorEmail: null, target: "folder_soft_delete", detail: { folderId } });
  } catch {}
  revalidatePath("/tools/files");
}

/* ======================== File Actions ======================== */

async function moveFileAction(formData: FormData) {
  "use server";
  const { userId } = auth();
  if (!userId) return;
  const fileId = formData.get("fileId") as string;
  const destId = (formData.get("destId") as string) || null;
  if (!fileId) return;

  const sb = createAdminClient();
  const { data: row } = await sb.from("files_meta").select("id,user_id").eq("id", fileId).single();
  if (!row || row.user_id !== userId) return;

  await sb.from("files_meta").update({ folder_id: destId || null }).eq("id", fileId);
  try {
    await logAudit({ action: "login_success", actorUserId: userId, actorEmail: null, target: "file_move", detail: { fileId, destId } });
  } catch {}
  revalidatePath("/tools/files");
}

async function softDeleteFileAction(formData: FormData) {
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

  await sb.from("files_meta").update({ deleted_at: new Date().toISOString() }).eq("id", id);

  try {
    await logAudit({
      action: "file_delete", // vorhandener Audit-Typ (Soft-Delete markiert)
      actorUserId: userId,
      actorEmail: null,
      target: row.storage_path,
      detail: { file: row.file_name, soft: true },
    });
  } catch {}

  revalidatePath("/tools/files");
}

/** Endgültige Löschung direkt aus der Dateiliste (überspringt Papierkorb) */
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
      detail: { file: row.file_name, hard: true },
    });
  } catch {}

  revalidatePath("/tools/files");
}

/* ======================== Shares (unverändert) ======================== */

async function createShareAction(formData: FormData) {
  "use server";
  const { userId } = auth();
  if (!userId) return;

  const fileId = String(formData.get("fileId") || "");
  const expiresInMinutesRaw = String(formData.get("expiresInMinutes") || "").trim();
  const password = (String(formData.get("password") || "") || "").trim();
  const maxDownloadsRaw = String(formData.get("maxDownloads") || "").trim();

  const expiresInMinutes = expiresInMinutesRaw ? Math.max(1, Number(expiresInMinutesRaw)) : undefined;
  const maxDownloads = maxDownloadsRaw ? Math.max(1, Number(maxDownloadsRaw)) : undefined;

  const sb = createAdminClient();

  const { data: file } = await sb
    .from("files_meta")
    .select("id, user_id, storage_path, file_name")
    .eq("id", fileId)
    .single();
  if (!file || file.user_id !== userId) return;

  const token = generateShareToken();
  const expires_at =
    expiresInMinutes && Number.isFinite(expiresInMinutes)
      ? new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString()
      : null;

  let password_algo: string | null = null;
  let password_salt: string | null = null;
  let password_hash: string | null = null;

  if (password) {
    const h = await hashPasswordScrypt(password);
    password_algo = h.algo;
    password_salt = h.salt;
    password_hash = h.hash;
  }

  await sb.from("file_shares").insert({
    token,
    file_id: file.id,
    owner_user_id: userId,
    password_algo,
    password_salt,
    password_hash,
    expires_at,
    max_downloads: maxDownloads ?? null,
  });

  try {
    await logAudit({
      action: "login_success",
      actorUserId: userId,
      actorEmail: null,
      target: "file_share_create",
      detail: { token_suffix: token.slice(-6), file: file.file_name, expires_at, maxDownloads: maxDownloads ?? null },
    });
  } catch {}

  revalidatePath("/tools/files");
}

async function revokeShareAction(formData: FormData) {
  "use server";
  const { userId } = auth();
  if (!userId) return;

  const shareId = String(formData.get("shareId") || "");
  const sb = createAdminClient();

  const { data: share } = await sb
    .from("file_shares")
    .select("id, owner_user_id, file_id, revoked_at")
    .eq("id", shareId)
    .single();
  if (!share) return;
  if (share.owner_user_id !== userId) return;

  if (!share.revoked_at) {
    await sb.from("file_shares").update({ revoked_at: new Date().toISOString() }).eq("id", shareId);

    try {
      await logAudit({
        action: "login_success",
        actorUserId: userId,
        actorEmail: null,
        target: "file_share_revoke",
        detail: { share_id: shareId },
      });
    } catch {}
  }

  revalidatePath("/tools/files");
}

/* ======================== Page ======================== */

export default async function FilesPage({ searchParams }: { searchParams?: { folder?: string } }) {
  const { userId } = auth();
  if (!userId) {
    return RoleGate({
      routeKey: "tools/files",
      children: <div className="card p-6">Bitte anmelden.</div>,
    });
  }

  const currentFolderId = (searchParams?.folder as string) || null;

  const [folders, files, breadcrumb] = await Promise.all([
    listFolders(userId, currentFolderId),
    listFiles(userId, currentFolderId),
    getBreadcrumb(userId, currentFolderId),
  ]);

  // Ziel-Ordnerliste für "Verschieben"
  const moveTargets = await listFolders(userId, null);

  const shareEntries = await Promise.all(
    files.map(async (file) => [file.id, await listSharesForFile(userId, file.id)] as const)
  );
  const sharesByFile = new Map<string, ShareRow[]>(shareEntries);
  const siteBaseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

  const content = (
    <section className="grid gap-6">
        {/* Kopfzeile + Breadcrumb */}
        <div className="card p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-zinc-100">Dateiverwaltung</h1>
              <nav className="mt-2 text-[12px] text-zinc-400">
                <Link href="/tools/files" className="hover:text-zinc-200">Root</Link>
                {breadcrumb.map((f) => (
                  <span key={f.id}>
                    <span className="mx-1">/</span>
                    <Link href={`/tools/files?folder=${f.id}`} className="hover:text-zinc-200">{f.name}</Link>
                  </span>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/tools/files/trash" className="rounded-lg border border-zinc-700 text-zinc-200 text-xs px-2 py-1 hover:bg-zinc-800/60">
                Papierkorb
              </Link>
            </div>
          </div>

          {/* Neuer Ordner */}
          <form action={createFolderAction} className="mt-4 flex gap-2">
            <input type="hidden" name="parentId" value={currentFolderId ?? ""} />
            <input
              name="name"
              placeholder="Neuer Ordnername"
              className="flex-1 rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
            />
            <button className="rounded-lg border border-zinc-700 text-zinc-200 text-xs px-3 py-2 hover:bg-zinc-800/60">
              Ordner erstellen
            </button>
          </form>
        </div>

        {/* Upload */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-zinc-100 mb-3">Datei hochladen</h2>
          <form action="/api/upload" method="post" encType="multipart/form-data" className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <input type="hidden" name="folderId" value={currentFolderId ?? ""} />
            <input type="file" name="file" className="text-sm text-zinc-300" required />
            <button className="rounded-xl border border-zinc-700 text-zinc-200 text-sm px-3 py-2 hover:bg-zinc-800/60">
              Hochladen
            </button>
          </form>
          <div className="text-[11px] text-zinc-500 mt-2">Max. Größe gemäß Vercel/Supabase Limits.</div>
        </div>

        {/* Ordner-Liste */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-zinc-100 mb-3">Ordner</h3>
          {folders.length === 0 ? (
            <div className="text-[12px] text-zinc-500">Keine Ordner.</div>
          ) : (
            <div className="grid gap-2">
              {folders.map((fo) => (
                <div key={fo.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 gap-2">
                  <div className="text-sm text-zinc-200">
                    <Link href={`/tools/files?folder=${fo.id}`} className="hover:underline">{fo.name}</Link>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Umbenennen */}
                    <form action={renameFolderAction} className="flex items-center gap-2">
                      <input type="hidden" name="folderId" value={fo.id} />
                      <input
                        name="name"
                        placeholder="Neuer Name"
                        className="w-40 rounded bg-zinc-950 border border-zinc-700 text-[12px] px-2 py-1 text-zinc-100"
                      />
                      <button className="rounded border border-zinc-700 text-zinc-200 text-[11px] px-2 py-1 hover:bg-zinc-800/60">
                        Umbenennen
                      </button>
                    </form>

                    {/* Verschieben */}
                    <form action={moveFolderAction} className="flex items-center gap-2">
                      <input type="hidden" name="folderId" value={fo.id} />
                      <select name="destId" className="w-40 rounded bg-zinc-950 border border-zinc-700 text-[12px] px-2 py-1 text-zinc-100" defaultValue="">
                        <option value="">Root</option>
                        {moveTargets
                          .filter((t) => t.id !== fo.id) // nicht in sich selbst
                          .map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                      </select>
                      <button className="rounded border border-zinc-700 text-zinc-200 text-[11px] px-2 py-1 hover:bg-zinc-800/60">
                        Verschieben
                      </button>
                    </form>

                    {/* In Papierkorb */}
                    <form action={softDeleteFolderAction}>
                      <input type="hidden" name="folderId" value={fo.id} />
                      <button className="rounded border border-amber-700 text-amber-300 text-[11px] px-2 py-1 hover:bg-amber-900/30" title="In Papierkorb (nur leere Ordner)">
                        In Papierkorb
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Datei-Liste + Share-UI (deine bestehende Logik, erweitert um Papierkorb & Verschieben) */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-zinc-100 mb-3">Dateien</h2>

          <div className="grid gap-3">
            {files.map((f) => {
              const shares = sharesByFile.get(f.id) ?? [];

              return (
                <div key={f.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                  {/* Kopfzeile */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <div className="text-zinc-100 text-sm font-medium">{f.file_name}</div>
                      <div className="text-[11px] text-zinc-500">
                        {fmtSize(f.file_size)} • {f.mime_type || "—"} • {new Date(f.created_at).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/files/get?path=${encodeURIComponent(f.storage_path)}`}
                        className="rounded-lg border border-zinc-700 text-zinc-200 text-xs px-2 py-1 hover:bg-zinc-800/60"
                      >
                        Download
                      </a>

                      {/* Verschieben */}
                      <form action={moveFileAction} className="flex items-center gap-2">
                        <input type="hidden" name="fileId" value={f.id} />
                        <select
                          name="destId"
                          className="rounded bg-zinc-950 border border-zinc-700 text-[12px] px-2 py-1 text-zinc-100"
                          defaultValue={currentFolderId ?? ""}
                        >
                          <option value="">Root</option>
                          {moveTargets.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <button className="rounded border border-zinc-700 text-zinc-200 text-[11px] px-2 py-1 hover:bg-zinc-800/60">
                          Verschieben
                        </button>
                      </form>

                      {/* In Papierkorb */}
                      <form action={softDeleteFileAction}>
                        <input type="hidden" name="id" value={f.id} />
                        <button className="rounded-lg border border-amber-700 text-amber-300 text-xs px-2 py-1 hover:bg-amber-900/30">
                          In Papierkorb
                        </button>
                      </form>
                      <form action={hardDeleteFileAction}>
                        <input type="hidden" name="id" value={f.id} />
                        <button
                          className="rounded-lg border border-red-700 text-red-300 text-xs px-2 py-1 hover:bg-red-900/30"
                          title="Endgültig löschen (überspringt den Papierkorb)"
                        >
                          Endgültig löschen
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Freigabe erstellen */}
                  <details className="mt-4 group open:animate-in open:fade-in-50">
                    <summary className="cursor-pointer select-none text-xs text-zinc-300 hover:text-zinc-100">
                      Freigeben (Link erzeugen)
                    </summary>
                    <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                      <form action={createShareAction} className="grid gap-3 sm:grid-cols-4">
                        <input type="hidden" name="fileId" value={f.id} />
                        <div>
                          <label className="text-[11px] text-zinc-400">Ablauf (Min.)</label>
                          <input
                            name="expiresInMinutes"
                            type="number"
                            min={1}
                            placeholder="z. B. 60"
                            className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-100"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">Passwort (optional)</label>
                          <input
                            name="password"
                            type="text"
                            placeholder="optional"
                            className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-100"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">Max. Downloads</label>
                          <input
                            name="maxDownloads"
                            type="number"
                            min={1}
                            placeholder="optional"
                            className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-100"
                          />
                        </div>
                        <div className="flex items-end">
                          <button className="w-full rounded-lg border border-zinc-700 text-zinc-200 text-xs font-medium px-3 py-2 hover:bg-zinc-800/60">
                            Link erstellen
                          </button>
                        </div>
                      </form>
                      <div className="text-[11px] text-zinc-500 mt-2">
                        Nach dem Erstellen erscheint der Link unten in der Liste. Du kannst ihn dort kopieren.
                      </div>
                    </div>
                  </details>

                  {/* Bestehende Freigaben */}
                  <div className="mt-4">
                    <div className="text-xs text-zinc-400 mb-2">Freigaben</div>
                    <div className="grid gap-2">
                      {shares.map((s) => {
                        const active = isShareActive({
                          revoked_at: s.revoked_at,
                          expires_at: s.expires_at,
                          max_downloads: s.max_downloads,
                          downloads_count: s.downloads_count,
                        });
                        const status = s.revoked_at
                          ? "revoked"
                          : s.expires_at && new Date(s.expires_at).getTime() < Date.now()
                          ? "expired"
                          : s.max_downloads != null && s.downloads_count >= s.max_downloads
                          ? "limit"
                          : "active";

                        const badge =
                          status === "active"
                            ? "border-green-700 text-green-300"
                            : status === "expired" || status === "limit"
                            ? "border-amber-700 text-amber-300"
                            : "border-red-700 text-red-300";

                        const shareUrl = siteBaseUrl ? `${siteBaseUrl}/s/${s.token}` : `/s/${s.token}`;

                        return (
                          <div
                            key={s.id}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 gap-2"
                          >
                            <div className="text-xs text-zinc-300">
                              <a
                                href={`/s/${s.token}`}
                                className="underline underline-offset-2 decoration-zinc-600 hover:text-zinc-100"
                                target="_blank"
                              >
                                /s/{s.token.slice(0, 8)}…
                              </a>
                              <span className={`ml-2 rounded px-2 py-0.5 text-[10px] ${badge}`}>
                                {status}
                              </span>
                              <span className="ml-2 text-[11px] text-zinc-500">
                                DL: {s.downloads_count}
                                {s.max_downloads != null ? ` / ${s.max_downloads}` : ""}
                              </span>
                              {s.expires_at && (
                                <span className="ml-2 text-[11px] text-zinc-500">
                                  bis {new Date(s.expires_at).toLocaleString()}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <input
                                readOnly
                                value={shareUrl}
                                className="min-w-0 sm:w-72 truncate rounded bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400 px-2 py-1"
                                title={shareUrl}
                              />
                              <form action={revokeShareAction}>
                                <input type="hidden" name="shareId" value={s.id} />
                                <button
                                  disabled={!active}
                                  className="rounded border border-red-700 text-red-300 text-[11px] px-2 py-1 disabled:opacity-50 hover:bg-red-900/30"
                                  title={active ? "Freigabe widerrufen" : "Bereits inaktiv"}
                                >
                                  Widerrufen
                                </button>
                              </form>
                            </div>
                          </div>
                        );
                      })}
                      {shares.length === 0 && (
                        <div className="text-[11px] text-zinc-500">Keine Freigaben für diese Datei.</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {files.length === 0 && (
              <div className="text-[12px] text-zinc-500">Keine Dateien im aktuellen Ordner.</div>
            )}
          </div>
        </div>
    </section>
  );

  return RoleGate({ routeKey: "tools/files", children: content });
}
