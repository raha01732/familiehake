// /workspace/familiehake/src/components/layout/DynamicUserChrome.tsx
import AdminErrorBanner from "@/components/AdminErrorBanner";
import CommandMenu from "@/components/CommandMenu";
import Header from "@/components/Header";
import { getSessionInfo } from "@/lib/auth";
import { getActiveTheme, getThemeCssVars } from "@/lib/theme";

export const dynamic = "force-dynamic";

type DynamicUserChromeProps = {
  clerkEnabled: boolean;
  signInUrl: string;
};

function cssVarsToString(vars: Record<string, string>) {
  return Object.entries(vars)
    .map(([key, value]) => `${key}: ${value};`)
    .join(" ");
}

export default async function DynamicUserChrome({ clerkEnabled, signInUrl }: DynamicUserChromeProps) {
  if (!clerkEnabled) {
    return <Header clerkEnabled={false} signInUrl={signInUrl} />;
  }

  const session = await getSessionInfo();
  const isSignedIn = Boolean(session?.signedIn);
  const activeTheme = await getActiveTheme(session.userId ?? null);
  const themeCssVars = getThemeCssVars(activeTheme);
  const isAdmin = Boolean(isSignedIn && (session.isSuperAdmin || session.roles.some((role) => role.name === "admin")));

  return (
    <>
      <style id="dynamic-theme-vars">{`:root { ${cssVarsToString(themeCssVars)} }`}</style>
      <AdminErrorBanner isAdmin={isAdmin} />
      <Header clerkEnabled={isSignedIn} signInUrl={signInUrl} />
      {isSignedIn ? <CommandMenu /> : null}
    </>
  );
}
