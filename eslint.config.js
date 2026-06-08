import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "url";
import path from "path";
import eslintConfigPrettier from "eslint-config-prettier";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

export default tseslint.config(
  { ignores: ["dist", ".next"] },
  ...compat.extends("next/core-web-vitals"),
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "react/no-unescaped-entities": "off",
    },
  },
  eslintConfigPrettier,
);
