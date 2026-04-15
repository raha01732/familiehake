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

// Theme-IDs die eine dunkle Palette nutzen → .dark-Klasse benötigen
const DARK_THEME_IDS = new Set(["dark", "mid"]);

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
  const isDark = DARK_THEME_IDS.has(activeTheme.id);
  const isAdmin = Boolean(
    isSignedIn && (session.isSuperAdmin || session.roles.some((role) => role.name === "admin"))
  );

  return (
    <>
      {/*
        Inline-Script: Setzt .dark sofort auf <html> bevor CSS gerendert wird.
        Das verhindert einen kurzen "Flash" des falschen Themes (FOUC).
      */}
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `(function(){var d=document.documentElement;d.classList.toggle("dark",${isDark});})();`,
        }}
      />
      {/* CSS-Variablen des aktiven Themes in :root injizieren */}
      <style id="dynamic-theme-vars">{`:root { ${cssVarsToString(themeCssVars)} }`}</style>
      <AdminErrorBanner isAdmin={isAdmin} />
      <Header clerkEnabled={isSignedIn} signInUrl={signInUrl} />
      {isSignedIn ? <CommandMenu /> : null}
    </>
  );
}
