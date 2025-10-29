import { currentUser } from "@clerk/nextjs/server";

export const metadata = { title: "Debug Role" };

export default async function DebugRolePage() {
  const user = await currentUser();
  return (
    <pre className="card p-4 text-xs overflow-auto">
      {JSON.stringify({
        signedIn: !!user,
        userId: user?.id,
        primaryEmail: user?.emailAddresses?.[0]?.emailAddress,
        publicMetadata: user?.publicMetadata,
        inferredRole: (user?.publicMetadata as any)?.role ?? "member"
      }, null, 2)}
    </pre>
  );
}
