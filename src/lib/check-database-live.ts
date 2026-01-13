// src/lib/check-database-live.ts
export type DatabaseLiveStatus = {
  live: boolean;
  error?: string;
};

/* eslint-disable no-unused-vars */
type MinimalAdminClient = {
  from: (table: string) => {
    select: (
      columns: string,
      options: { count: "exact"; head: true }
    ) => PromiseLike<{ error: { message: string } | null }>;
  };
};
/* eslint-enable no-unused-vars */

export async function checkDatabaseLiveWithClient(
  sb: MinimalAdminClient
): Promise<DatabaseLiveStatus> {
  try {
    const { error } = await sb.from("roles").select("id", { count: "exact", head: true });
    if (error) {
      return { live: false, error: error.message };
    }
    return { live: true };
  } catch (error) {
    console.error("checkDatabaseLive", error);
    return { live: false, error: error instanceof Error ? error.message : "unknown_error" };
  }
}
