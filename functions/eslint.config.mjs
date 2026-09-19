// Konfigurasi ESLint untuk Cloud Functions (format flat).
//
// Kenapa ada file ini: ESLint menelusuri folder induk mencari konfigurasi.
// Proyek Next.js di atas sudah memakai `eslint.config.mjs` (flat config),
// sehingga ESLint di sini ikut beralih ke mode flat dan menolak flag `--ext`
// dari skrip bawaan Firebase — yang membuat `firebase deploy` gagal di tahap
// predeploy. File ini menghentikan penelusuran itu dengan konfigurasi sendiri.

import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: ["lib/**", "generated/**", "node_modules/**", "*.config.mjs", ".eslintrc.js"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ["./tsconfig.json"],
        sourceType: "module",
      },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      quotes: ["error", "double"],
      semi: ["error", "always"],
    },
  },
];
