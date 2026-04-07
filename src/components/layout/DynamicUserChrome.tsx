// /workspace/familiehake/src/components/layout/DynamicUserChrome.tsx
import { currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import AdminErrorBanner from "@/components/AdminErrorBanner";
import CommandMenu from "@/components/CommandMenu";
import Header from "@/components/Header";
import { getSessionInfo } from "@/lib/auth";
import {
  getActiveTheme,
  getThemeCssVars,
  getThemePresetById,
  THEME_PRESET_COOKIE,
} from "@/lib/theme";

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

export default async function DynamicUserChrome({
  clerkEnabled,
  signInUrl,
}: DynamicUserChromeProps) {
  if (!clerkEnabled) {
    return <Header clerkEnabled={false} signInUrl={signInUrl} />;
  }

  const session = await getSessionInfo();
  const isSignedIn = Boolean(session?.signedIn);
  const cookieStore = await cookies();
  const presetFromCookie = cookieStore.get(THEME_PRESET_COOKIE)?.value ?? null;
  const cookiePreset = getThemePresetById(presetFromCookie);
  const user = cookiePreset || !isSignedIn ? null : await currentUser();
  const activeTheme = cookiePreset ?? (await getActiveTheme(user?.id ?? null));
  const themeCssVars = getThemeCssVars(activeTheme);
  const isAdmin = Boolean(
    isSignedIn && (session.isSuperAdmin || session.roles.some((role) => role.name === "admin"))
  );

  return (
    <>
      <style id="dynamic-theme-vars">{`:root { ${cssVarsToString(themeCssVars)} }`}</style>
      <AdminErrorBanner isAdmin={isAdmin} />
      <Header clerkEnabled={isSignedIn} signInUrl={signInUrl} />
      {isSignedIn ? <CommandMenu /> : null}
    </>
  );
}
