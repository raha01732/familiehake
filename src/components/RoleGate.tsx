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
  // 1) User & Rolle holen (Serverkomponente – safe)
  const user = await currentUser();
  const role = (user?.publicMetadata?.role as string) ?? "member";
  const isSuperAdmin = role === "superadmin";

  // 2) Superadmin darf immer – ohne DB-Check
  if (user && isSuperAdmin) {
    return <>{children}</>;
  }

  // 3) Normale Prüfung (wirft bei Verstoß)
  try {
    await assertAccessOrThrow(routeKey);
    return <>{children}</>;
  } catch (err: any) {
    // Explizit verbotene Rolle
    if (err?.message === "FORBIDDEN_ROLE") {
      // Audit: access_denied (nur bei eingeloggten Nutzern sinnvoll)
      await logAudit({
        action: "access_denied",
        actorUserId: user?.id ?? null,
        actorEmail: user?.emailAddresses?.[0]?.emailAddress ?? null,
        target: routeKey,
        detail: { reason: "FORBIDDEN_ROLE" }
      });
      return (
        <div className="card p-6 text-sm text-yellow-400">
          Angemeldet, aber deine Rolle erlaubt keinen Zugriff.
        </div>
      );
    }

    // Nicht eingeloggt
    if (err?.message === "UNAUTHORIZED_NOT_LOGGED_IN") {
      return (
        <div className="card p-6 text-sm text-red-400">
          Nicht angemeldet. Bitte einloggen.
        </div>
      );
    }

    // Unerwartet
    return (
      <div className="card p-6 text-sm text-red-400">
        Unerwarteter Fehler beim Zugriffscheck.
      </div>
    );
  }
}

