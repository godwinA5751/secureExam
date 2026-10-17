import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 180_000, // first run downloads a MongoDB binary
    fileParallelism: false,
  },
});