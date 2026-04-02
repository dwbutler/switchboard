// @ts-check
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  // ── global ignores ───────────────────────────────────────────────────────────
  {
    ignores: ["dist/**", "node_modules/**"],
  },

  // ── TypeScript source files ───────────────────────────────────────────────
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    extends: [
      ...tseslint.configs.recommended,
    ],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    languageOptions: {
      parserOptions: {
        project: path.join(__dirname, "tsconfig.json"),
        tsconfigRootDir: __dirname,
      },
    },
    settings: {
      react: {
        // Ink uses React 19; suppress version-detection warnings
        version: "19",
      },
    },
    rules: {
      // ── TypeScript ──────────────────────────────────────────────────────
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // ── React / Ink ─────────────────────────────────────────────────────
      // Ink renders to the terminal, not the DOM — prop-types are irrelevant
      "react/prop-types": "off",
      // JSX transform is configured in tsconfig (jsxImportSource: react)
      "react/react-in-jsx-scope": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
