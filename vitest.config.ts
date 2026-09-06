import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "convex/**/*.test.ts"],
    exclude: ["node_modules/**", "work/**"],
  },
});
