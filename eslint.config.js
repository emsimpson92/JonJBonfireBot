import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    rules: {
      curly: ["error", "all"],
      "brace-style": ["error", "stroustrup", { allowSingleLine: false }],
    },
  }
);
