import { assertAccessOrThrow } from "@/lib/auth";
import { currentUser } from "@clerk/nextjs/server";
import { logAudit } from "@/lib/audit";

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
    const user = await currentUser();
    if (err?.message === "FORBIDDEN_ROLE") {
      // Audit: access_denied
      await logAudit({
        action: "access_denied",
        actorUserId: user?.id ?? null,
        actorEmail: user?.emailAddresses?.[0]?.emailAddress ?? null,
        target: routeKey,
        detail: { reason: "FORBIDDEN_ROLE" }
      });
      return (
        <div className="card p-6 text-sm text-yellow-400">
          Angemeldet, aber Rolle erlaubt keinen Zugriff.
        </div>
      );
    }
    if (err?.message === "UNAUTHORIZED_NOT_LOGGED_IN") {
      // (Optional) nicht loggen, weil unauthenticated sehr häufig ist.
      return (
        <div className="card p-6 text-sm text-red-400">
          Nicht angemeldet. Bitte neu laden.
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
