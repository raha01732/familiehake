// src/lib/stats.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { isShareActive } from "@/lib/share";

type FileMetaRow = {
  file_size: number;
  deleted_at: string | null;
};

type ShareRow = {
  id: string;
  file_id: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  downloads_count: number;
  max_downloads: number | null;
  file?: { file_name: string | null } | { file_name: string | null }[] | null;
};

type JournalRow = {
  updated_at: string;
};

export type StorageUsageSummary = {
  totalFiles: number;
  totalBytes: number;
  trashedFiles: number;
  trashedBytes: number;
  activeShares: number;
  revokedShares: number;
  expiredShares: number;
  expiringSoon: number;
  recentShares: Array<{
    id: string;
    fileName: string | null;
    createdAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
    downloads: number;
    maxDownloads: number | null;
    state: "active" | "revoked" | "expired";
  }>;
};

export type JournalSummary = {
  totalEntries: number;
  lastUpdatedAt: string | null;
};

function safeReduceBytes(rows: FileMetaRow[]): {
  totalFiles: number;
  totalBytes: number;
  trashedFiles: number;
  trashedBytes: number;
} {
  return rows.reduce(
    (acc, row) => {
      if (row.deleted_at) {
        acc.trashedFiles += 1;
        acc.trashedBytes += row.file_size ?? 0;
      } else {
        acc.totalFiles += 1;
        acc.totalBytes += row.file_size ?? 0;
      }
      return acc;
    },
    { totalFiles: 0, totalBytes: 0, trashedFiles: 0, trashedBytes: 0 }
  );
}

export async function getStorageUsageSummary(): Promise<StorageUsageSummary> {
  try {
    const sb = createAdminClient();
    const [{ data: fileRows }, { data: shareRows }] = await Promise.all([
      sb
        .from("files_meta")
        .select("file_size, deleted_at")
        .order("created_at", { ascending: false }),
      sb
        .from("file_shares")
        .select("id, file_id, created_at, expires_at, revoked_at, downloads_count, max_downloads, file:files_meta(file_name)")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const files = (fileRows ?? []) as FileMetaRow[];
    const shares = (shareRows ?? []) as ShareRow[];

    const base = safeReduceBytes(files);
    let activeShares = 0;
    let revokedShares = 0;
    let expiredShares = 0;
    let expiringSoon = 0;

    const now = Date.now();
    const soonThreshold = now + 1000 * 60 * 60 * 48; // 48h

    const recentShares = shares.map((share) => {
      const active = isShareActive(share);
      const expiresAtMs = share.expires_at ? new Date(share.expires_at).getTime() : null;
      const expired = !active && !share.revoked_at && !!share.expires_at && (expiresAtMs ?? 0) < now;

      if (share.revoked_at) {
        revokedShares += 1;
      } else if (expired) {
        expiredShares += 1;
      } else if (active) {
        activeShares += 1;
        if (expiresAtMs && expiresAtMs < soonThreshold) {
          expiringSoon += 1;
        }
      }

      const state: "active" | "revoked" | "expired" = share.revoked_at
        ? "revoked"
        : expired
        ? "expired"
        : "active";

      const fileName = Array.isArray(share.file)
        ? share.file[0]?.file_name ?? null
        : share.file?.file_name ?? null;

      return {
        id: share.id,
        fileName,
        createdAt: share.created_at,
        expiresAt: share.expires_at,
        revokedAt: share.revoked_at,
        downloads: share.downloads_count,
        maxDownloads: share.max_downloads,
        state,
      };
    });

    return {
      totalFiles: base.totalFiles,
      totalBytes: base.totalBytes,
      trashedFiles: base.trashedFiles,
      trashedBytes: base.trashedBytes,
      activeShares,
      revokedShares,
      expiredShares,
      expiringSoon,
      recentShares,
    };
  } catch {
    return {
      totalFiles: 0,
      totalBytes: 0,
      trashedFiles: 0,
      trashedBytes: 0,
      activeShares: 0,
      revokedShares: 0,
      expiredShares: 0,
      expiringSoon: 0,
      recentShares: [],
    };
  }
}

export async function getJournalSummary(): Promise<JournalSummary> {
  try {
    const sb = createAdminClient();
    const [{ count }, { data }] = await Promise.all([
      sb.from("journal_entries").select("id", { head: true, count: "exact" }),
      sb
        .from("journal_entries")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1),
    ]);

    const lastUpdatedAt = (data?.[0] as JournalRow | undefined)?.updated_at ?? null;

    return {
      totalEntries: count ?? 0,
      lastUpdatedAt,
    };
  } catch {
    return {
      totalEntries: 0,
      lastUpdatedAt: null,
    };
  }
}
