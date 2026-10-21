// Lint config for the video project (Remotion: React rendered to video).
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**", "out/**", "assets/generated/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["scripts/**", "record/**"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
