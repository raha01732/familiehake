import { RoleGate } from "@/components/RoleGate";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { generateShareToken, hashPasswordScrypt, isShareActive } from "@/lib/share";

export const metadata = { title: "Dateien" };

type FileRow = {
  id: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string | null;
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

async function listFiles(userId: string) {
  const sb = createAdminClient();
  const { data } = await sb
    .from("files_meta")
    .select("id, storage_path, file_name, file_size, mime_type, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
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

async function deleteFile(formData: FormData) {
  "use server";
  const { userId } = auth();
  if (!userId) return;

  const id = formData.get("id") as string;
  const sb = createAdminClient();

  const { data: row } = await sb
    .from("files_meta")
    .select("storage_path, user_id, file_name")
    .eq("id", id)
    .single();
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

/** Server Action: Freigabelink erzeugen (Passwort optional, Ablauf/Limit optional) */
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

  // Ownership prüfen
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

  const { error } = await sb.from("file_shares").insert({
    token,
    file_id: file.id,
    owner_user_id: userId,
    password_algo,
    password_salt,
    password_hash,
    expires_at,
    max_downloads: maxDownloads ?? null,
  });

  if (!error) {
    await logAudit({
      action: "file_share_create",
      actorUserId: userId,
      actorEmail: null,
      target: file.id,
      detail: {
        token_suffix: token.slice(-6),
        file: file.file_name,
        expires_at,
        maxDownloads: maxDownloads ?? null,
      },
    });
  }

  revalidatePath("/tools/files");
}

/** Server Action: Freigabe widerrufen */
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

    await logAudit({
      action: "file_share_revoke",
      actorUserId: userId,
      actorEmail: null,
      target: share.file_id,
      detail: { share_id: shareId },
    });
  }

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
        {/* Upload */}
        <div className="card p-6">
          <h1 className="text-xl font-semibold text-zinc-100 mb-3">Datei hochladen</h1>
          <form action="/api/upload" method="post" encType="multipart/form-data" className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
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

        {/* Liste */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-zinc-100 mb-3">Deine Dateien</h2>

          <div className="grid gap-3">
            {files.map(async (f) => {
              const shares = await listSharesForFile(userId, f.id);

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
                      <form action={deleteFile}>
                        <input type="hidden" name="id" value={f.id} />
                        <button className="rounded-lg border border-red-700 text-red-300 text-xs px-2 py-1 hover:bg-red-900/30">
                          Löschen
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
                            : status === "expired"
                            ? "border-amber-700 text-amber-300"
                            : status === "limit"
                            ? "border-amber-700 text-amber-300"
                            : "border-red-700 text-red-300";

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
                                value={`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/s/${s.token}`.replace(/^\/\//, "/s/")}
                                className="min-w-0 sm:w-72 truncate rounded bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400 px-2 py-1"
                                title={`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/s/${s.token}`}
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
              <div className="text-[12px] text-zinc-500">Noch keine Dateien.</div>
            )}
          </div>
        </div>
      </section>
    </RoleGate>
  );
}
