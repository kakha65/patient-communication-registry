import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: { globals: { ...globals.browser } },
    rules: { "no-unused-vars": ["error", { argsIgnorePattern: "^_" }] }
  }
];
