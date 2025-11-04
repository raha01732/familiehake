// eslint.config.mjs
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import unusedImports from "eslint-plugin-unused-imports";

/**
 * Ignorierte Pfade (ersetzt .eslintignore in ESLint 9)
 */
const ignores = [
  "node_modules/",
  ".next/",
  "out/",
  "dist/",
  "coverage/",
  ".vercel/",
  "**/*.d.ts",
];

export default [
  // 0) Ignorierliste
  { ignores },

  // 1) Basis-Regeln für JS
  js.configs.recommended,

  // 2) TypeScript/TSX – NICHT type-aware (kein parserOptions.project)
  {
    files: ["**/*.{ts,tsx}"],
    // wichtiger Teil: kein Type-Checking → keine parserServices nötig
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        // KEIN project: [...]  -> sonst wären type-aware Regeln aktiv
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      // TS-Plugin (ohne type-aware Preset)
      "@typescript-eslint": tseslint.plugin,
      "@next/next": nextPlugin,
      "react-hooks": reactHooks,
      "unused-imports": unusedImports,
    },
    // Regeln: Next + Hooks + „unused imports/vars“
    rules: {
      // TS-Empfehlungen ohne Type-Info
      ...tseslint.configs.recommended.rules,

      // Next.js
      ...nextPlugin.configs.recommended.rules,

      // React Hooks
      ...reactHooks.configs.recommended.rules,

      // Aufräumen
      "unused-imports/no-unused-imports": "warn",
      "unused-imports/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
    // ersetzt früheres --reportUnusedDisableDirectives
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },

  // 3) JS/JSX – eigene kleine Ergänzungen
  {
    files: ["**/*.{js,jsx,cjs,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // 4) Optionale Entschärfungen für Konfigurationsdateien (falls gewünscht)
  {
    files: ["eslint.config.mjs", "**/*.config.{js,cjs,mjs}"],
    rules: {
      // hier könntest du bei Bedarf Regeln lockern/abschalten
    },
  },
];
