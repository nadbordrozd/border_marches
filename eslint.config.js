import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

// Sources of nondeterminism and DOM access that pure game logic must avoid.
const coreRestrictions = {
  "no-restricted-globals": [
    "error",
    { name: "Date", message: "src/core is deterministic: no Date." },
    { name: "window", message: "src/core has no DOM." },
    { name: "document", message: "src/core has no DOM." },
    { name: "performance", message: "src/core is deterministic." },
    { name: "crypto", message: "Use the seeded RNG in src/core/rng.ts." },
  ],
  "no-restricted-properties": [
    "error",
    {
      object: "Math",
      property: "random",
      message: "Use the seeded RNG in src/core/rng.ts.",
    },
  ],
};

export default tseslint.config(
  // `.claude/**` holds agent worktrees (other checkouts of this repo);
  // tools/ and art/ are the studio-managed, zero-dependency asset pipeline.
  {
    ignores: [
      "dist",
      "node_modules",
      ".claude/**",
      ".beads/**",
      ".orchestration/**",
      "tools/**",
      "art/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["src/core/**/*.ts", "src/data/**/*.ts"],
    rules: coreRestrictions,
  },
  {
    // In tests a wrong `!` fails the test loudly, which is what we want.
    files: ["tests/**/*.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
