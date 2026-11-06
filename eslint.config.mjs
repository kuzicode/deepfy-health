import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      complexity: ["warn", 10],
      "max-depth": ["warn", 3],
      "max-params": ["warn", 4],
      "max-lines-per-function": ["warn", { max: 80, skipBlankLines: true, skipComments: true }],
    },
  },
);
