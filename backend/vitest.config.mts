import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      JWT_LECTURER_SECRET: "l".repeat(32),
      JWT_STUDENT_SECRET: "s".repeat(32),
      CORS_ORIGINS: "http://localhost:3000",
    },
    testTimeout: 30_000,
    hookTimeout: 180_000, // first run downloads a MongoDB binary
    fileParallelism: false,
  },
});