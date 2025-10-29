import { assertAccessOrThrow } from "@/lib/auth";

export async function RoleGate({
  routeKey,
  children
}: {
  routeKey: string;
  children: React.ReactNode;
}) {
  try {
    await assertAccessOrThrow(routeKey);
    return <>{children}</>;
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_NOT_LOGGED_IN") {
        return (
          <div className="card p-6 text-sm text-red-400">
            Nicht angemeldet. Bitte neu laden.
          </div>
        );
    }
    if (err.message === "FORBIDDEN_ROLE") {
        return (
          <div className="card p-6 text-sm text-yellow-400">
            Du bist angemeldet, aber deine Rolle erlaubt keinen Zugriff auf
            diesen Bereich.
          </div>
        );
    }
    return (
      <div className="card p-6 text-sm text-red-400">
        Unerwarteter Fehler beim Zugriffscheck.
      </div>
    );
  }
}
