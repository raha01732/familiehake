// src/lib/check-database-live.ts
export type DatabaseLiveStatus = {
  live: boolean;
  error?: string;
};

type MinimalAdminClient = {
  from: (...args: [string]) => {
    select: (
      ...args: [string, { count: "exact"; head: true }]
    ) => PromiseLike<{ error: { message: string } | null }>;
  };
};

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
