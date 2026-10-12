// Lint config for shared packages and scripts. Apps keep their framework configs.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "apps/**", "brand/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/scripts/**", "**/test/**", "scripts/**"],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
