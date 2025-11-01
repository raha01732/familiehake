import { getSessionInfo } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { describeLevel, PERMISSION_LEVELS, type PermissionLevel } from "@/lib/rbac";

export async function RoleGate({
  routeKey,
  minimumLevel = PERMISSION_LEVELS.READ,
  children
}: {
  routeKey: string;
  minimumLevel?: PermissionLevel;
  children: React.ReactNode;
}) {
  const session = await getSessionInfo();

  if (!session.signedIn) {
    return (
      <div className="card p-6 text-sm text-red-400">
        Nicht angemeldet. Bitte einloggen.
      </div>
    );
  }

  if (session.isSuperAdmin) {
    return <>{children}</>;
  }

  const level = session.permissions[routeKey] ?? PERMISSION_LEVELS.NONE;
  const allowed = level >= minimumLevel;

  if (allowed) {
    return <>{children}</>;
  }

  try {
    await logAudit({
      action: "access_denied",
      actorUserId: session.userId,
      actorEmail: session.email,
      target: routeKey,
      detail: {
        reason: "FORBIDDEN_ROLE",
        required_level: describeLevel(minimumLevel),
        actual_level: describeLevel(level),
        roles: session.roles.map((r) => r.name),
      },
    });
  } catch {
    // Audit-Fehler schlucken – Zugriff soll trotzdem verweigert werden
  }

  return (
    <div className="card p-6 text-sm text-yellow-400">
      Angemeldet, aber deine Rolle erlaubt keinen Zugriff.
    </div>
  );
}

