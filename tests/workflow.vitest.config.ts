import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { preserveSymlinks: true },
  test: { include: ["tests/workflow.test.ts"], pool: "threads", poolOptions: { threads: { singleThread: true } } },
});
