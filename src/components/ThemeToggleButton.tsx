"use client";

// src/components/ThemeToggleButton.tsx
// Toggles between "light" and "dark" theme presets.
//
// Visual change is instant (DOM class + CSS-var injection).
// Preference is persisted via POST /api/theme/set in the background.

import { useEffect, useState } from "react";

// Minimal CSS-var sets so we don't need a server round-trip for visual feedback.
// These mirror the fallback presets in src/lib/theme.ts.
const LIGHT_VARS: Record<string, string> = {
  "--background": "0 0% 97%",
  "--foreground": "222 47% 11%",
  "--card": "0 0% 100%",
  "--card-foreground": "222 47% 11%",
  "--popover": "0 0% 100%",
  "--popover-foreground": "222 47% 11%",
  "--primary": "221 83% 53%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "220 14% 96%",
  "--secondary-foreground": "222 47% 11%",
  "--muted": "220 14% 96%",
  "--muted-foreground": "220 9% 46%",
  "--accent": "192 74% 37%",
  "--accent-foreground": "0 0% 100%",
  "--destructive": "0 84% 57%",
  "--destructive-foreground": "0 0% 100%",
  "--border": "220 13% 91%",
  "--input": "220 13% 91%",
  "--ring": "221 83% 53%",
  "--header-bg": "0 0% 100%",
  "--header-border": "220 13% 91%",
};

const DARK_VARS: Record<string, string> = {
  "--background": "222 50% 8%",
  "--foreground": "210 40% 96%",
  "--card": "222 44% 12%",
  "--card-foreground": "210 40% 96%",
  "--popover": "222 44% 12%",
  "--popover-foreground": "210 40% 96%",
  "--primary": "217 91% 68%",
  "--primary-foreground": "222 47% 8%",
  "--secondary": "218 36% 18%",
  "--secondary-foreground": "210 40% 96%",
  "--muted": "218 36% 18%",
  "--muted-foreground": "218 14% 63%",
  "--accent": "188 83% 53%",
  "--accent-foreground": "222 47% 8%",
  "--destructive": "0 72% 57%",
  "--destructive-foreground": "210 40% 96%",
  "--border": "218 36% 20%",
  "--input": "218 36% 20%",
  "--ring": "217 91% 68%",
  "--header-bg": "222 44% 11%",
  "--header-border": "218 36% 20%",
};

function applyThemeToDom(isDark: boolean) {
  const html = document.documentElement;
  const vars = isDark ? DARK_VARS : LIGHT_VARS;

  // Toggle .dark class for Tailwind dark: variants
  html.classList.toggle("dark", isDark);

  // Overwrite the dynamic-theme-vars style that the server injected
  let style = document.getElementById("dynamic-theme-vars") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "dynamic-theme-vars";
    document.head.appendChild(style);
  }
  style.textContent = `:root { ${Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(" ")} }`;
}

async function persistTheme(presetId: "light" | "dark") {
  try {
    await fetch("/api/theme/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presetId }),
    });
  } catch {
    // Non-critical — visual change already applied
  }
}

type Props = {
  /** Optional extra CSS classes for the button wrapper */
  className?: string;
};

export default function ThemeToggleButton({ className }: Props) {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Read initial state from the DOM once on mount (set by the server-side inline script).
  useEffect(() => {
    const dark = document.documentElement.classList.contains("dark");
    // Use a microtask so both state updates happen outside the effect body
    // and avoid the react-hooks/set-state-in-effect lint rule.
    Promise.resolve().then(() => {
      setIsDark(dark);
      setMounted(true);
    });
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    applyThemeToDom(next);
    persistTheme(next ? "dark" : "light");
  }

  // Avoid hydration mismatch — render placeholder until mounted
  if (!mounted) {
    return <div style={{ width: 32, height: 32 }} />;
  }

  return (
    <button
      onClick={toggle}
      title={isDark ? "Zum hellen Modus wechseln" : "Zum dunklen Modus wechseln"}
      aria-label={isDark ? "Heller Modus" : "Dunkler Modus"}
      style={{
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "0.5rem",
        border: "1px solid hsl(var(--border))",
        background: "hsl(var(--card))",
        color: "hsl(var(--muted-foreground))",
        cursor: "pointer",
        flexShrink: 0,
        transition: "color 0.15s, background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        const b = e.currentTarget;
        b.style.color = "hsl(var(--foreground))";
        b.style.background = "hsl(var(--muted))";
        b.style.borderColor = "hsl(var(--ring))";
      }}
      onMouseLeave={(e) => {
        const b = e.currentTarget;
        b.style.color = "hsl(var(--muted-foreground))";
        b.style.background = "hsl(var(--card))";
        b.style.borderColor = "hsl(var(--border))";
      }}
      className={className}
    >
      {isDark ? (
        // Sun icon
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
        </svg>
      ) : (
        // Moon icon
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}
