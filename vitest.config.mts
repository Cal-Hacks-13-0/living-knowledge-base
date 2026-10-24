import { defineConfig } from "vitest/config";
import path from "node:path";

const dirname = import.meta.dirname;

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Several test files share one SQLite file (prisma/test.db) and reset
    // its rows in beforeEach; running files in parallel causes cross-file
    // races against that shared DB, so force sequential execution.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
});
